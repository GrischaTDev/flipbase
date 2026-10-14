import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePushInput } from './contracts.ts';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const registration = {
  action: 'register',
  generationId: id,
  installationId: id,
  tokenHash: 'a'.repeat(64),
  keyId: 'v1',
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/example',
    p256dh: 'B' + 'a'.repeat(86),
    auth: 'a'.repeat(22),
  },
};
test('register accepts persisted generation/hash and denies actor injection', () => {
  assert.doesNotThrow(() => validatePushInput(registration));
  assert.throws(() => validatePushInput({ ...registration, userId: id }));
});
test('provider URL disallows credentials, private hosts and arbitrary origins', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://a:f@fcm.googleapis.com/x',
  ])
    assert.throws(() =>
      validatePushInput({
        ...registration,
        subscription: { ...registration.subscription, endpoint },
      }),
    );
});
test('subscription keys and unknown categories are rejected', () => {
  assert.throws(() =>
    validatePushInput({
      ...registration,
      subscription: { ...registration.subscription, auth: 'short' },
    }),
  );
  assert.throws(() =>
    validatePushInput({
      action: 'preferences',
      deviceId: id,
      workspaceId: id,
      categories: ['unknown'],
    }),
  );
});
test('settings supports reload without a known device and strict fields', () => {
  assert.doesNotThrow(() =>
    validatePushInput({ action: 'settings', installationId: id, workspaceId: id }),
  );
  assert.throws(() =>
    validatePushInput({ action: 'settings', installationId: id, token: 'secret' }),
  );
});
test('version two accepts explicit favorites while legacy requests reject them', () => {
  const preferences = {
    action: 'preferences',
    deviceId: id,
    workspaceId: id,
    categories: ['favorite'],
  };
  assert.throws(() => validatePushInput(preferences));
  assert.doesNotThrow(() => validatePushInput({ ...preferences, apiVersion: 2 }));
  assert.throws(() => validatePushInput({ ...preferences, apiVersion: 3 }));
  assert.doesNotThrow(() =>
    validatePushInput({ action: 'settings', installationId: id, apiVersion: 2 }),
  );
});
