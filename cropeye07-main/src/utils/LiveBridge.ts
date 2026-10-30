/**
 * LiveBridge - WebSocket state machine for Gemini Live API
 * Handles SETUP, REALTIME_INPUT, and SERVER_CONTENT states
 */

export type LiveBridgeState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'SETUP'
  | 'READY'
  | 'STREAMING'
  | 'ERROR';

export interface LiveBridgeConfig {
  apiKey: string;
  model: string;
  temperature: number;
  thinkingBudget: number;
  systemInstruction: string;
}

export interface LiveBridgeCallbacks {
  onStateChange?: (state: LiveBridgeState) => void;
  onSetupComplete?: () => void;
  onAudioChunk?: (chunk: Float32Array) => void;
  onTextChunk?: (text: string) => void;
  onError?: (error: string) => void;
  onLatencyUpdate?: (latency: number) => void;
}

export class LiveBridge {
  private ws: WebSocket | null = null;
  private state: LiveBridgeState = 'DISCONNECTED';
  private config: LiveBridgeConfig;
  private callbacks: LiveBridgeCallbacks;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start with 1 second
  private reconnectTimer: number | null = null;
  private latency: number = 0;
  private lastPingTime: number = 0;
  private sessionId: string | null = null;

  constructor(config: LiveBridgeConfig, callbacks: LiveBridgeCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Connect to Gemini Live API via WebSocket
   */
  async connect(): Promise<void> {
    if (this.state === 'CONNECTING' || this.state === 'READY' || this.state === 'STREAMING') {
      console.warn('Already connected or connecting');
      return;
    }

    this.setState('CONNECTING');

    try {
      // Gemini Live API WebSocket endpoint
      // Note: Direct WebSocket may have CORS issues - may need proxy in production
      // Format: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=API_KEY
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.config.apiKey}`;

      console.log('🔵 Connecting to Gemini Live API WebSocket...');
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.sendSetup();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.callbacks.onError?.('WebSocket connection error');
        this.setState('ERROR');
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        this.setState('DISCONNECTED');

        // Auto-reconnect with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.callbacks.onError?.('Max reconnection attempts reached');
        }
      };
    } catch (error: any) {
      console.error('❌ Failed to connect:', error);
      this.callbacks.onError?.(error.message || 'Failed to connect');
      this.setState('ERROR');
      throw error;
    }
  }

  /**
   * Send SETUP message to initialize the session
   */
  private sendSetup(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const setupMessage = {
      setup: {
        model: this.config.model,
        generation_config: {
          temperature: this.config.temperature,
          thinking_budget: this.config.thinkingBudget,
          response_modalities: ['AUDIO'],
        },
        system_instruction: {
          parts: [
            {
              text: this.config.systemInstruction,
            },
          ],
        },
      },
    };

    console.log('📤 Sending SETUP message');
    this.ws.send(JSON.stringify(setupMessage));
    this.setState('SETUP');
  }

  /**
   * Send realtime input (audio or image)
   */
  sendRealtimeInput(data: {
    audioChunk?: Int16Array;
    imageFrame?: string; // Base64 JPEG
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready for realtime input');
      return;
    }

    if (this.state !== 'READY' && this.state !== 'STREAMING') {
      console.warn('Bridge not ready for realtime input, state:', this.state);
      return;
    }

    const mediaChunks: any[] = [];

    if (data.audioChunk) {
      // Convert Int16Array to base64
      const base64Audio = this.int16ArrayToBase64(data.audioChunk);
      mediaChunks.push({
        mime_type: 'audio/pcm',
        data: base64Audio,
      });
    }

    if (data.imageFrame) {
      mediaChunks.push({
        mime_type: 'image/jpeg',
        data: data.imageFrame,
      });
    }

    if (mediaChunks.length === 0) {
      return;
    }

    const message = {
      realtime_input: {
        media_chunks: mediaChunks,
      },
    };

    try {
      this.ws.send(JSON.stringify(message));
      this.setState('STREAMING');
    } catch (error) {
      console.error('❌ Error sending realtime input:', error);
      this.callbacks.onError?.('Failed to send realtime input');
    }
  }

  /**
   * Send interrupt signal for barge-in
   */
  sendInterrupt(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const interruptMessage = {
      realtime_input: {
        interrupt: true,
      },
    };

    console.log('🛑 Sending interrupt');
    this.ws.send(JSON.stringify(interruptMessage));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      // Handle SETUP response
      if (data.setup) {
        console.log('✅ SETUP complete');
        this.sessionId = data.setup.session_id;
        this.setState('READY');
        this.callbacks.onSetupComplete?.();
        return;
      }

      // Handle server content (audio/text responses)
      if (data.server_content) {
        this.handleServerContent(data.server_content);
        return;
      }

      // Handle error
      if (data.error) {
        console.error('❌ Server error:', data.error);
        this.callbacks.onError?.(data.error.message || 'Server error');
        this.setState('ERROR');
        return;
      }

      // Handle latency/ping
      if (data.ping) {
        this.handlePing();
        return;
      }
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
    }
  }

  /**
   * Handle server content (audio/text chunks)
   */
  private handleServerContent(content: any): void {
    // Handle audio chunks
    if (content.model_turn?.parts) {
      for (const part of content.model_turn.parts) {
        if (part.inline_data?.mime_type === 'audio/pcm') {
          // Convert base64 to Float32Array
          const audioData = this.base64ToFloat32Array(part.inline_data.data);
          this.callbacks.onAudioChunk?.(audioData);
        } else if (part.text) {
          this.callbacks.onTextChunk?.(part.text);
        }
      }
    }

    // Handle text chunks
    if (content.model_turn?.text) {
      this.callbacks.onTextChunk?.(content.model_turn.text);
    }
  }

  /**
   * Handle ping for latency measurement
   */
  private handlePing(): void {
    const now = Date.now();
    if (this.lastPingTime > 0) {
      this.latency = now - this.lastPingTime;
      this.callbacks.onLatencyUpdate?.(this.latency);
    }
    this.lastPingTime = now;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
      console.log(`🔄 Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('DISCONNECTED');
  }

  /**
   * Set state and notify callbacks
   */
  private setState(newState: LiveBridgeState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange?.(newState);
    }
  }

  /**
   * Get current state
   */
  getState(): LiveBridgeState {
    return this.state;
  }

  /**
   * Get current latency
   */
  getLatency(): number {
    return this.latency;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Convert Int16Array to base64
   */
  private int16ArrayToBase64(array: Int16Array): string {
    const bytes = new Uint8Array(array.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 to Float32Array
   */
  private base64ToFloat32Array(base64: string): Float32Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Convert bytes to Float32 (assuming 16-bit PCM)
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0; // Normalize to [-1, 1]
    }

    return float32Array;
  }
}
