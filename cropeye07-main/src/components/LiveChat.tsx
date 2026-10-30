import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, X, Loader2, Volume2, VolumeX, Settings } from 'lucide-react';
import { useLiveAPI2 } from '../hooks/useLiveAPI2';
import { type SupportedLanguage } from '../utils/geminiConfig';

interface LiveChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_VOICES = [
  { value: 'puck', label: 'Puck' },
  { value: 'charon', label: 'Charon' },
];

const LiveChat: React.FC<LiveChatProps> = ({ isOpen, onClose }) => {
  const [transcripts, setTranscripts] = useState<Array<{ text: string; language: SupportedLanguage; timestamp: Date }>>([]);
  const [responses, setResponses] = useState<Array<{ text: string; language: SupportedLanguage; timestamp: Date }>>([]);
  const [screenPreview, setScreenPreview] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string>('puck');
  const [showSettings, setShowSettings] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformAnimationRef = useRef<number | null>(null);

  const { isConnected, isListening, isSpeaking, error, detectedLanguage, connectionStrength, latency, start, stop, getVideoElement } = useLiveAPI2(
    {
      onTranscript: (text, language) => {
        setTranscripts(prev => [...prev, { text, language, timestamp: new Date() }]);
      },
      onResponse: (text, language) => {
        setResponses(prev => [...prev, { text, language, timestamp: new Date() }]);
      },
      onAudioData: (audioData) => {
        // Update waveform visualization
        const samples = Array.from(audioData.slice(0, 100)); // Sample first 100 points
        setWaveformData(samples);
        drawWaveform(samples);
      },
      onError: (errorMsg) => {
        console.error('Live API Error:', errorMsg);
      },
    },
    selectedVoice
  );

  const drawWaveform = (samples: number[]) => {
    if (!waveformCanvasRef.current) return;

    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = width / samples.length;
    samples.forEach((sample, index) => {
      const x = index * step;
      const y = centerY + (sample * centerY * 0.8); // Scale amplitude

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  };

  useEffect(() => {
    if (isSpeaking && waveformData.length > 0) {
      // Animate waveform
      waveformAnimationRef.current = requestAnimationFrame(() => {
        drawWaveform(waveformData);
      });
    } else {
      if (waveformCanvasRef.current) {
        const ctx = waveformCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, waveformCanvasRef.current.width, waveformCanvasRef.current.height);
        }
      }
    }

    return () => {
      if (waveformAnimationRef.current) {
        cancelAnimationFrame(waveformAnimationRef.current);
      }
    };
  }, [isSpeaking, waveformData]);

  useEffect(() => {
    if (isConnected) {
      const videoElement = getVideoElement();
      if (videoElement && previewVideoRef.current) {
        // Get the stream from MediaStreamer
        const stream = videoElement.srcObject as MediaStream;
        if (stream) {
          previewVideoRef.current.srcObject = stream;
        }
      }
    } else if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  }, [isConnected, getVideoElement]);

  const handleStart = async () => {
    try {
      await start();
    } catch (error: any) {
      console.error('Failed to start:', error);
    }
  };

  const handleStop = () => {
    stop();
    if (previewVideoRef.current?.srcObject) {
      const stream = previewVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      previewVideoRef.current.srcObject = null;
    }
    setWaveformData([]);
  };

  const getLanguageLabel = (lang: SupportedLanguage): string => {
    switch (lang) {
      case 'marathi': return 'मराठी';
      case 'hindi': return 'हिंदी';
      case 'english': return 'English';
      default: return 'English';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-6xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              isConnected
                ? connectionStrength === 'excellent' ? 'bg-green-400'
                  : connectionStrength === 'good' ? 'bg-yellow-400'
                  : connectionStrength === 'fair' ? 'bg-orange-400'
                  : 'bg-red-400'
                : 'bg-gray-400'
            } ${isConnected ? 'animate-pulse' : ''}`} />
            <h2 className="text-xl font-bold">CropEye.Ai Live Assistant</h2>
            {detectedLanguage && (
              <span className="text-sm bg-white/20 px-2 py-1 rounded">
                {getLanguageLabel(detectedLanguage)}
              </span>
            )}
            {isConnected && latency > 0 && (
              <span className="text-xs bg-white/20 px-2 py-1 rounded">
                {latency}ms
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-gray-50 border-b border-gray-200 p-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Voice:</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={isConnected}
              >
                {AVAILABLE_VOICES.map(voice => (
                  <option key={voice.value} value={voice.value}>{voice.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left: Screen Preview & Controls */}
          <div className="w-1/3 flex flex-col gap-4">
            {/* Screen Preview */}
            <div className="bg-gray-900 rounded-lg overflow-hidden aspect-video relative">
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                className="w-full h-full object-contain"
              />
              {!isConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-400">
                  <div className="text-center">
                    <VideoOff className="w-12 h-12 mx-auto mb-2" />
                    <p>No screen capture</p>
                  </div>
                </div>
              )}
            </div>

            {/* Visual Wave-Pulse Indicator */}
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-white text-xs mb-2 text-center">AI Status</div>
              <div className="flex items-center justify-center h-20">
                <svg
                  width="200"
                  height="60"
                  viewBox="0 0 200 60"
                  className="w-full"
                >
                  {/* Waveform visualization */}
                  {isSpeaking ? (
                    <>
                      {/* Blue glow when speaking */}
                      <defs>
                        <linearGradient id="speakingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                          <stop offset="50%" stopColor="#60a5fa" stopOpacity="1" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
                        </linearGradient>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      {/* Animated wave */}
                      <path
                        d="M 0 30 Q 25 10, 50 30 T 100 30 T 150 30 T 200 30"
                        stroke="url(#speakingGradient)"
                        strokeWidth="3"
                        fill="none"
                        filter="url(#glow)"
                      >
                        <animate
                          attributeName="d"
                          values="M 0 30 Q 25 10, 50 30 T 100 30 T 150 30 T 200 30;M 0 30 Q 25 50, 50 30 T 100 30 T 150 30 T 200 30;M 0 30 Q 25 10, 50 30 T 100 30 T 150 30 T 200 30"
                          dur="1s"
                          repeatCount="indefinite"
                        />
                      </path>
                    </>
                  ) : isConnected ? (
                    <>
                      {/* Green glow when thinking */}
                      <defs>
                        <linearGradient id="thinkingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
                          <stop offset="50%" stopColor="#34d399" stopOpacity="1" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
                        </linearGradient>
                        <filter id="greenGlow">
                          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      {/* Pulsing circle */}
                      <circle
                        cx="100"
                        cy="30"
                        r="15"
                        fill="url(#thinkingGradient)"
                        filter="url(#greenGlow)"
                        opacity="0.8"
                      >
                        <animate
                          attributeName="r"
                          values="15;20;15"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.8;1;0.8"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    </>
                  ) : (
                    <text x="100" y="35" textAnchor="middle" fill="#6b7280" fontSize="12">
                      Waiting...
                    </text>
                  )}
                </svg>
              </div>
            </div>

            {/* Status Indicators */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <span className={`text-sm px-2 py-1 rounded ${
                  isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Listening:</span>
                <div className={`flex items-center gap-2 ${isListening ? 'text-green-600' : 'text-gray-400'}`}>
                  {isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                  <span className="text-sm">{isListening ? 'Active' : 'Inactive'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Speaking:</span>
                <div className={`flex items-center gap-2 ${isSpeaking ? 'text-blue-600' : 'text-gray-400'}`}>
                  {isSpeaking ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
                  <span className="text-sm">{isSpeaking ? 'Active' : 'Inactive'}</span>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-2">
              {!isConnected ? (
                <button
                  onClick={handleStart}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Video className="w-5 h-5" />
                  Start Live Session
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <VideoOff className="w-5 h-5" />
                  Stop Live Session
                </button>
              )}
            </div>
          </div>

          {/* Right: Transcripts & Responses */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Transcripts */}
            <div className="flex-1 bg-gray-50 rounded-lg p-4 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Your Speech
              </h3>
              <div className="space-y-2">
                {transcripts.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {isListening ? 'Listening...' : 'No transcripts yet'}
                  </p>
                ) : (
                  transcripts.map((transcript, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 shadow-sm">
                      <p className="text-sm">{transcript.text}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">
                          {getLanguageLabel(transcript.language)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {transcript.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Responses */}
            <div className="flex-1 bg-blue-50 rounded-lg p-4 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Assistant Response
              </h3>
              <div className="space-y-2">
                {responses.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {isSpeaking ? 'Speaking...' : 'No responses yet'}
                  </p>
                ) : (
                  responses.map((response, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 shadow-sm">
                      <p className="text-sm">{response.text}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">
                          {getLanguageLabel(response.language)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {response.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveChat;
