import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  LucideBookOpen as BookOpen,
  LucideCamera as Camera,
  LucideCircleCheck as CircleCheck,
  LucideExternalLink as ExternalLink,
  LucideLightbulb as Lightbulb,
  LucideScanLine as ScanLine,
  LucideSun as Sun,
  LucideDynamicIcon,
  LucideX as X,
} from '@lucide/angular';
import { FotoguideTab, FotoguideZustand } from '../../services/fotoguide-zustand';

@Component({
  selector: 'app-fotoguide',
  imports: [LucideDynamicIcon],
  templateUrl: './fotoguide.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FotoguideComponent implements AfterViewInit {
  readonly zustand = input.required<FotoguideZustand>();
  readonly geschlossen = output<void>();
  readonly tabs: readonly { id: FotoguideTab; label: string }[] = [
    { id: 'aufnehmen', label: 'Fotos aufnehmen' },
    { id: 'ebay', label: 'eBay' },
    { id: 'kleinanzeigen', label: 'Kleinanzeigen' },
    { id: 'vinted', label: 'Vinted' },
  ];

  readonly bookIcon = BookOpen;
  readonly cameraIcon = Camera;
  readonly checkIcon = CircleCheck;
  readonly externalLinkIcon = ExternalLink;
  readonly lightbulbIcon = Lightbulb;
  readonly scanIcon = ScanLine;
  readonly sunIcon = Sun;
  readonly xIcon = X;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  schliessen(): void {
    this.dialog().nativeElement.close();
  }

  beiAbbrechen(event: Event): void {
    event.preventDefault();
    this.schliessen();
  }

  beiHintergrundKlick(event: PointerEvent): void {
    if (event.target === this.dialog().nativeElement) this.schliessen();
  }
}
