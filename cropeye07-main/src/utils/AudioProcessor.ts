/**
 * AudioProcessor - AudioWorklet-based audio processing
 * Converts browser Int16 PCM to Float32 for playback
 * Handles 16kHz input and 24kHz output
 */

export interface AudioConfig {
  inputSampleRate: number; // 16000 Hz
  outputSampleRate: number; // 24000 Hz
  channelCount: number; // 1 (mono)
  bitDepth: number; // 16-bit
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private inputContext: AudioContext | null = null;
  private inputStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private outputNode: AudioNode | null = null;
  private inputNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;

  private config: AudioConfig = {
    inputSampleRate: 16000,
    outputSampleRate: 24000,
    channelCount: 1,
    bitDepth: 16,
  };

  private onInputData?: (data: Int16Array) => void;
  private onOutputData?: (data: Float32Array) => void;

  /**
   * Initialize audio input (16kHz, 16-bit PCM Mono)
   */
  async startInput(
    onData: (data: Int16Array) => void
  ): Promise<MediaStream> {
    try {
      this.onInputData = onData;

      // Request microphone access
      this.inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.inputSampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create AudioContext for input
      this.inputContext = new AudioContext({
        sampleRate: this.config.inputSampleRate,
      });

      // Create source from microphone stream
      this.inputNode = this.inputContext.createMediaStreamSource(this.inputStream);

      // Use ScriptProcessorNode for PCM conversion (fallback if AudioWorklet not available)
      if (this.inputContext.createScriptProcessor) {
        const bufferSize = 4096;
        this.scriptProcessor = this.inputContext.createScriptProcessor(
          bufferSize,
          this.config.channelCount,
          this.config.channelCount
        );

        this.scriptProcessor.onaudioprocess = (event) => {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0); // Mono

          // Convert Float32 to Int16 PCM
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Clamp to [-1, 1] and convert to 16-bit integer
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }

          if (this.onInputData) {
            this.onInputData(int16Data);
          }
        };

        this.inputNode.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.inputContext.destination);
      } else {
        throw new Error('ScriptProcessorNode not supported');
      }

      return this.inputStream;
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new Error(
          'Microphone permission denied. Please allow microphone access to use voice features.'
        );
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found.');
      } else {
        throw new Error(`Failed to start audio input: ${error.message}`);
      }
    }
  }

  /**
   * Initialize audio output (24kHz, 16-bit PCM Mono)
   */
  async startOutput(
    onData: (data: Float32Array) => void
  ): Promise<void> {
    try {
      this.onOutputData = onData;

      // Create AudioContext for output
      this.audioContext = new AudioContext({
        sampleRate: this.config.outputSampleRate,
      });

      // Try to use AudioWorklet if available
      try {
        // Load AudioWorklet processor
        await this.audioContext.audioWorklet.addModule(
          new URL('/audio-processor-worklet.js', import.meta.url)
        );

        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          'audio-processor',
          {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [this.config.channelCount],
          }
        );

        this.workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audio-data' && this.onOutputData) {
            this.onOutputData(event.data.data);
          }
        };

        this.workletNode.connect(this.audioContext.destination);
      } catch (workletError) {
        console.warn('AudioWorklet not available, using fallback:', workletError);
        // Fallback: Use ScriptProcessorNode
        const bufferSize = 4096;
        const processor = this.audioContext.createScriptProcessor(
          bufferSize,
          0,
          this.config.channelCount
        );

        processor.onaudioprocess = (event) => {
          const outputBuffer = event.outputBuffer;
          const outputData = outputBuffer.getChannelData(0);

          if (this.onOutputData) {
            this.onOutputData(outputData);
          }
        };

        this.outputNode = processor;
        this.outputNode.connect(this.audioContext.destination);
      }
    } catch (error: any) {
      throw new Error(`Failed to start audio output: ${error.message}`);
    }
  }

  /**
   * Play PCM audio data (24kHz Float32)
   */
  async playPCM(data: Float32Array): Promise<void> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      return;
    }

    try {
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create buffer from PCM data
      const buffer = this.audioContext.createBuffer(
        this.config.channelCount,
        data.length,
        this.config.outputSampleRate
      );

      // Copy data to buffer
      const channelData = buffer.getChannelData(0);
      channelData.set(data);

      // Create source and play
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start(0);
    } catch (error) {
      console.error('Error playing PCM audio:', error);
    }
  }

  /**
   * Stop audio input
   */
  stopInput(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.inputNode) {
      this.inputNode.disconnect();
      this.inputNode = null;
    }

    if (this.inputContext && this.inputContext.state !== 'closed') {
      this.inputContext.close();
      this.inputContext = null;
    }

    if (this.inputStream) {
      this.inputStream.getTracks().forEach((track) => track.stop());
      this.inputStream = null;
    }

    this.onInputData = undefined;
  }

  /**
   * Stop audio output
   */
  stopOutput(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.outputNode) {
      this.outputNode.disconnect();
      this.outputNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.onOutputData = undefined;
  }

  /**
   * Stop all audio processing
   */
  stop(): void {
    this.stopInput();
    this.stopOutput();
  }

  /**
   * Get current input stream
   */
  getInputStream(): MediaStream | null {
    return this.inputStream;
  }

  /**
   * Check if input is active
   */
  isInputActive(): boolean {
    return this.inputStream !== null && this.inputContext !== null;
  }

  /**
   * Check if output is active
   */
  isOutputActive(): boolean {
    return this.audioContext !== null;
  }
}
