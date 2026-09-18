import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideBookOpen as BookOpen,
  LucideCamera as Camera,
  LucideCircleCheck as CircleCheck,
  LucideExternalLink as ExternalLink,
  LucideLightbulb as Lightbulb,
  LucideScanLine as ScanLine,
  LucideSun as Sun,
  LucideDynamicIcon,
} from '@lucide/angular';
import { PhotoGuideTab, PhotoGuideState } from '../../services/photo-guide-state';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-photo-guide',
  imports: [LucideDynamicIcon, BadgeComponent, ModalShellComponent],
  templateUrl: './photo-guide.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoGuideComponent {
  readonly state = input.required<PhotoGuideState>();
  readonly closed = output<void>();
  readonly tabs: readonly { id: PhotoGuideTab; label: string }[] = [
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
}
