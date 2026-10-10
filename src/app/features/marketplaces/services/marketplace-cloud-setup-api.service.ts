import { Injectable } from '@angular/core';
import {
  parseCloudSetupResult,
  parseCloudSetupView,
  type CloudSetupRequest,
  type CloudSetupView,
  type CloudSetupResult,
} from '../models/marketplace-cloud-setup';

export const CLOUD_CAPACITY_MESSAGE = 'Aktuell sind keine freien Cloud-IPs vorhanden.';
export const CLOUD_CHECK_MESSAGE =
  'Die Cloud-IP-Verfügbarkeit konnte nicht geprüft werden. Bitte versuche es erneut.';
export const CLOUD_SWITCH_BLOCKED_MESSAGE =
  'Für dieses Konto läuft noch eine Aktion. Warte kurz oder beende sie und versuche den Wechsel erneut.';
export const CLOUD_PURCHASE_PENDING_MESSAGE =
  'Deine Cloud-IP wird noch bereitgestellt oder die Bestellung muss geprüft werden. Bitte versuche es in Kürze erneut.';
export const CLOUD_PURCHASE_FAILED_MESSAGE =
  'Die Cloud-IP konnte nicht nachgebucht werden. Bitte wende Dich an den Support.';
export const CLOUD_IP_LIMIT_MESSAGE =
  'Die Anzahl der Cloud-IPs für Deinen Arbeitsplatz ist ausgeschöpft.';
export const CLOUD_PRICE_LIMIT_MESSAGE =
  'Der aktuelle Anbieterpreis liegt über der freigegebenen Preisgrenze. Es wurde keine neue Cloud-IP bestellt.';

@Injectable({ providedIn: 'root' })
export class MarketplaceCloudSetupApiService {
  async available(workspaceId: string, token: string): Promise<boolean> {
    const response = await this.post('availability', { workspaceId }, token);
    if (!response.ok) throw new Error(CLOUD_CHECK_MESSAGE);
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('canSetup' in body) ||
      typeof body.canSetup !== 'boolean' ||
      Object.keys(body).length !== 1
    )
      throw new Error(CLOUD_CHECK_MESSAGE);
    return body.canSetup;
  }

  async begin(request: CloudSetupRequest, token: string): Promise<CloudSetupResult> {
    let blocked = false;
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const response = await this.post('begin', request, token);
        if (response.status === 409) {
          // Eine laufende Aktion des Kontos ist kein IP-Prüffehler.
          const failure: unknown = await response.json().catch(() => null);
          blocked =
            !!failure &&
            typeof failure === 'object' &&
            'code' in failure &&
            failure.code === 'cloud_switch_blocked';
        }
        if (!response.ok) throw new Error(CLOUD_CHECK_MESSAGE);
        const result = parseCloudSetupResult(await response.json(), request);
        if (result.status !== 'purchase_pending' || attempt === 7) return result;
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error(CLOUD_CHECK_MESSAGE);
    } catch {
      throw new Error(blocked ? CLOUD_SWITCH_BLOCKED_MESSAGE : CLOUD_CHECK_MESSAGE);
    }
  }

  async action(
    setup: Pick<CloudSetupView, 'workspaceId' | 'connectionId' | 'setupId'>,
    action: 'read' | 'cancel' | 'complete',
    token: string,
  ): Promise<CloudSetupView> {
    const response = await this.post(
      `${setup.setupId}/${action}`,
      { workspaceId: setup.workspaceId, connectionId: setup.connectionId },
      token,
    );
    if (!response.ok)
      throw new Error(
        action === 'complete'
          ? 'Cloud konnte noch nicht aktiviert werden. Beende laufende lokale Aktionen und versuche den Abschluss erneut.'
          : 'Der Cloud-Einrichtungsstatus konnte nicht bestätigt werden.',
      );
    return parseCloudSetupView(await response.json(), setup);
  }

  private post(path: string, body: unknown, token: string): Promise<Response> {
    return fetch(`/marketplace-browser/cloud-setups/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(90_000),
    });
  }
}
