import { Injectable } from '@angular/core';
import type { AccountScope } from '../models/marketplace.models';
import type { VintedListingReadResult } from '../models/vinted-listing-description';
import {
  parseMarketplaceSyncSourceResults,
  type MarketplaceSyncSourceResults,
} from '../models/marketplace-sync-results';

export type BrowserTestInput =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'type'; value: string }
  | { kind: 'press'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' };

export interface BrowserTestAvailability {
  available: boolean;
  readOnly: boolean;
  outdated?: boolean;
}

export interface ConfirmedVintedAccount {
  readonly externalAccountId: string;
  readonly username: string;
}

export interface VintedLoginCredentials {
  username: string;
  password: string;
}

export interface VintedListingEditFields {
  title: string;
  description: string;
  price: string;
}

export interface MarketplaceSyncProgress {
  id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  stage:
    | 'browser'
    | 'profile'
    | 'publications'
    | 'conversations'
    | 'sales'
    | 'persist'
    | 'cleanup'
    | null;
  errorCode: string | null;
  sourceResults?: MarketplaceSyncSourceResults;
}

export class VintedEditUnconfirmedError extends Error {
  constructor(subject: 'Artikel' | 'Profil' = 'Artikel') {
    super(
      `Vinted hat die Änderung nicht eindeutig bestätigt. Prüfe ${subject === 'Profil' ? 'Dein Profil' : 'den Artikel'} bei Vinted, bevor Du erneut speicherst.`,
    );
  }
}

export class VintedProfileConflictError extends Error {
  constructor() {
    super(
      'Dein Profiltext hat sich bei Vinted geändert. Lade die Kontodaten neu, bevor Du speicherst.',
    );
  }
}

export type VintedLoginResult =
  | 'submitted'
  | 'form_unavailable'
  | 'submission_unconfirmed'
  | 'interaction_required' // Vorheriger Worker während eines gestaffelten Updates.
  | 'already_authenticated'
  | 'verification_required';

export class BrowserTestSessionEndedError extends Error {
  constructor() {
    super('Browsersitzung wurde beendet');
  }
}

export class GoLoginApiLimitError extends Error {
  constructor() {
    super(
      'GoLogin meldet: Das kostenlose API-Anfragelimit dieses Schlüssels ist erreicht. Prüfe im GoLogin-Bereich „API & MCP“, welche API-Nutzung Dein Testzugang erlaubt. Die Vinted-Anmeldung wurde nicht gestartet.',
    );
  }
}

export class GoLoginProfileLimitError extends Error {
  constructor() {
    super(
      'Die maximale Zahl Deiner GoLogin-Profile ist erreicht. Lösche zuerst ein nicht mehr benötigtes Konto oder prüfe Dein Profilkontingent bei GoLogin. Die Vinted-Anmeldung wurde nicht gestartet.',
    );
  }
}

export class VintedLoginRejectedError extends Error {
  constructor() {
    super(
      'Vinted hat die Zugangsdaten abgelehnt. Prüfe Mitgliedsname oder E-Mail und Passwort und melde Dich erneut an.',
    );
  }
}

export class VintedLoginPendingError extends Error {
  constructor() {
    super('Vinted zeigt weiterhin das Anmeldeformular.');
  }
}

export class VintedVerificationRequiredError extends Error {
  constructor() {
    super('Vinted verlangt einen Bestätigungscode.');
  }
}

export class MarketplaceConnectionRemovalError extends Error {
  constructor() {
    super(
      'Das Konto konnte noch nicht vollständig gelöscht werden. Eine laufende Sitzung wird beendet oder das Browserprofil muss geprüft werden. Versuche es erneut.',
    );
  }
}

export class MarketplaceWorkerOutdatedError extends Error {
  constructor() {
    super('Der Browserdienst muss aktualisiert werden. Bitte versuche es danach erneut.');
  }
}

export class MarketplaceImportError extends Error {
  constructor(stage?: string) {
    if (stage === 'identity') {
      super(
        'Vinted bestätigt Deine Anmeldung nicht mehr. Öffne die Vinted-Anmeldung und melde Dich für dieses Konto erneut an.',
      );
      return;
    }
    const stageNames = new Map([
      ['navigation', 'beim Öffnen von Vinted'],
      ['profile', 'beim Lesen des Profils'],
      ['publications', 'beim Lesen der Inserate'],
      ['conversations', 'beim Lesen der Gesprächsliste'],
      ['messages', 'beim Lesen eines Gesprächsverlaufs'],
      ['transaction', 'beim Lesen einer Bestellung'],
      ['parse', 'beim Verarbeiten der Vinted-Daten'],
      ['browser', 'beim Start des Browsers'],
      ['sales', 'beim Abgleich der Verkäufe'],
      ['persist', 'beim Speichern der Kontodaten'],
      ['cleanup', 'beim Beenden des Browsers'],
      ['access', 'bei der erneuten Rechteprüfung'],
      ['interrupted', 'durch eine Unterbrechung des Browserdienstes'],
    ]);
    const detail = stage ? stageNames.get(stage) : undefined;
    super(
      detail
        ? `Die Aktualisierung ist ${detail} fehlgeschlagen. Bitte versuche es später erneut.`
        : 'Die Vinted-Daten konnten nicht vollständig aktualisiert werden. Prüfe die Verbindung und versuche es später erneut.',
    );
  }
}

export type VintedVerificationResult = 'submitted' | 'form_unavailable' | 'submission_unconfirmed';

const basePath = '/marketplace-browser/sessions';
const frameLimit = 512 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: 'root' })
export class MarketplaceBrowserTestApiService {
  async available(): Promise<BrowserTestAvailability> {
    try {
      const response = await fetch('/marketplace-browser/healthz', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
        return { available: false, readOnly: true };
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'ok' in body &&
        body.ok === true &&
        'readOnly' in body &&
        typeof body.readOnly === 'boolean'
      )
        return 'apiVersion' in body && body.apiVersion === 2
          ? { available: true, readOnly: body.readOnly }
          : { available: false, readOnly: true, outdated: true };
      return { available: false, readOnly: true };
    } catch {
      return { available: false, readOnly: true };
    }
  }

  async open(scope: AccountScope, accessToken: string): Promise<string> {
    const response = await this.post(basePath, scope, accessToken);
    if (response.status !== 201) {
      if (response.status === 409) {
        const body: unknown = await response.json().catch(() => null);
        if (
          typeof body === 'object' &&
          body !== null &&
          'code' in body &&
          body.code === 'browser_session_busy'
        )
          throw new Error(
            'Eine Browsersitzung läuft bereits oder wird beendet. Setze Deine offene Anmeldung fort oder warte auf den Abschluss der laufenden Sitzung.',
          );
      }
      if (response.status === 503) {
        const body: unknown = await response.json().catch(() => null);
        if (
          typeof body === 'object' &&
          body !== null &&
          'code' in body &&
          body.code === 'gologin_api_limit_reached'
        )
          throw new GoLoginApiLimitError();
        if (
          typeof body === 'object' &&
          body !== null &&
          'code' in body &&
          body.code === 'gologin_profile_limit_reached'
        )
          throw new GoLoginProfileLimitError();
      }
      throw new Error('Browsersitzung nicht verfügbar');
    }
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !uuidPattern.test(body.id)
    )
      throw new Error('Ungültige Browsersitzung');
    return body.id;
  }

  async identify(
    scope: AccountScope,
    sessionId: string,
    accessToken: string,
    allowPending = false,
  ): Promise<ConfirmedVintedAccount | null> {
    const response = await this.post(`${basePath}/${sessionId}/identify`, scope, accessToken);
    if (response.status === 410) throw new BrowserTestSessionEndedError();
    if (response.status === 422) {
      const body: unknown = await response.json().catch(() => null);
      if (
        typeof body === 'object' &&
        body !== null &&
        'code' in body &&
        body.code === 'vinted_login_pending'
      )
        throw new VintedLoginPendingError();
      if (
        typeof body === 'object' &&
        body !== null &&
        'code' in body &&
        body.code === 'vinted_login_rejected'
      )
        throw new VintedLoginRejectedError();
      if (
        typeof body === 'object' &&
        body !== null &&
        'code' in body &&
        body.code === 'vinted_verification_required'
      )
        throw new VintedVerificationRequiredError();
      if (allowPending) return null;
    }
    if (!response.ok) throw new Error('Vinted-Anmeldung konnte nicht bestätigt werden');
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('workspaceId' in body) ||
      body.workspaceId !== scope.workspaceId ||
      !('connectionId' in body) ||
      body.connectionId !== scope.connectionId ||
      !('externalAccountId' in body) ||
      typeof body.externalAccountId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(body.externalAccountId) ||
      !('username' in body) ||
      typeof body.username !== 'string' ||
      !body.username.trim() ||
      body.username.length > 120
    )
      throw new Error('Ungültige Vinted-Kontobestätigung');
    return { externalAccountId: body.externalAccountId, username: body.username };
  }

  async login(
    scope: AccountScope,
    sessionId: string,
    credentials: VintedLoginCredentials,
    accessToken: string,
  ): Promise<VintedLoginResult> {
    const response = await this.post(
      `${basePath}/${sessionId}/login`,
      { ...scope, credentials },
      accessToken,
    );
    if (response.status === 410) throw new BrowserTestSessionEndedError();
    if (!response.ok) throw new Error('Anmeldung konnte nicht bestätigt werden');
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('status' in body) ||
      (body.status !== 'submitted' &&
        body.status !== 'interaction_required' &&
        body.status !== 'form_unavailable' &&
        body.status !== 'submission_unconfirmed' &&
        body.status !== 'already_authenticated' &&
        body.status !== 'verification_required')
    )
      throw new Error('Ungültige Anmeldeantwort');
    return body.status;
  }

  async frame(scope: AccountScope, sessionId: string, accessToken: string): Promise<Blob> {
    const response = await this.post(`${basePath}/${sessionId}/frame`, scope, accessToken);
    if (response.status === 410) throw new BrowserTestSessionEndedError();
    if (!response.ok || response.headers.get('content-type') !== 'image/jpeg')
      throw new Error('Browserbild nicht verfügbar');
    const blob = await response.blob();
    if (blob.size < 4 || blob.size > frameLimit) throw new Error('Browserbild ist ungültig');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff ||
      bytes[bytes.length - 1] !== 0xd9
    )
      throw new Error('Browserbild ist ungültig');
    return blob;
  }

  async verify(
    scope: AccountScope,
    sessionId: string,
    code: string,
    accessToken: string,
  ): Promise<VintedVerificationResult> {
    const response = await this.post(
      `${basePath}/${sessionId}/verify`,
      { ...scope, code },
      accessToken,
    );
    if (response.status === 410) throw new BrowserTestSessionEndedError();
    if (!response.ok) throw new Error('Bestätigungscode konnte nicht gesendet werden');
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('status' in body) ||
      (body.status !== 'submitted' &&
        body.status !== 'form_unavailable' &&
        body.status !== 'submission_unconfirmed')
    )
      throw new Error('Ungültige Bestätigungsantwort');
    return body.status;
  }

  async input(
    scope: AccountScope,
    sessionId: string,
    input: BrowserTestInput,
    accessToken: string,
  ): Promise<void> {
    const response = await this.post(
      `${basePath}/${sessionId}/input`,
      { ...scope, input },
      accessToken,
    );
    if (response.status === 410) throw new BrowserTestSessionEndedError();
    if (!response.ok) throw new Error('Eingabe konnte nicht bestätigt werden');
  }

  async close(scope: AccountScope, sessionId: string, accessToken: string): Promise<void> {
    const response = await this.post(`${basePath}/${sessionId}/close`, scope, accessToken);
    if (response.status !== 204) throw new Error('Browser-Stopp konnte nicht bestätigt werden');
  }

  async deleteConnection(scope: AccountScope, accessToken: string): Promise<void> {
    if ((await this.available()).outdated) throw new MarketplaceWorkerOutdatedError();
    const response = await this.post('/marketplace-browser/connections/delete', scope, accessToken);
    if (response.status !== 204) throw new MarketplaceConnectionRemovalError();
  }

  async syncConnection(
    scope: AccountScope,
    accessToken: string,
    onProgress?: (progress: MarketplaceSyncProgress) => void,
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.post(
        '/marketplace-browser/connections/sync/start',
        scope,
        accessToken,
        15_000,
      );
    } catch {
      throw new MarketplaceImportError();
    }
    if (response.status === 404) throw new MarketplaceWorkerOutdatedError();
    if (response.status !== 202) throw new MarketplaceImportError();
    const started: unknown = await response.json();
    if (
      typeof started !== 'object' ||
      started === null ||
      !('id' in started) ||
      typeof started.id !== 'string' ||
      !uuidPattern.test(started.id)
    )
      throw new MarketplaceImportError();
    onProgress?.({ id: started.id, state: 'queued', stage: null, errorCode: null });
    let failedPolls = 0;
    for (let attempt = 0; attempt < 660; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      try {
        response = await this.post(
          '/marketplace-browser/connections/sync/status',
          { ...scope, operationId: started.id },
          accessToken,
          15_000,
        );
        if (!response.ok) throw new Error('Status nicht verfügbar');
        const value: unknown = await response.json();
        if (
          typeof value !== 'object' ||
          value === null ||
          !('id' in value) ||
          value.id !== started.id ||
          !('state' in value) ||
          !['queued', 'running', 'succeeded', 'failed'].includes(String(value.state))
        )
          throw new Error('Auftragsstatus ungültig');
        const progress: MarketplaceSyncProgress = {
          id: started.id,
          state: value.state as MarketplaceSyncProgress['state'],
          stage:
            'stage' in value && typeof value.stage === 'string'
              ? (value.stage as MarketplaceSyncProgress['stage'])
              : null,
          errorCode:
            'errorCode' in value && typeof value.errorCode === 'string' ? value.errorCode : null,
          ...('sourceResults' in value
            ? { sourceResults: parseMarketplaceSyncSourceResults(value.sourceResults) }
            : {}),
        };
        onProgress?.(progress);
        if (progress.state === 'succeeded') return;
        if (progress.state === 'failed')
          throw new MarketplaceImportError(progress.errorCode ?? undefined);
        failedPolls = 0;
      } catch (error) {
        if (error instanceof MarketplaceImportError) throw error;
        if (++failedPolls >= 3) throw new MarketplaceImportError();
      }
    }
    throw new MarketplaceImportError('interrupted');
  }

  async readListingEdit(
    scope: AccountScope,
    entryId: string,
    accessToken: string,
  ): Promise<VintedListingEditFields> {
    return (await this.readListingData(scope, entryId, accessToken)).fields;
  }

  async readListingData(
    scope: AccountScope,
    entryId: string,
    accessToken: string,
  ): Promise<VintedListingReadResult> {
    const response = await this.post(
      '/marketplace-browser/listings/edit/read',
      { ...scope, entryId },
      accessToken,
    );
    if (response.status === 404) throw new MarketplaceWorkerOutdatedError();
    if (!response.ok) throw new Error('Das Vinted-Formular konnte nicht geladen werden.');
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('fields' in body) ||
      typeof body.fields !== 'object' ||
      body.fields === null ||
      !('title' in body.fields) ||
      typeof body.fields.title !== 'string' ||
      !('description' in body.fields) ||
      typeof body.fields.description !== 'string' ||
      !('price' in body.fields) ||
      typeof body.fields.price !== 'string'
    )
      throw new Error('Das Vinted-Formular lieferte ungültige Daten.');
    return {
      fields: {
        title: body.fields.title,
        description: body.fields.description,
        price: body.fields.price,
      },
      cacheState: 'cache' in body && body.cache === 'pending' ? 'pending' : 'unconfirmed',
    };
  }

  async saveListingEdit(
    scope: AccountScope,
    entryId: string,
    fields: VintedListingEditFields,
    accessToken: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.post(
        '/marketplace-browser/listings/edit/save',
        { ...scope, entryId, fields },
        accessToken,
      );
    } catch {
      throw new VintedEditUnconfirmedError();
    }
    if (response.status === 404) throw new MarketplaceWorkerOutdatedError();
    if (!response.ok) throw new VintedEditUnconfirmedError();
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('status' in body) ||
      body.status !== 'confirmed'
    )
      throw new VintedEditUnconfirmedError();
  }

  async readProfileAbout(scope: AccountScope, accessToken: string): Promise<string> {
    const response = await this.post('/marketplace-browser/profile/edit/read', scope, accessToken);
    if (response.status === 404) throw new MarketplaceWorkerOutdatedError();
    if (!response.ok) throw new Error('Das Vinted-Profilformular konnte nicht geladen werden.');
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('about' in body) ||
      typeof body.about !== 'string'
    )
      throw new Error('Das Vinted-Profilformular lieferte ungültige Daten.');
    return body.about;
  }

  async saveProfileAbout(
    scope: AccountScope,
    about: string,
    accessToken: string,
    expectedAbout?: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.post(
        '/marketplace-browser/profile/edit/save',
        { ...scope, about, ...(expectedAbout !== undefined ? { expectedAbout } : {}) },
        accessToken,
      );
    } catch {
      throw new VintedEditUnconfirmedError('Profil');
    }
    if (response.status === 404) throw new MarketplaceWorkerOutdatedError();
    if (!response.ok) throw new VintedEditUnconfirmedError('Profil');
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'status' in body && body.status === 'conflict')
      throw new VintedProfileConflictError();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('status' in body) ||
      body.status !== 'confirmed'
    )
      throw new VintedEditUnconfirmedError('Profil');
  }

  private post(
    path: string,
    body: unknown,
    accessToken: string,
    timeoutMs = 90_000,
  ): Promise<Response> {
    return fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
}
