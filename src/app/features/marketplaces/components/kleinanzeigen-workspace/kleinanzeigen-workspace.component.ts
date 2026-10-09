import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideExternalLink as ExternalLink,
  LucideFileText as FileText,
  LucideSparkles as Sparkles,
  LucideStore as Store,
} from '@lucide/angular';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';

@Component({
  selector: 'app-kleinanzeigen-workspace',
  imports: [RouterLink, LucideDynamicIcon, CardComponent, BadgeComponent],
  templateUrl: './kleinanzeigen-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KleinanzeigenWorkspaceComponent {
  readonly storeIcon = Store;
  readonly fileTextIcon = FileText;
  readonly sparklesIcon = Sparkles;
  readonly externalLinkIcon = ExternalLink;
}
