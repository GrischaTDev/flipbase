import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import {
  LucideAngularModule,
  Camera,
  Upload,
  Sparkles,
  CheckCircle2,
  X,
  RefreshCw,
  Tag,
  ShieldCheck,
  Zap,
} from 'lucide-angular';
import { AiAssistantService, AiVisualScanResult } from '../../../core/services/ai-assistant.service';

@Component({
  selector: 'app-ai-photo-scanner-modal',
  imports: [CurrencyPipe, LucideAngularModule],
  templateUrl: './ai-photo-scanner-modal.component.html',
  styleUrl: './ai-photo-scanner-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiPhotoScannerModalComponent implements OnDestroy {
  private readonly aiService = inject(AiAssistantService);

  readonly close = output<void>();
  readonly productDetected = output<AiVisualScanResult>();

  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  readonly cameraIcon = Camera;
  readonly uploadIcon = Upload;
  readonly sparklesIcon = Sparkles;
  readonly checkIcon = CheckCircle2;
  readonly closeIcon = X;
  readonly refreshIcon = RefreshCw;
  readonly tagIcon = Tag;
  readonly shieldIcon = ShieldCheck;
  readonly zapIcon = Zap;

  readonly activeTab = signal<'camera' | 'upload'>('upload');
  readonly isCameraActive = signal<boolean>(false);
  readonly cameraError = signal<string | null>(null);

  readonly previewImage = signal<string | null>(null);
  readonly isAnalyzing = signal<boolean>(false);
  readonly scanResult = signal<AiVisualScanResult | null>(null);

  private mediaStream: MediaStream | null = null;

  async startCamera(): Promise<void> {
    this.cameraError.set(null);
    this.activeTab.set('camera');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      if (this.videoElement) {
        this.videoElement.nativeElement.srcObject = this.mediaStream;
        await this.videoElement.nativeElement.play();
        this.isCameraActive.set(true);
      }
    } catch {
      this.cameraError.set('Kamerazugriff wurde abgelehnt oder ist auf diesem Gerät nicht verfügbar.');
      this.activeTab.set('upload');
    }
  }

  stopCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.isCameraActive.set(false);
  }

  capturePhoto(): void {
    if (!this.videoElement || !this.canvasElement) return;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      this.previewImage.set(dataUrl);
      this.stopCamera();
      this.analyzeCapturedImage(dataUrl, 'camera_capture.jpg');
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.previewImage.set(dataUrl);
      this.analyzeCapturedImage(dataUrl, file.name);
    };
    reader.readAsDataURL(file);
  }

  async analyzeCapturedImage(imageSrc: string, filename: string): Promise<void> {
    this.isAnalyzing.set(true);
    this.scanResult.set(null);

    try {
      const res = await this.aiService.analyzeImage(imageSrc, filename);
      res.previewImageUrl = imageSrc;
      this.scanResult.set(res);
    } catch (err) {
      console.error('Error analyzing image:', err);
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  resetScan(): void {
    this.previewImage.set(null);
    this.scanResult.set(null);
    if (this.activeTab() === 'camera') {
      this.startCamera();
    }
  }

  applyResult(): void {
    const res = this.scanResult();
    if (res) {
      this.productDetected.emit(res);
      this.close.emit();
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }
}
