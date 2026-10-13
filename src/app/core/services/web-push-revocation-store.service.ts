import { Injectable } from '@angular/core';
import {
  WebPushLocalBinding,
  WebPushSubscription,
  isPushIdentifier,
} from '../models/web-push.models';

const installationKey = 'flipbase_push_installation';
const bindingPrefix = 'flipbase_push_binding:';
const revokePrefix = 'flipbase_push_revoke:';

@Injectable({ providedIn: 'root' })
export class WebPushRevocationStoreService {
  getInstallationId(): string {
    const existing = localStorage.getItem(installationKey);
    if (isPushIdentifier(existing)) return existing;
    const installationId = crypto.randomUUID();
    localStorage.setItem(installationKey, installationId);
    if (localStorage.getItem(installationKey) !== installationId)
      throw new Error('Die Gerätezuordnung konnte nicht gespeichert werden.');
    return installationId;
  }
  listBindings(): WebPushLocalBinding[] {
    const bindings: WebPushLocalBinding[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(bindingPrefix)) continue;
      const text = localStorage.getItem(key);
      if (!text) continue;
      let binding: WebPushLocalBinding;
      try {
        binding = JSON.parse(text) as WebPushLocalBinding;
      } catch {
        continue;
      }
      if (
        !binding ||
        !isPushIdentifier(binding.generationId) ||
        !isPushIdentifier(binding.userId) ||
        !isPushIdentifier(binding.sessionId) ||
        key !== bindingPrefix + binding.generationId ||
        !/^[a-f0-9]{64}$/.test(binding.token) ||
        !['prepared', 'active', 'revoke_pending'].includes(binding.state)
      )
        continue;
      bindings.push(
        localStorage.getItem(revokePrefix + binding.generationId)
          ? { ...binding, state: 'revoke_pending' }
          : binding,
      );
    }
    return bindings;
  }
  corruptedGenerationIds(): string[] {
    const valid = new Set(this.listBindings().map((binding) => binding.generationId));
    const corrupted: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(bindingPrefix)) continue;
      const generationId = key.slice(bindingPrefix.length);
      if (isPushIdentifier(generationId) && !valid.has(generationId)) corrupted.push(generationId);
    }
    return corrupted;
  }
  runExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    // Ohne Web Locks ist nur die Bereinigung erlaubt; Aktivierung prüft diese Fähigkeit vorher.
    return navigator.locks
      ? navigator.locks.request('flipbase-push-device', operation)
      : operation();
  }
  async prepare(
    userId: string,
    sessionId: string,
    keyId: string,
    subscription: WebPushSubscription,
  ): Promise<WebPushLocalBinding> {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const hashed = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const binding: WebPushLocalBinding = {
      generationId: crypto.randomUUID(),
      installationId: this.getInstallationId(),
      userId,
      sessionId,
      token,
      tokenHash: Array.from(hashed, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      keyId,
      subscription,
      state: 'prepared',
    };
    this.persist(binding);
    return binding;
  }
  confirm(generationId: string): boolean {
    const binding = this.listBindings().find(
      (candidate) => candidate.generationId === generationId,
    );
    if (!binding || binding.state === 'revoke_pending') return false;
    this.persist({ ...binding, state: 'active' });
    return true;
  }
  markForRevoke(userId?: string): void {
    if (this.corruptedGenerationIds().length)
      throw new Error(
        'Die lokale Push-Zuordnung ist beschädigt. Deaktiviere dieses Gerät zuerst online.',
      );
    for (const binding of this.listBindings()) {
      if (!userId || binding.userId === userId) {
        localStorage.setItem(revokePrefix + binding.generationId, 'pending');
        if (localStorage.getItem(revokePrefix + binding.generationId) !== 'pending')
          throw new Error('Die Deaktivierung konnte nicht lokal gesichert werden.');
      }
    }
  }
  remove(generationId: string): void {
    localStorage.removeItem(bindingPrefix + generationId);
    localStorage.removeItem(revokePrefix + generationId);
  }
  async flush(revoke: (generationId: string, token: string) => Promise<void>): Promise<boolean> {
    let complete = true;
    for (const binding of this.listBindings().filter(
      (candidate) => candidate.state === 'revoke_pending',
    )) {
      try {
        await revoke(binding.generationId, binding.token);
        this.remove(binding.generationId);
      } catch {
        complete = false;
      }
    }
    return complete;
  }
  private persist(binding: WebPushLocalBinding): void {
    const serialized = JSON.stringify(binding);
    const key = bindingPrefix + binding.generationId;
    localStorage.setItem(key, serialized);
    if (localStorage.getItem(key) !== serialized)
      throw new Error('Die Push-Zuordnung konnte nicht sicher gespeichert werden.');
  }
}
