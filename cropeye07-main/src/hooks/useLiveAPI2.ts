/**
 * useLiveAPI2 - Production-ready WebSocket-based Live API hook
 * Uses Gemini 2.5 Flash with proper error handling and CORS workarounds
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { GEMINI_API_KEY, GEMINI_LIVE_MODEL, detectLanguage, type SupportedLanguage } from '../utils/geminiConfig';
import { MediaStreamer, type FrameCapture } from '../utils/MediaStreamer';
import { AudioProcessor } from '../utils/AudioProcessor';
import { BargeInHandler } from '../utils/BargeInHandler';
import { LiveBridge, type LiveBridgeState } from '../utils/LiveBridge';

// Agricultural System Prompt
const SYSTEM_PROMPT = `You are the CropEye.Ai Vision Expert. You are helping Indian farmers diagnose crop health via their screen.

1. DOMAIN: Expertise in Pests, Fungi, Nutrient Deficiency, and Weather.
2. LANGUAGE RECOGNITION:
   - If User speaks Marathi: Respond in simple Agri-Marathi (use 'कीड', 'रोग', 'खत').
   - If User speaks Hindi: Respond in rural-friendly Hindi.
   - If User speaks English: Respond in clear technical English.
3. CONTEXT: Watch the screen live. If you see a leaf with yellow spots, immediately explain what it is.
4. TONE: Empathetic, professional, and clear. Avoid complex jargon.
5. NO PREAMBLE: Start speaking the answer immediately. Do not say 'I am looking at your screen'.`;

interface LiveAPIState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
  detectedLanguage: SupportedLanguage;
  connectionStrength: 'excellent' | 'good' | 'fair' | 'poor';
  latency: number;
}

interface LiveAPICallbacks {
  onTranscript?: (text: string, language: SupportedLanguage) => void;
  onResponse?: (text: string, language: SupportedLanguage) => void;
  onAudioData?: (audioData: Float32Array) => void;
  onError?: (error: string) => void;
}

export const useLiveAPI2 = (
  callbacks: LiveAPICallbacks = {},
  selectedVoice: string = 'puck'
) => {
  const [state, setState] = useState<LiveAPIState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
    detectedLanguage: 'english',
    connectionStrength: 'poor',
    latency: 0,
  });

  const mediaStreamerRef = useRef<MediaStreamer | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const bargeInHandlerRef = useRef<BargeInHandler | null>(null);
  const liveBridgeRef = useRef<LiveBridge | null>(null);
  const apiKeyRef = useRef<string>(GEMINI_API_KEY);
  const frameIntervalRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Int16Array[]>([]);
  const isProcessingRef = useRef<boolean>(false);
  const bridgeStateRef = useRef<LiveBridgeState>('DISCONNECTED');

  // Initialize components
  useEffect(() => {
    mediaStreamerRef.current = new MediaStreamer();
    audioProcessorRef.current = new AudioProcessor();
    bargeInHandlerRef.current = new BargeInHandler({
      volumeThreshold: 0.3,
      checkInterval: 100,
      minDuration: 200,
    });

    // Initialize LiveBridge with WebSocket
    liveBridgeRef.current = new LiveBridge(
      {
        apiKey: GEMINI_API_KEY,
        model: GEMINI_LIVE_MODEL,
        temperature: 0.0, // Strictly factual
        thinkingBudget: 2048, // Enable thinking for disease diagnosis
        systemInstruction: SYSTEM_PROMPT,
      },
      {
        onStateChange: (newState) => {
          bridgeStateRef.current = newState;
          setState(prev => ({
            ...prev,
            isConnected: newState === 'READY' || newState === 'STREAMING',
            connectionStrength:
              newState === 'READY' || newState === 'STREAMING' ? 'excellent' :
              newState === 'SETUP' ? 'good' :
              newState === 'CONNECTING' ? 'fair' : 'poor',
          }));
        },
        onSetupComplete: () => {
          console.log('✅ LiveBridge setup complete');
        },
        onAudioChunk: async (chunk: Float32Array) => {
          // Play audio chunk directly
          if (audioProcessorRef.current) {
            await audioProcessorRef.current.playPCM(chunk);
          }
          callbacks.onAudioData?.(chunk);
          setState(prev => ({ ...prev, isSpeaking: true }));
        },
        onTextChunk: (text: string) => {
          const lang = detectLanguage(text);
          setState(prev => ({ ...prev, detectedLanguage: lang }));
          callbacks.onResponse?.(text, lang);
        },
        onError: (error: string) => {
          console.error('❌ LiveBridge error:', error);
          setState(prev => ({ ...prev, error }));
          callbacks.onError?.(error);
        },
        onLatencyUpdate: (latency: number) => {
          setState(prev => ({
            ...prev,
            latency,
            connectionStrength:
              latency < 100 ? 'excellent' :
              latency < 300 ? 'good' :
              latency < 500 ? 'fair' : 'poor',
          }));
        },
      }
    );

    return () => {
      // Cleanup will be handled by stop function
      if (liveBridgeRef.current) {
        liveBridgeRef.current.disconnect();
      }
      mediaStreamerRef.current?.stopCapture();
      audioProcessorRef.current?.stop();
      bargeInHandlerRef.current?.stop();
    };
  }, []);

  /**
   * Start live session - request permissions and begin streaming via WebSocket
   */
  const start = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      if (!apiKeyRef.current || !apiKeyRef.current.trim()) {
        throw new Error('API key not found. Please set VITE_GEMINI_API_KEY in .env file.');
      }

      // Try WebSocket first, fallback to REST if it fails
      let useWebSocket = false;
      if (liveBridgeRef.current) {
        try {
          await liveBridgeRef.current.connect();
          // Wait for SETUP to complete (with timeout)
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('WebSocket setup timeout - using REST fallback'));
            }, 10000);

            const checkState = () => {
              if (bridgeStateRef.current === 'READY' || bridgeStateRef.current === 'STREAMING') {
                clearTimeout(timeout);
                useWebSocket = true;
                resolve();
              } else if (bridgeStateRef.current === 'ERROR') {
                clearTimeout(timeout);
                reject(new Error('WebSocket connection failed - using REST fallback'));
              } else {
                setTimeout(checkState, 100);
              }
            };
            checkState();
          });
        } catch (wsError: any) {
          console.warn('⚠️ WebSocket failed, using REST API fallback:', wsError.message);
          useWebSocket = false;
        }
      }

      // Request both screen and microphone permissions simultaneously
      const [screenStream, audioStream] = await Promise.all([
        mediaStreamerRef.current!.startCapture(),
        audioProcessorRef.current!.startInput((data: Int16Array) => {
          if (useWebSocket && liveBridgeRef.current && bridgeStateRef.current === 'READY') {
            // Send directly to WebSocket
            liveBridgeRef.current.sendRealtimeInput({ audioChunk: data });
          } else {
            // Collect for REST API
            audioChunksRef.current.push(data);
            if (!isProcessingRef.current && audioChunksRef.current.length > 0) {
              isProcessingRef.current = true;
              setTimeout(() => {
                sendAudioToAPI();
                isProcessingRef.current = false;
              }, 500);
            }
          }
        }),
      ]);

      // Start barge-in detection
      await bargeInHandlerRef.current!.start(audioStream, () => {
        console.log('🛑 Barge-in detected - interrupting AI');
        if (useWebSocket && liveBridgeRef.current) {
          liveBridgeRef.current.sendInterrupt();
        }
        if (audioProcessorRef.current) {
          audioProcessorRef.current.stopOutput();
        }
        setState(prev => ({ ...prev, isSpeaking: false }));
      });

      // Start screen frame capture at 1 FPS
      mediaStreamerRef.current!.startFrameCapture((frame: FrameCapture) => {
        if (useWebSocket && liveBridgeRef.current && bridgeStateRef.current === 'READY') {
          liveBridgeRef.current.sendRealtimeInput({ imageFrame: frame.base64 });
        } else {
          sendFrameToAPI(frame);
        }
      });

      // Start audio output (for playing received audio chunks)
      await audioProcessorRef.current!.startOutput((data: Float32Array) => {
        callbacks.onAudioData?.(data);
      });

      setState(prev => ({
        ...prev,
        isConnected: true,
        isListening: true,
      }));

      // Initial screen analysis
      const initialFrame = await captureCurrentFrame();
      if (initialFrame) {
        if (useWebSocket && liveBridgeRef.current) {
          liveBridgeRef.current.sendRealtimeInput({ imageFrame: initialFrame.base64 });
        } else {
          sendFrameToAPI(initialFrame);
        }
      }
    } catch (error: any) {
      console.error('❌ Failed to start live session:', error);
      const errorMsg = error.message || 'Failed to start live session';
      setState(prev => ({ ...prev, error: errorMsg }));
      callbacks.onError?.(errorMsg);

      // Show user-friendly error messages in Marathi/Hindi
      if (error.name === 'NotAllowedError') {
        if (error.message.includes('screen')) {
          alert('कृपया स्क्रीन शेअर करण्याची परवानगी द्या.\n(Please allow screen sharing permission.)');
        } else if (error.message.includes('microphone')) {
          alert('कृपया मायक्रोफोनची परवानगी द्या.\n(Please allow microphone permission.)');
        }
      } else if (error.message?.includes('WebSocket')) {
        // WebSocket failed but REST will work, so just log
        console.log('ℹ️ Continuing with REST API fallback');
      }
    }
  }, [callbacks]);

  /**
   * Stop live session
   */
  const stop = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    // Disconnect WebSocket
    liveBridgeRef.current?.disconnect();

    mediaStreamerRef.current?.stopCapture();
    audioProcessorRef.current?.stop();
    bargeInHandlerRef.current?.stop();

    audioChunksRef.current = [];
    isProcessingRef.current = false;

    setState(prev => ({
      ...prev,
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      connectionStrength: 'poor',
      latency: 0,
    }));
  }, []);

  /**
   * Capture current screen frame
   */
  const captureCurrentFrame = async (): Promise<FrameCapture | null> => {
    if (!mediaStreamerRef.current) return null;

    const videoElement = mediaStreamerRef.current.getVideoElement();
    if (!videoElement || !videoElement.videoWidth) return null;

    // Create temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = (768 * videoElement.videoHeight) / videoElement.videoWidth;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    return {
      base64,
      timestamp: Date.now(),
      width: canvas.width,
      height: canvas.height,
    };
  };

  /**
   * Send audio chunk to API
   */
  const sendAudioToAPI = async (): Promise<void> => {
    if (!apiKeyRef.current || audioChunksRef.current.length === 0) return;

    try {
      // Combine audio chunks
      const totalLength = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedAudio = new Int16Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
        combinedAudio.set(chunk, offset);
        offset += chunk.length;
      }
      audioChunksRef.current = [];

      // Convert to base64
      const bytes = new Uint8Array(combinedAudio.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = btoa(binary);

      // Send to Gemini API using REST (WebSocket has CORS issues)
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      // Remove "models/" prefix if present, as it's added in the URL
      const modelName = GEMINI_LIVE_MODEL.startsWith('models/') ? GEMINI_LIVE_MODEL.replace('models/', '') : GEMINI_LIVE_MODEL;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKeyRef.current}&_t=${timestamp}&_r=${randomId}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        cache: 'no-store',
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{
              inlineData: {
                mimeType: 'audio/pcm',
                data: base64Audio,
              },
            }],
          }],
          generationConfig: {
            temperature: 0.0,
            topP: 0.1,
            topK: 1,
            maxOutputTokens: 2048,
            responseModalities: ['AUDIO'],
          },
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (reply) {
        const lang = detectLanguage(reply);
        setState(prev => ({ ...prev, detectedLanguage: lang }));
        callbacks.onResponse?.(reply, lang);

        // Use Web Speech API for TTS (fallback since audio response parsing is complex)
        await speakText(reply, lang);
      }
    } catch (error: any) {
      console.error('❌ Error sending audio:', error);
      if (error.message?.includes('403') || error.message?.includes('API key')) {
        setState(prev => ({ ...prev, error: 'Invalid API key. Please check VITE_GEMINI_API_KEY in .env file.' }));
      } else if (error.message?.includes('CORS')) {
        setState(prev => ({ ...prev, error: 'CORS error. Please check API key permissions.' }));
      }
      callbacks.onError?.(error.message || 'Failed to process audio');
    }
  };

  /**
   * Send screen frame to API
   */
  const sendFrameToAPI = async (frame: FrameCapture): Promise<void> => {
    if (!apiKeyRef.current) return;

    try {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      // Remove "models/" prefix if present, as it's added in the URL
      const modelName = GEMINI_LIVE_MODEL.startsWith('models/') ? GEMINI_LIVE_MODEL.replace('models/', '') : GEMINI_LIVE_MODEL;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKeyRef.current}&_t=${timestamp}&_r=${randomId}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        cache: 'no-store',
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{
              inlineData: {
                mimeType: 'image/jpeg',
                data: frame.base64,
              },
            }],
          }],
          generationConfig: {
            temperature: 0.0,
            topP: 0.1,
            topK: 1,
            maxOutputTokens: 2048,
          },
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (reply) {
        const lang = detectLanguage(reply);
        setState(prev => ({ ...prev, detectedLanguage: lang }));
        callbacks.onResponse?.(reply, lang);
        await speakText(reply, lang);
      }
    } catch (error: any) {
      console.error('❌ Error sending frame:', error);
      if (error.message?.includes('403')) {
        setState(prev => ({ ...prev, error: 'Invalid API key. Please check VITE_GEMINI_API_KEY.' }));
      }
    }
  };

  /**
   * Text-to-Speech using Web Speech API
   */
  const speakText = async (text: string, language: SupportedLanguage): Promise<void> => {
    if (!('speechSynthesis' in window)) return;

    return new Promise<void>((resolve) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const langMap: Record<SupportedLanguage, string> = {
        marathi: 'mr-IN',
        hindi: 'hi-IN',
        english: 'en-US',
      };
      utterance.lang = langMap[language] || 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      setState(prev => ({ ...prev, isSpeaking: true }));

      utterance.onend = () => {
        setState(prev => ({ ...prev, isSpeaking: false }));
        resolve();
      };

      utterance.onerror = () => {
        setState(prev => ({ ...prev, isSpeaking: false }));
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  return {
    ...state,
    start,
    stop,
    getVideoElement: () => mediaStreamerRef.current?.getVideoElement() || null,
  };
};
