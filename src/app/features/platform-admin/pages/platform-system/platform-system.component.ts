import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LucideActivity as Activity, LucideRefreshCw as RefreshCw } from '@lucide/angular';
import {
  PLATFORM_FEATURE_AREAS,
  PlatformFeatureArea,
  PlatformFeatureKey,
} from '../../../../core/models/platform-feature.model';
import { PlatformFeatureSwitchService } from '../../../../core/services/platform-feature-switch.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import {
  PlatformSystemHealth,
  cloudIpStatus,
  feedBotStatus,
  marketplaceWorkerStatus,
  operationsStatus,
  storageStatus,
  storageUsedPercent,
} from '../../models/platform-system-health';
import { PlatformSystemService } from '../../services/platform-system.service';

const REFRESH_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-platform-system',
  imports: [
    DatePipe,
    DecimalPipe,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    PageHeaderComponent,
    TextFieldComponent,
  ],
  templateUrl: './platform-system.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformSystemComponent implements OnInit {
  private readonly system = inject(PlatformSystemService);
  private readonly featureSwitches = inject(PlatformFeatureSwitchService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly systemIcon = Activity;
  readonly refreshIcon = RefreshCw;
  readonly areas = PLATFORM_FEATURE_AREAS;

  readonly health = signal<PlatformSystemHealth | null>(null);
  readonly loadedAt = signal(Date.now());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly switchError = signal<string | null>(null);
  readonly savingKey = signal<PlatformFeatureKey | null>(null);
  readonly messageDrafts = signal<Partial<Record<PlatformFeatureKey, string>>>({});

  readonly status = computed(() => {
    const health = this.health();
    if (!health) return null;
    const now = this.loadedAt();
    return {
      worker: marketplaceWorkerStatus(health, now),
      feedBot: feedBotStatus(health, now),
      storage: storageStatus(health, now),
      storagePercent: storageUsedPercent(health),
      operations: operationsStatus(health),
      cloudIps: cloudIpStatus(health),
    };
  });

  ngOnInit(): void {
    void this.load();
    const timer = setInterval(() => void this.load(), REFRESH_INTERVAL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [health] = await Promise.all([this.system.health(), this.featureSwitches.refresh(0)]);
      this.health.set(health);
      this.loadedAt.set(Date.now());
    } catch {
      this.error.set('Der Systemzustand konnte nicht geladen werden.');
    } finally {
      this.loading.set(false);
    }
  }

  isEnabled(area: PlatformFeatureArea): boolean {
    return this.featureSwitches.switchFor(area.key)?.enabled !== false;
  }

  messageFor(area: PlatformFeatureArea): string {
    return (
      this.messageDrafts()[area.key] ??
      this.featureSwitches.switchFor(area.key)?.maintenanceMessage ??
      ''
    );
  }

  setMessage(area: PlatformFeatureArea, value: string): void {
    this.messageDrafts.update((drafts) => ({ ...drafts, [area.key]: value }));
  }

  async toggle(area: PlatformFeatureArea): Promise<void> {
    if (this.savingKey()) return;
    const enable = !this.isEnabled(area);
    if (
      !enable &&
      !(await this.confirmDialog.frage({
        titel: `${area.label} für alle abschalten?`,
        text: `Alle Nutzer sehen statt ${area.label} eine Wartungsseite. Die Server-Dienste nehmen für diesen Bereich keine neuen Aufträge an, bis du ihn wieder einschaltest.`,
        bestaetigenText: 'Abschalten',
        abbrechenText: 'Abbrechen',
        gefahr: true,
      }))
    )
      return;
    this.savingKey.set(area.key);
    this.switchError.set(null);
    try {
      // Beim Wiedereinschalten wird der Wartungstext verworfen.
      await this.featureSwitches.set(
        area.key,
        enable,
        enable ? null : this.messageFor(area) || null,
      );
      this.messageDrafts.update((drafts) => {
        const next = { ...drafts };
        delete next[area.key];
        return next;
      });
    } catch {
      this.switchError.set(`${area.label} konnte nicht umgeschaltet werden.`);
    } finally {
      this.savingKey.set(null);
    }
  }
}
