import { createDiscordState, verifyDiscordState } from './discord-oauth.ts';

Deno.test('Discord-Zustand ist an den eingeloggten Nutzer gebunden', async () => {
  const state = await createDiscordState('user-1', 'test-secret-with-enough-entropy');
  if (!(await verifyDiscordState(state, 'user-1', 'test-secret-with-enough-entropy'))) {
    throw new Error('Gueltiger Zustand wurde abgewiesen.');
  }
  if (await verifyDiscordState(state, 'user-2', 'test-secret-with-enough-entropy')) {
    throw new Error('Fremder Nutzer wurde zugelassen.');
  }
  if (await verifyDiscordState(`${state}x`, 'user-1', 'test-secret-with-enough-entropy')) {
    throw new Error('Manipulierter Zustand wurde zugelassen.');
  }
});
