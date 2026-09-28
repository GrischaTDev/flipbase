import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGoLoginApiAvailable } from '../src/gologin-api-limit.ts';

test('recognizes the confirmed GoLogin profile quota without exposing provider text', async () => {
  const response = Response.json(
    {
      statusCode: 403,
      message: "You've reached max profiles number. To create more update your plan",
      error: 'Forbidden',
    },
    { status: 403 },
  );

  await assert.rejects(assertGoLoginApiAvailable(response), /GoLogin-Profilgrenze/);
});
