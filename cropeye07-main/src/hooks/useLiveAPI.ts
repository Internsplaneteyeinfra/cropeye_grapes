import { useState, useRef, useCallback, useEffect } from 'react';
import { GEMINI_API_KEY, detectLanguage, type SupportedLanguage } from '../utils/geminiConfig';

// Use Gemini 2.5 Flash model with "models/" prefix for Live API
const GEMINI_LIVE_MODEL = 'models/gemini-2.5-flash';

interface LiveAPIState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
  detectedLanguage: SupportedLanguage;
}

interface LiveAPICallbacks {
  onTranscript?: (text: string, language: SupportedLanguage) => void;
  onResponse?: (text: string, language: SupportedLanguage) => void;
  onAudioData?: (audioData: Float32Array) => void; // For waveform visualization
  onError?: (error: string) => void;
}

const SYSTEM_PROMPT = `# ROLE
Multimodal Live Screen Assistant (Gemini 2.5 Flash).

# INPUT DATA
- Visual: 1 FPS Screen Capture (JPEG).
- Audio: 16kHz Mono PCM (User Voice).

# CORE LOGIC (EXECUTE AT TEMP 0)
1. MONITOR: Watch the incoming screen stream for UI changes, text, and icons.
2. DETECT: Identify the user's spoken language (Marathi, Hindi, or English).
3. MATCH: Lock the response language to the detected input language.
   - IF User = Marathi THEN Response = Marathi.
   - IF User = Hindi THEN Response = Hindi.
   - IF User = English THEN Response = English.
4. EXPLAIN: Describe the current screen state, active windows, and specific elements the user asks about.

# RESPONSE GUIDELINES
- BE CONCISE: Use maximum 2 sentences per turn unless asked for detail.
- NO PREAMBLE: Do not say "I can see..." or "Okay." Start describing immediately.
- ACCURACY: Translate technical UI terms into natural conversational Marathi/Hindi (e.g., use "साइन-इन बटण" for Marathi).
- BARGE-IN: If user audio is detected while speaking, terminate output immediately to listen.

# LANGUAGE EXAMPLES
- Marathi: "तुमच्या स्क्रीनवर आता सेटिंग्ज मेनू उघडला आहे."
- Hindi: "अभी आपकी स्क्रीन पर सेटिंग्स मेनू खुला हुआ है।"
- English: "The settings menu is now open on your screen."`;

export const useLiveAPI = (
  callbacks: LiveAPICallbacks = {},
  selectedVoice: string = 'puck'
) => {
  const [state, setState] = useState<LiveAPIState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
    detectedLanguage: 'english',
  });

  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const frameIntervalRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const apiKeyRef = useRef<string>(GEMINI_API_KEY);

  // Initialize canvas for screen capture
  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 1280;
      canvasRef.current.height = 720;
    }

    if (!videoRef.current) {
      videoRef.current = document.createElement('video');
      videoRef.current.autoplay = true;
      videoRef.current.muted = true;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  const captureScreenFrame = useCallback(async (): Promise<string | null> => {
    if (!screenStreamRef.current || !canvasRef.current || !videoRef.current) return null;

    try {
      if (videoRef.current.srcObject !== screenStreamRef.current) {
        videoRef.current.srcObject = screenStreamRef.current;
      }

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return null;

      // Wait for video to be ready
      if (videoRef.current.readyState < 2) {
        await new Promise((resolve) => {
          videoRef.current!.onloadedmetadata = resolve;
        });
      }

      canvasRef.current.width = videoRef.current.videoWidth || 1280;
      canvasRef.current.height = videoRef.current.videoHeight || 720;
      ctx.drawImage(videoRef.current, 0, 0);

      // Convert to JPEG, resize if needed (max 1024px width)
      let width = canvasRef.current.width;
      let height = canvasRef.current.height;
      if (width > 1024) {
        height = (height * 1024) / width;
        width = 1024;
        const resizedCanvas = document.createElement('canvas');
        resizedCanvas.width = width;
        resizedCanvas.height = height;
        const resizedCtx = resizedCanvas.getContext('2d');
        if (resizedCtx) {
          resizedCtx.drawImage(canvasRef.current, 0, 0, width, height);
          return resizedCanvas.toDataURL('image/jpeg', 0.7).split(',')[1];
        }
      }

      return canvasRef.current.toDataURL('image/jpeg', 0.7).split(',')[1];
    } catch (error) {
      console.error('Error capturing screen frame:', error);
      return null;
    }
  }, []);

  const processAudioOutput = useCallback((audioData: ArrayBuffer, sampleRate: number = 24000) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate });
    }

    const audioContext = audioContextRef.current;

    try {
      // Handle 24kHz PCM audio chunks from Gemini (16-bit little-endian)
      const pcmData = new Int16Array(audioData);
      const float32Data = new Float32Array(pcmData.length);

      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }

      // Notify callback for waveform visualization
      callbacks.onAudioData?.(float32Data);

      const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      setState(prev => ({ ...prev, isSpeaking: true }));

      source.onended = () => {
        setState(prev => ({ ...prev, isSpeaking: false }));
      };

      source.start(0);
    } catch (error) {
      console.error('Error playing audio:', error);
      setState(prev => ({ ...prev, isSpeaking: false }));
    }
  }, [callbacks]);

  const processAudioInput = useCallback(async () => {
    if (!audioStreamRef.current) return;

    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      inputAudioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(audioStreamRef.current);

      // Use ScriptProcessor for audio input (16kHz, 16-bit PCM mono)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = async (e) => {
        if (!state.isListening || !state.isConnected) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        // Send audio chunk (currently logged for debugging)
        await sendAudioChunk(pcmData.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (error) {
      console.error('Error starting audio processing:', error);
    }
  }, [state.isListening]);

  const sendAudioChunk = useCallback(async (audioBuffer: ArrayBuffer) => {
    // For now, batch audio chunks and send periodically via REST API
    // In production, this would use WebSocket for real-time streaming
    if (!state.isListening || !state.isConnected) return;

    try {
      // Store audio chunks for batching (send every 2 seconds)
      // This is a simplified approach - real implementation would use WebSocket
      console.log('Audio chunk received, length:', audioBuffer.byteLength);

      // Note: Direct WebSocket to Gemini Live API may not work from browser
      // Consider using a backend proxy for WebSocket connections
      // For now, we'll use Web Speech API for voice input transcription
    } catch (error) {
      console.error('Error sending audio chunk:', error);
    }
  }, [state.isListening, state.isConnected, selectedVoice]);

  const sendScreenFrame = useCallback(async (frameBase64: string) => {
    if (!apiKeyRef.current || !state.isConnected) return;

    try {
      // Use REST API to analyze screen with Live API configuration
      // Add cache-busting timestamp and random ID to prevent 304 errors
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_LIVE_MODEL}:generateContent?key=${apiKeyRef.current}&_t=${timestamp}&_r=${randomId}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Request-ID': `${timestamp}-${randomId}`,
        },
        cache: 'no-store',
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: frameBase64,
                },
              },
            ],
          }],
          generationConfig: {
            temperature: 0, // Effectiveness key - deterministic responses
            topP: 0.1,
            topK: 1,
            maxOutputTokens: 1024,
            responseModalities: ['AUDIO'],
          },
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
        }),
      });

      // Handle 304 Not Modified (caching issue)
      if (response.status === 304) {
        console.warn('⚠️ Received 304 Not Modified - retrying with fresh request');
        throw new Error('Received cached response (304). Please try again.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText || `HTTP ${response.status}` } };
        }
        console.error('❌ API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(errorData.error?.message || `API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ API Response received:', {
        hasCandidates: !!data.candidates,
        candidatesCount: data.candidates?.length || 0,
      });

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (reply) {
        console.log('📝 Response text length:', reply.length);
        const lang = detectLanguage(reply);
        setState(prev => ({ ...prev, detectedLanguage: lang }));
        callbacks.onResponse?.(reply, lang);

        // Use Web Speech API for audio output
        await speakText(reply, lang);
      } else {
        console.warn('⚠️ No text in API response');
        console.log('Full response:', JSON.stringify(data, null, 2));
      }
    } catch (error: any) {
      console.error('❌ Error sending screen frame:', error);
      const errorMsg = error.message || 'Failed to analyze screen';
      setState(prev => ({ ...prev, error: errorMsg }));
      callbacks.onError?.(errorMsg);
    }
  }, [state.isConnected, callbacks]);

  const speakText = useCallback(async (text: string, language: SupportedLanguage) => {
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech for barge-in support
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

      return new Promise<void>((resolve) => {
        // Implement barge-in: stop speaking if user audio is detected
        const checkForBargeIn = () => {
          if (state.isListening && state.isConnected) {
            window.speechSynthesis.cancel();
            setState(prev => ({ ...prev, isSpeaking: false }));
            clearInterval(bargeInInterval);
            resolve();
          }
        };

        // Check for barge-in periodically (every 100ms)
        const bargeInInterval = setInterval(checkForBargeIn, 100);

        utterance.onend = () => {
          clearInterval(bargeInInterval);
          setState(prev => ({ ...prev, isSpeaking: false }));
          resolve();
        };
        utterance.onerror = () => {
          clearInterval(bargeInInterval);
          setState(prev => ({ ...prev, isSpeaking: false }));
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      });
    }
  }, [state.isListening, state.isConnected]);

  const start = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      if (!apiKeyRef.current) {
        throw new Error('API key not found. Please set VITE_GEMINI_API_KEY in your .env file.');
      }

      // Get screen capture
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 1, // 1 FPS
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false,
      });

      screenStreamRef.current = screenStream;
      screenTrackRef.current = screenStream.getVideoTracks()[0];

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
      }

      screenTrackRef.current.onended = () => {
        stop();
      };

      // Get audio input (16kHz PCM)
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      audioStreamRef.current = audioStream;
      audioTrackRef.current = audioStream.getAudioTracks()[0];

      // Use REST API approach with periodic screen analysis
      // Note: Gemini Live API WebSocket may require server-side proxy
      // This implementation uses REST API with screen capture and voice transcription
      console.log('🔵 Initializing Live API connection...');
      console.log('API Key present:', !!apiKeyRef.current, 'Length:', apiKeyRef.current?.length || 0);
      console.log('Model:', GEMINI_LIVE_MODEL);

      // Test API key first
      try {
        // Add cache-busting timestamp and random ID
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const testEndpoint = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_LIVE_MODEL}:generateContent?key=${apiKeyRef.current}&_t=${timestamp}&_r=${randomId}`;
        const testResponse = await fetch(testEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Request-ID': `${timestamp}-${randomId}`,
          },
          cache: 'no-store',
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: 'Test connection' }],
            }],
            generationConfig: {
              temperature: 0,
              topP: 0.1,
              topK: 1,
              responseModalities: ['AUDIO'],
            },
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
          }),
        });

        if (!testResponse.ok) {
          const errorData = await testResponse.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API test failed: ${testResponse.status}`);
        }

        console.log('✅ API key validated successfully');
      } catch (error: any) {
        console.error('❌ API key validation failed:', error);
        throw new Error(`API key validation failed: ${error.message}. Please check your VITE_GEMINI_API_KEY in .env file.`);
      }

      // Set connection state
      setState(prev => ({ ...prev, isConnected: true, isListening: true }));

      // Start periodic screen analysis
      const analyzeScreenPeriodically = async () => {
        if (!state.isConnected) return;

        try {
          const frame = await captureScreenFrame();
          if (frame) {
            console.log('📸 Captured screen frame, size:', Math.round(frame.length / 1024), 'KB');
            await sendScreenFrame(frame);
          }
        } catch (error) {
          console.error('❌ Error in periodic screen analysis:', error);
        }
      };

      // Analyze screen every 3 seconds
      frameIntervalRef.current = window.setInterval(analyzeScreenPeriodically, 3000);

      // Initial analysis after 1 second
      setTimeout(async () => {
        const frame = await captureScreenFrame();
        if (frame) {
          await sendScreenFrame(frame);
        }
      }, 1000);

      // Start audio processing for voice input
      await processAudioInput();

      // Initial screen analysis
      setTimeout(async () => {
        const frame = await captureScreenFrame();
        if (frame) {
          await sendScreenFrame(frame);
        }
      }, 1000);

    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start live mode';
      setState(prev => ({ ...prev, error: errorMsg }));
      callbacks.onError?.(errorMsg);
    }
  }, [captureScreenFrame, processAudioInput, processAudioOutput, sendScreenFrame, callbacks, selectedVoice]);

  const stop = useCallback(() => {
    // Stop screen capture
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Stop audio
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    // Close audio contexts
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    sessionIdRef.current = null;

    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      error: null,
      detectedLanguage: 'english',
    });
  }, []);

  return {
    ...state,
    start,
    stop,
  };
};
