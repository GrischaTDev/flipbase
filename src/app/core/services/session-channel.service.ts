import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

/** Ereignisname auf dem Sitzungskanal. */
export const EREIGNIS_ABGEMELDET = 'abgemeldet';

/** Baut den Kanalnamen einer Nutzerkennung: `scope:entity:id`. */
export function kanalName(nutzerId: string): string {
  return `user:${nutzerId}:sessions`;
}

/**
 * Sagt den anderen offenen Fenstern desselben Kontos Bescheid, wenn die
 * Anmeldung beendet wurde.
 *
 * Warum es das braucht: Wird eine Sitzung serverseitig beendet, merkt ein
 * anderer offener Browser davon **nichts**. Sein Zugriffstoken ist weiterhin
 * gueltig und die Datenbank antwortet ihm ganz normal - nachgemessen liefert
 * `/auth/v1/user` zwar 403, `/rest/v1/<tabelle>` aber weiterhin 200 mit
 * Daten. Es gibt also keinen Fehler, auf den die App reagieren koennte. Erst
 * wenn das Token ablaeuft, faellt es auf.
 *
 * Deshalb dieser Kanal: Wer abmeldet, sagt es aktiv. Dasselbe Prinzip wie ein
 * Server-Push.
 *
 * Was er **nicht** ist: eine Sicherheitsgarantie. Wer das Signal ignoriert,
 * behaelt sein Token bis zum Ablauf. Die harte Grenze bleibt dessen Laufzeit.
 */
@Injectable({
  providedIn: 'root',
})
export class SessionChannelService {
  private readonly supabase = inject(SupabaseService);

  private kanal: RealtimeChannel | null = null;
  private fuerNutzer: string | null = null;

  /**
   * Hoert auf dem Kanal dieses Nutzers mit. Der Kanal wird fuer denselben Nutzer
   * nicht neu aufgebaut; ein erneuerter Access-Token wird aber an Supabase
   * weitergereicht, damit bestehende private Kanaele nach einem Auth-Refresh
   * nicht mit einem abgelaufenen Token weiterlaufen.
   */
  verbinde(nutzerId: string, zugriffsToken: string, beiAbmeldung: () => void): void {
    if (this.fuerNutzer === nutzerId && this.kanal) {
      try {
        this.supabase.client.realtime.setAuth(zugriffsToken);
      } catch {
        // Der bestehende Kanal darf die restliche App nicht blockieren. Kann
        // Realtime den neuen Token nicht uebernehmen, wird beim naechsten
        // Neuaufbau wieder ein frischer Verbindungsversuch gemacht.
      }
      return;
    }

    this.trenne();

    try {
      // Private Kanaele pruefen die Berechtigung anhand des Tokens.
      this.supabase.client.realtime.setAuth(zugriffsToken);

      this.kanal = this.supabase.client
        .channel(kanalName(nutzerId), { config: { private: true } })
        .on('broadcast', { event: EREIGNIS_ABGEMELDET }, () => beiAbmeldung())
        .subscribe();

      this.fuerNutzer = nutzerId;
    } catch {
      // Ohne Realtime bleibt die Tokenlaufzeit als Netz darunter.
      this.kanal = null;
      this.fuerNutzer = null;
    }
  }

  /** Sagt allen anderen Fenstern dieses Kontos, dass die Anmeldung endet. */
  async sendeAbmeldung(nutzerId: string): Promise<void> {
    try {
      const kanal =
        this.fuerNutzer === nutzerId && this.kanal
          ? this.kanal
          : this.supabase.client.channel(kanalName(nutzerId), { config: { private: true } });

      await kanal.send({
        type: 'broadcast',
        event: EREIGNIS_ABGEMELDET,
        payload: { zeitpunkt: new Date().toISOString() },
      });
    } catch {
      // Kommt das Signal nicht durch, greift weiterhin die Tokenlaufzeit.
    }
  }

  /** Schliesst den Kanal. */
  trenne(): void {
    if (!this.kanal) {
      this.fuerNutzer = null;
      return;
    }

    try {
      void this.supabase.client.removeChannel(this.kanal);
    } catch {
      // Verbindung schon fort - nichts zu tun.
    }

    this.kanal = null;
    this.fuerNutzer = null;
  }
}
