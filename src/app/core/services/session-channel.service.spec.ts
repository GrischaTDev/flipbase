import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { SessionChannelService } from './session-channel.service';
import { SupabaseService } from './supabase.service';

function baueDienst() {
  const tokens: string[] = [];
  const kanal = {
    on: () => kanal,
    subscribe: () => kanal,
  };

  const supabase = {
    client: {
      realtime: {
        setAuth: (token: string) => tokens.push(token),
      },
      channel: () => kanal,
      removeChannel: async () => 'ok',
    },
  } as unknown as SupabaseService;

  const injector = Injector.create({
    providers: [{ provide: SupabaseService, useValue: supabase }],
  });

  return {
    dienst: runInInjectionContext(injector, () => new SessionChannelService()),
    tokens,
  };
}

describe('SessionChannelService: Token-Erneuerung', () => {
  it('gibt einem bestehenden Sitzungskanal den erneuerten Access-Token', () => {
    const { dienst, tokens } = baueDienst();

    dienst.verbinde('nutzer-1', 'token-alt', () => undefined);
    dienst.verbinde('nutzer-1', 'token-neu', () => undefined);

    expect(tokens).toEqual(['token-alt', 'token-neu']);
  });
});
