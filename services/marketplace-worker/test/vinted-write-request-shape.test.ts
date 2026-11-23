import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeVintedWriteRequest,
  parseVintedWriteRequestShapes,
  vintedRequestPathTemplate,
} from '../src/vinted-write-request-shape.ts';

test('beschreibt eine JSON-Speicheranfrage nur mit Feldnamen und Typen, ohne Werte', () => {
  const shape = describeVintedWriteRequest({
    method: 'put',
    url: 'https://www.vinted.de/api/v2/item_upload/items/10789520736?x=1',
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      item: {
        title: 'Puma Trainingsjacke Größe M',
        price: { amount: '29.99', currency_code: 'EUR' },
        photos: [{ id: 123, orientation: 0 }],
        item_attributes: [{ code: 'size', ids: [607] }],
        '4711': 'geheim',
        'Ungültiger Schlüssel': true,
      },
      feedback_id: null,
    }),
    status: 200,
  });
  assert.deepEqual(shape, {
    method: 'PUT',
    path: '/api/v2/item_upload/items/:id',
    contentType: 'json',
    status: 200,
    fields: [
      'feedback_id:null',
      'item:object',
      'item.#:string',
      'item.?:boolean',
      'item.item_attributes:array',
      'item.item_attributes[]:object',
      'item.item_attributes[].code:string',
      'item.item_attributes[].ids:array',
      'item.item_attributes[].ids[]:number',
      'item.photos:array',
      'item.photos[]:object',
      'item.photos[].id:number',
      'item.photos[].orientation:number',
      'item.price:object',
      'item.price.amount:string',
      'item.price.currency_code:string',
      'item.title:string',
    ],
  });
  const text = JSON.stringify(shape);
  for (const secret of ['Puma', '29.99', '10789520736', 'geheim', '607', 'Ungültiger'])
    assert.equal(text.includes(secret), false, secret);
});

test('beschreibt Formulare und Löschaufrufe und ignoriert Lesen und fremde Adressen', () => {
  assert.deepEqual(
    describeVintedWriteRequest({
      method: 'POST',
      url: 'https://www.vinted.de/api/v2/items/42/delete',
      contentType: null,
      body: null,
      status: 204,
    }),
    {
      method: 'POST',
      path: '/api/v2/items/:id/delete',
      contentType: 'none',
      fields: [],
      status: 204,
    },
  );
  assert.deepEqual(
    describeVintedWriteRequest({
      method: 'POST',
      url: 'https://www.vinted.de/api/v2/photos',
      contentType: 'multipart/form-data; boundary=x',
      body: '--x\r\nContent-Disposition: form-data; name="photo[file]"\r\n\r\nbinär\r\n--x\r\nContent-Disposition: form-data; name="photo[type]"\r\n\r\nitem\r\n--x--',
      status: 200,
    })?.fields,
    ['?:part'],
  );
  assert.equal(
    describeVintedWriteRequest({
      method: 'GET',
      url: 'https://www.vinted.de/api/v2/items/42',
      contentType: null,
      body: null,
      status: 200,
    }),
    null,
  );
  assert.equal(vintedRequestPathTemplate('https://example.test/api/v2/items/1'), null);
  assert.equal(vintedRequestPathTemplate('https://www.vinted.de/items/1/edit'), null);
  assert.equal(
    vintedRequestPathTemplate('https://www.vinted.de/api/v2/users/77/Max.Mustermann'),
    '/api/v2/users/:id/:x',
  );
});

test('lässt nur vollständig gültige Messungen durch', () => {
  const valid = {
    method: 'PUT',
    path: '/api/v2/item_upload/items/:id',
    contentType: 'json',
    fields: ['item.price.amount:string'],
    status: 200,
  };
  assert.deepEqual(parseVintedWriteRequestShapes([valid]), [valid]);
  for (const broken of [
    { ...valid, path: '/api/v2/items/10789520736' },
    { ...valid, fields: ['item.title:Puma Jacke'] },
    { ...valid, method: 'GET' },
    { ...valid, status: 700 },
    { ...valid, extra: 'x' },
  ])
    assert.throws(() => parseVintedWriteRequestShapes([broken]));
  assert.throws(() => parseVintedWriteRequestShapes(Array(7).fill(valid)));
});
