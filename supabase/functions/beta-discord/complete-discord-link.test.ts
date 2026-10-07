import assert from 'node:assert/strict';
import { completeDiscordLink, DiscordLinkConflictError } from './complete-discord-link.ts';

Deno.test(
  'Parallele Abschlüsse reservieren Nutzer und Discord-Ziel vor der ersten externen Rolle',
  async () => {
    const byUser = new Map<string, string>();
    const assigned: string[] = [];
    const complete = (userId: string, discordId: string) =>
      completeDiscordLink(userId, discordId, {
        reserve: async (user, discord) => {
          const existing = byUser.get(user);
          if (
            (existing && existing !== discord) ||
            [...byUser].some(([other, target]) => other !== user && target === discord)
          )
            throw new DiscordLinkConflictError('conflict');
          byUser.set(user, discord);
        },
        assignRole: async () => {
          assigned.push(`${userId}:${discordId}`);
        },
        confirm: async () => undefined,
      });
    const results = await Promise.allSettled([
      complete('user-a', 'discord-a'),
      complete('user-a', 'discord-b'),
      complete('user-b', 'discord-a'),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.deepEqual(assigned, ['user-a:discord-a']);
  },
);
Deno.test(
  'Unklarer Rollenfehler behält die Bindung und erlaubt nur denselben idempotenten Retry',
  async () => {
    let bound: string | null = null;
    const confirmed: string[] = [];
    const complete = (discordId: string, fail: boolean) =>
      completeDiscordLink('user', discordId, {
        reserve: async (_user, target) => {
          if (bound && bound !== target) throw new DiscordLinkConflictError('conflict');
          bound = target;
        },
        assignRole: async () => {
          if (fail) throw new Error('uncertain role response');
        },
        confirm: async (_user, target) => {
          confirmed.push(target);
        },
      });
    await assert.rejects(complete('discord-a', true));
    assert.deepEqual(confirmed, []);
    await assert.rejects(complete('discord-b', false), DiscordLinkConflictError);
    await complete('discord-a', false);
    assert.deepEqual(confirmed, ['discord-a']);
  },
);
