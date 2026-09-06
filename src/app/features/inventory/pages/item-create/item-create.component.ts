import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AiVisualScanResult } from '../../../../core/services/ai-assistant.service';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { ItemCreateModalComponent } from '../../components/item-create-modal/item-create-modal.component';

interface ItemCreateRouteState {
  readonly aiResult?: AiVisualScanResult;
}

@Component({
  selector: 'app-item-create',
  imports: [EntryPageLayoutComponent, ItemCreateModalComponent],
  templateUrl: './item-create.component.html',
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCreateComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly entryForm = viewChild.required(ItemCreateModalComponent);
  private readonly saved = signal(false);
  private readonly routeState = window.history.state as ItemCreateRouteState;

  ngAfterViewInit(): void {
    if (this.routeState.aiResult) this.entryForm().prefillWithAiResult(this.routeState.aiResult);
  }

  hasUnsavedChanges(): boolean {
    return !this.saved() && this.entryForm()?.hasUnsavedChanges();
  }

  isSaving(): boolean {
    return this.entryForm()?.isSaving() ?? false;
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) return;
    event.preventDefault();
  }

  itemCreated(): void {
    this.saved.set(true);
    this.returnToInventory();
  }

  returnToInventory(): void {
    void this.router.navigate(['/inventory']);
  }
}
