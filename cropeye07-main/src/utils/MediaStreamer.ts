/**
 * MediaStreamer - High-performance screen capture at 1 FPS
 * Downscales frames to 768px JPEG to save bandwidth for farmers
 */

export interface FrameCapture {
  base64: string;
  timestamp: number;
  width: number;
  height: number;
}

export class MediaStreamer {
  private screenStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private captureInterval: number | null = null;
  private isCapturing: boolean = false;
  private frameRate: number = 1; // 1 FPS
  private maxWidth: number = 768; // Downscale to 768px for bandwidth efficiency

  constructor() {
    this.initializeCanvas();
  }

  private initializeCanvas(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.maxWidth;
    this.canvas.height = (this.maxWidth * 9) / 16; // 16:9 aspect ratio
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: false,
      alpha: false,
    });
  }

  /**
   * Request screen capture permission and start streaming
   */
  async startCapture(): Promise<MediaStream> {
    try {
      // Request screen share with 1 FPS constraint
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 1, max: 1 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        } as MediaTrackConstraints,
        audio: false,
      });

      // Create video element to receive the stream
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.screenStream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not created'));
          return;
        }

        this.videoElement.onloadedmetadata = () => {
          // Adjust canvas size based on video aspect ratio
          if (this.canvas && this.videoElement) {
            const aspectRatio = this.videoElement.videoHeight / this.videoElement.videoWidth;
            this.canvas.height = this.canvas.width * aspectRatio;
          }
          resolve();
        };

        this.videoElement.onerror = (error) => {
          reject(error);
        };

        // Fallback timeout
        setTimeout(() => {
          if (this.videoElement?.readyState >= 2) {
            resolve();
          } else {
            reject(new Error('Video element timeout'));
          }
        }, 3000);
      });

      // Handle stream end (user stops sharing)
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.stopCapture();
      };

      this.isCapturing = true;
      return this.screenStream;
    } catch (error: any) {
      this.isCapturing = false;

      if (error.name === 'NotAllowedError') {
        throw new Error(
          'Screen capture permission denied. Please allow screen sharing to use this feature.'
        );
      } else if (error.name === 'NotFoundError') {
        throw new Error('No screen capture source found.');
      } else {
        throw new Error(`Failed to start screen capture: ${error.message}`);
      }
    }
  }

  /**
   * Start periodic frame capture at 1 FPS
   */
  startFrameCapture(
    onFrame: (frame: FrameCapture) => void
  ): void {
    if (!this.isCapturing || !this.videoElement || !this.canvas || !this.ctx) {
      throw new Error('Screen capture not started. Call startCapture() first.');
    }

    const captureFrame = () => {
      if (!this.videoElement || !this.canvas || !this.ctx) return;

      try {
        // Draw video frame to canvas with downscaling
        this.ctx.drawImage(
          this.videoElement,
          0,
          0,
          this.canvas.width,
          this.canvas.height
        );

        // Convert to JPEG with quality 0.85 (good balance between size and quality)
        const base64 = this.canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

        const frame: FrameCapture = {
          base64,
          timestamp: Date.now(),
          width: this.canvas.width,
          height: this.canvas.height,
        };

        onFrame(frame);
      } catch (error) {
        console.error('Error capturing frame:', error);
      }
    };

    // Capture immediately, then at 1 FPS interval
    captureFrame();
    this.captureInterval = window.setInterval(captureFrame, 1000 / this.frameRate);
  }

  /**
   * Stop frame capture
   */
  stopFrameCapture(): void {
    if (this.captureInterval !== null) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }

  /**
   * Stop screen capture and cleanup
   */
  stopCapture(): void {
    this.isCapturing = false;
    this.stopFrameCapture();

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    if (this.canvas) {
      this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Get current screen stream
   */
  getStream(): MediaStream | null {
    return this.screenStream;
  }

  /**
   * Check if currently capturing
   */
  isActive(): boolean {
    return this.isCapturing;
  }

  /**
   * Get video element for preview
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }
}
