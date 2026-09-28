import { Injectable } from '@angular/core';
import type { AccountScope } from '../models/marketplace.models';

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
  constructor() {
    super(
      'Die Vinted-Daten konnten nicht vollständig aktualisiert werden. Prüfe die Verbindung und versuche es später erneut.',
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

  async syncConnection(scope: AccountScope, accessToken: string): Promise<void> {
    let response: Response;
    try {
      response = await this.post(
        '/marketplace-browser/connections/sync',
        scope,
        accessToken,
        180_000,
      );
    } catch {
      throw new MarketplaceImportError();
    }
    if (response.status === 404) throw new MarketplaceWorkerOutdatedError();
    if (!response.ok) throw new MarketplaceImportError();
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('observedAt' in body) ||
      typeof body.observedAt !== 'string' ||
      !('counts' in body) ||
      typeof body.counts !== 'object' ||
      body.counts === null
    )
      throw new MarketplaceImportError();
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
