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
    try {
      const response = await this.post('begin', request, token);
      if (!response.ok) throw new Error(CLOUD_CHECK_MESSAGE);
      return parseCloudSetupResult(await response.json(), request);
    } catch {
      throw new Error(CLOUD_CHECK_MESSAGE);
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
