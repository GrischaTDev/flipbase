import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { VintedBrandSearchService } from '../../platform-admin/services/vinted-brand-search.service';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import type { MarketplaceConnection } from '../models/marketplace.models';
import {
  flipbaseVintedListingFields,
  flipbaseVintedListingReviewContent,
  prepareFlipbaseVintedListingContent,
} from '../models/flipbase-vinted-listing-form';
import { vintedListingSourceContent } from '../models/vinted-listing-source';
import {
  parseVintedListingPhotoOptions,
  type VintedListingPhotoOptions,
} from '../models/vinted-listing-photo-options';
import {
  validateVintedListingEditor,
  vintedListingAccountIssue,
} from '../models/vinted-listing-editor-validation';
import { reviewVintedListingPublication } from '../models/vinted-listing-publication-review';
import { MarketplaceApiService } from './marketplace-api.service';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedActionOverviewHeaderStore } from './vinted-action-overview-header.store';
import { VintedListingDraftService } from './vinted-listing-draft.service';
import { VintedListingImageService } from './vinted-listing-image.service';
import { VintedListingJobService, type VintedListingJobIntent } from './vinted-listing-job.service';
import { VintedListingOperationStore } from './vinted-listing-operation.store';
import { VintedListingOriginalPhotoService } from './vinted-listing-original-photo.service';
import { VintedListingPhotoSourceService } from './vinted-listing-photo-source.service';

export interface VintedRelistingSubmission {
  readonly entry: MarketplaceEntry;
  readonly account: MarketplaceConnection;
  readonly title: string;
  readonly description: string;
  readonly descriptionKnown: boolean;
  readonly photoOptions: VintedListingPhotoOptions;
  readonly schedule: VintedListingJobIntent['schedule'];
  readonly delaySeconds: number;
  readonly requestId: string;
}

/** Ein bestätigter Relist-Auftrag gehört zur Anwendung, nicht zur Lebensdauer seines Formulars. */
@Injectable({ providedIn: 'root' })
export class VintedRelistingSubmissionService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly accounts = inject(MarketplaceApiService);
  private readonly drafts = inject(VintedListingDraftService);
  private readonly images = inject(VintedListingImageService);
  private readonly originals = inject(VintedListingOriginalPhotoService);
  private readonly photos = inject(VintedListingPhotoSourceService);
  private readonly jobs = inject(VintedListingJobService);
  private readonly brands = inject(VintedBrandSearchService);
  private readonly browser = inject(MarketplaceBrowserTestApiService);
  private readonly operations = inject(VintedListingOperationStore);
  private readonly overview = inject(VintedActionOverviewHeaderStore);

  start(input: VintedRelistingSubmission): Promise<void> {
    const submission = structuredClone(input);
    const userId = this.auth.currentUser()?.id;
    const target = submission.account;
    this.assertCurrent(userId, submission.entry, target);
    const options = parseVintedListingPhotoOptions(submission.photoOptions, []);
    return this.operations.prepareRelisting(submission.entry, async () => {
      const current = () => this.assertCurrent(userId, submission.entry, target);
      const authorize = async () => {
        current();
        const result = await this.accounts.listConnections(submission.entry.workspaceId);
        current();
        const account = result.connections.find(
          (value) => value.connectionId === target.connectionId,
        );
        if (
          !result.canManage ||
          !account ||
          vintedListingAccountIssue(account, submission.entry.workspaceId) ||
          account.status !== 'connected' ||
          account.externalAccountId !== target.externalAccountId
        )
          throw new Error('Die Kontofreigabe hat sich geändert.');
      };
      await authorize();
      await this.prepare(submission, target, options, current, authorize);
      await this.overview.refresh();
    });
  }

  private assertCurrent(
    userId: string | undefined,
    entry: MarketplaceEntry,
    target: MarketplaceConnection | undefined,
  ): void {
    const workspace = this.workspace.currentWorkspace();
    if (
      !userId ||
      this.auth.currentUser()?.id !== userId ||
      !workspace ||
      workspace.archived_at ||
      workspace.id !== entry.workspaceId ||
      !target ||
      target.status !== 'connected' ||
      vintedListingAccountIssue(target, entry.workspaceId) ||
      target.connectionId !== entry.connectionId ||
      !/^[1-9][0-9]{0,31}$/.test(entry.externalId ?? '')
    )
      throw new Error('Die Artikelauswahl oder Kontofreigabe hat sich geändert.');
  }

  private async prepare(
    submission: VintedRelistingSubmission,
    account: MarketplaceConnection,
    options: VintedListingPhotoOptions,
    current: () => void,
    authorize: () => Promise<void>,
  ): Promise<void> {
    const { entry } = submission;
    current();
    if (entry.currency !== 'EUR')
      throw new Error('Die Währung dieses Inserats wird nicht unterstützt.');
    let sourceContent = entry.listingContent?.categoryId ? vintedListingSourceContent(entry) : null;
    let photoUrls = entry.imageUrls?.length
      ? entry.imageUrls
      : entry.imageUrl
        ? [entry.imageUrl]
        : [];
    if (!sourceContent) {
      const token = this.auth.session()?.access_token;
      if (!token) throw new Error('Melde Dich erneut bei Flipbase an.');
      const source = await this.browser.readListingContent(
        { workspaceId: entry.workspaceId, connectionId: entry.connectionId },
        entry.id,
        account.externalAccountId!,
        token,
      );
      current();
      if (
        source.externalId !== entry.externalId ||
        source.externalAccountId !== account.externalAccountId
      )
        throw new Error('Die Artikelzuordnung hat sich geändert.');
      sourceContent = { ...source.content, aiPhoto: source.aiPhoto };
      photoUrls = source.photoUrls;
    }
    const content = prepareFlipbaseVintedListingContent({
      ...sourceContent,
      title: submission.title,
      description: submission.descriptionKnown ? submission.description : sourceContent.description,
    });
    const savedOriginals = await this.originals.read(
      { workspaceId: entry.workspaceId, connectionId: entry.connectionId },
      entry.externalId!,
    );
    current();
    const sources =
      savedOriginals ??
      photoUrls.map((previewUrl, index) => ({
        previewUrl,
        fileName: `photo-${index + 1}.jpg`,
      }));
    const files: File[] = [];
    for (const source of sources) {
      const blob = await this.photos.read(source.previewUrl, {
        workspaceId: entry.workspaceId,
        connectionId: entry.connectionId,
        entryId: entry.id,
      });
      current();
      files.push(new File([blob], source.fileName, { type: blob.type }));
    }
    const schema =
      content.categoryId === null
        ? null
        : flipbaseVintedListingFields(content.categoryId, content.categoryLabel, content);
    const errors = validateVintedListingEditor(
      content,
      files.map((file) => ({
        mimeType: file.type,
        byteSize: file.size,
      })),
      schema,
    );
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    current();
    let draft = await this.drafts.createRelisting(
      entry.workspaceId,
      content,
      entry.connectionId,
      submission.requestId,
      entry.externalId!,
    );
    current();
    if (draft.connectionId !== entry.connectionId || draft.relistExternalId !== entry.externalId)
      throw new Error('Der Relist-Entwurf gehört nicht zum gewählten Inserat.');
    if (JSON.stringify(draft.content) !== JSON.stringify(content)) {
      draft = await this.drafts.save(draft, content, entry.connectionId);
      current();
    }
    // Nach einer verlorenen Antwort kann bereits ein privater Teilstand existieren.
    const replaceIds = draft.images.map((image) => image.id);
    const imageIds: string[] = [];
    for (const [index, file] of files.entries()) {
      const previousIds = new Set(draft.images.map((image) => image.id));
      draft = await this.images.upload(draft, file, replaceIds[index]);
      current();
      const uploaded = draft.images.find((image) => !previousIds.has(image.id));
      if (!uploaded)
        throw new Error('Das hochgeladene Originalfoto konnte nicht zugeordnet werden.');
      imageIds.push(uploaded.id);
    }
    if (JSON.stringify(draft.images.map((image) => image.id)) !== JSON.stringify(imageIds)) {
      draft = await this.images.setOrder(draft, imageIds);
      current();
    }
    if (
      JSON.stringify(draft.photoOptions ?? { resize: null, crops: {} }) !== JSON.stringify(options)
    ) {
      draft = await this.images.savePhotoOptions(draft, options);
      current();
    }
    const [brands, permission, runtime, jobs] = await Promise.all([
      content.brandId === null
        ? Promise.resolve([])
        : this.brands.search(content.brandLabel.slice(0, 100), entry.workspaceId),
      this.jobs.readPermission(entry.workspaceId, entry.connectionId),
      this.browser.available(),
      this.jobs.list(entry.workspaceId, draft.id),
    ]);
    current();
    const review = reviewVintedListingPublication(
      { ...draft, content: flipbaseVintedListingReviewContent(draft.content) },
      schema!,
      brands,
      content.aiPhoto ?? false,
    );
    if (!review.ready)
      throw new Error(review.messages[0] ?? 'Die Artikeldaten sind unvollständig.');
    if (
      !runtime.available ||
      runtime.readOnly ||
      runtime.listingPublishingEnabled !== true ||
      permission.executionMode !== 'cloud'
    )
      throw new Error('Die Veröffentlichung ist für dieses Konto derzeit nicht verfügbar.');
    if (
      jobs.some((job) =>
        ['queued', 'paused', 'claimed', 'writing', 'outcome_unknown', 'confirmed'].includes(
          job.state,
        ),
      )
    )
      throw new Error(
        'Für dieses Inserat besteht bereits ein Auftrag. Prüfe die laufenden Aktionen.',
      );
    if (!permission.allowed) {
      const approved = await this.jobs.approve(
        entry.workspaceId,
        entry.connectionId,
        account.externalAccountId!,
      );
      current();
      if (!approved.allowed || approved.executionMode !== 'cloud')
        throw new Error('Die Inseratfreigabe konnte nicht bestätigt werden.');
    }
    if (submission.schedule && Date.parse(submission.schedule.scheduledAt) <= Date.now())
      throw new Error(
        'Der Termin liegt inzwischen in der Vergangenheit. Wähle einen neuen Termin.',
      );
    const intent: VintedListingJobIntent = {
      requestId: submission.requestId,
      action: 'publish',
      aiPhoto: content.aiPhoto ?? false,
      schedule: submission.schedule,
      relistDelaySeconds: submission.delaySeconds,
    };
    await authorize();
    current();
    const accepted = await this.jobs.enqueue(draft, intent);
    if (
      accepted.externalAccountId !== account.externalAccountId ||
      accepted.executionMode !== account.executionMode ||
      accepted.connectionId !== account.connectionId
    )
      throw new Error(
        'Die Auftragsantwort passt nicht zu Deinem Zielkonto. Prüfe den Auftragsverlauf.',
      );
  }
}
