import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ModalDialogDirective } from '../../../shared/directives/modal-dialog.directive';
import { LoggerService } from '../../../core/services/logger.service';
import {
  LucideDynamicIcon,
  LucideCamera as Camera,
  LucideX as X,
  LucideZap as Zap,
  LucideZapOff as ZapOff,
  LucideSwitchCamera as SwitchCamera,
  LucideSearch as Search,
  LucideCheckCircle2 as CheckCircle2,
  LucideAlertCircle as AlertCircle,
} from '@lucide/angular';

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(image: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
}

@Component({
  selector: 'app-barcode-scanner',
  imports: [ModalDialogDirective, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarcodeScannerComponent implements OnInit, OnDestroy {
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  readonly closed = output<void>();
  readonly detected = output<string>();

  readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('videoElement');

  readonly cameraIcon = Camera;
  readonly closeIcon = X;
  readonly torchOnIcon = Zap;
  readonly torchOffIcon = ZapOff;
  readonly switchIcon = SwitchCamera;
  readonly searchIcon = Search;
  readonly checkIcon = CheckCircle2;
  readonly alertIcon = AlertCircle;

  readonly isScanning = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasTorch = signal<boolean>(false);
  readonly isTorchOn = signal<boolean>(false);
  readonly facingMode = signal<'environment' | 'user'>('environment');
  readonly scannedResult = signal<string | null>(null);

  readonly manualEanControl = new FormControl('');

  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private barcodeDetector: any = null;

  async ngOnInit(): Promise<void> {
    await this.initBarcodeDetector();
    await this.startCamera();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private async initBarcodeDetector(): Promise<void> {
    if ('BarcodeDetector' in window) {
      try {
        this.barcodeDetector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
      } catch (e) {
        this.logger.warn('BarcodeDetector initialisation fallback', e);
      }
    }
  }

  async startCamera(): Promise<void> {
    this.stopCamera();
    this.errorMessage.set(null);
    this.isScanning.set(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamerazugriff wird von diesem Browser nicht unterstützt.');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode(),
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const video = this.videoRef()?.nativeElement;
      if (video) {
        video.srcObject = this.mediaStream;
        await video.play();
        this.checkTorchSupport();
        this.startDetectionLoop();
      }
    } catch (err: unknown) {
      this.isScanning.set(false);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.errorMessage.set('Kamerazugriff verweigert. Bitte Berechtigung im Browser erteilen.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this.errorMessage.set('Keine Kamera gefunden. Nutze bitte die manuelle Barcode-Eingabe.');
      } else {
        this.errorMessage.set(
          (err instanceof Error ? err.message : '') || 'Kamera konnte nicht gestartet werden.',
        );
      }
    }
  }

  private checkTorchSupport(): void {
    const track = this.mediaStream?.getVideoTracks()[0];
    if (track) {
      const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
      this.hasTorch.set(!!capabilities.torch);
    }
  }

  async toggleTorch(): Promise<void> {
    const track = this.mediaStream?.getVideoTracks()[0];
    if (!track || !this.hasTorch()) return;

    try {
      const newState = !this.isTorchOn();
      await (track as any).applyConstraints({
        advanced: [{ torch: newState }],
      });
      this.isTorchOn.set(newState);
    } catch (e) {
      this.logger.warn('Torch toggle failed', e);
    }
  }

  toggleFacingMode(): void {
    this.facingMode.update((mode) => (mode === 'environment' ? 'user' : 'environment'));
    this.startCamera();
  }

  private startDetectionLoop(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video || !this.barcodeDetector) return;

    const detect = async () => {
      if (!this.isScanning() || !video || video.readyState < 2) {
        this.animationFrameId = requestAnimationFrame(detect);
        return;
      }

      try {
        const barcodes = await this.barcodeDetector.detect(video);
        if (barcodes && barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          if (raw && raw.trim()) {
            this.handleSuccessfulScan(raw.trim());
            return;
          }
        }
      } catch {
        // detection tick skipped
      }

      this.animationFrameId = requestAnimationFrame(detect);
    };

    this.animationFrameId = requestAnimationFrame(detect);
  }

  private handleSuccessfulScan(code: string): void {
    this.scannedResult.set(code);
    if ('vibrate' in navigator) {
      navigator.vibrate([40, 30, 40]);
    }
    this.stopCamera();

    setTimeout(() => {
      this.detected.emit(code);
      this.closed.emit();
    }, 400);
  }

  onManualSubmit(): void {
    const val = this.manualEanControl.value?.trim();
    if (val) {
      this.handleSuccessfulScan(val);
    }
  }

  stopCamera(): void {
    this.isScanning.set(false);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }
}
