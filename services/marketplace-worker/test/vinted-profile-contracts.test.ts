import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseVintedProfileChanges,
  parseVintedProfileDetails,
} from '../src/vinted-profile-contracts.ts';

const details = {
  about: 'Mein Shop',
  city: 'Berlin',
  country: 'Deutschland',
  showCity: true,
  language: 'de-DE',
  languages: [{ id: 'de-DE', label: 'Deutsch (German)' }],
  imageUrl: 'https://images1.vinted.net/t/avatar/50x50/photo.jpeg',
  canUploadPhoto: true,
};

test('validiert den vollständigen Profilvertrag und lehnt unbekannte Schreibfelder ab', () => {
  assert.deepEqual(parseVintedProfileDetails(details), details);
  const changes = {
    about: 'Neu',
    city: 'Hamburg',
    cityId: '796',
    showCity: false,
    language: 'de-DE',
  };
  assert.deepEqual(parseVintedProfileChanges(changes), changes);
  assert.throws(() => parseVintedProfileChanges({ ...changes, username: 'anderes-konto' }));
  assert.throws(() => parseVintedProfileChanges({ ...changes, showCity: 'false' }));
  assert.throws(() => parseVintedProfileChanges({ ...changes, cityId: 'https://other.invalid' }));
  assert.throws(() => parseVintedProfileChanges({ ...changes, about: 'x'.repeat(2001) }));
});

test('akzeptiert weder fremde Bildadressen noch umetikettierte oder zu große Uploads', () => {
  assert.throws(() =>
    parseVintedProfileDetails({
      ...details,
      imageUrl: 'https://vinted.net.attacker.invalid/a.jpg',
    }),
  );
  const changes = { about: '', city: 'Berlin', showCity: true, language: 'de-DE' };
  assert.throws(() =>
    parseVintedProfileChanges({
      ...changes,
      photo: { mimeType: 'image/jpeg', base64: Buffer.from('<svg/>').toString('base64') },
    }),
  );
  assert.throws(() =>
    parseVintedProfileChanges({ ...changes, photo: { mimeType: 'image/svg+xml', base64: 'AAAA' } }),
  );
  assert.throws(() =>
    parseVintedProfileChanges({
      ...changes,
      photo: { mimeType: 'image/jpeg', base64: 'A'.repeat(400000) },
    }),
  );
});
