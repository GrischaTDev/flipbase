import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createEmptyLabelContent } from './brand-label-content';
import type { LabelDraft } from './brand-label.models';
import {
  executeLabelRevisionCommand,
  LabelRpcError,
  prepareLabelRevisionCommand,
  type LabelRpcTransport,
  type LabelRevisionCommand,
} from './brand-label-rpc';

const requestId = 'fd01e4fc-9d2b-4b3b-98e0-fbc3a4448001';
const draft = (state: LabelDraft['state'] = 'draft'): LabelDraft => ({
  referenceId: 10,
  revisionId: 20,
  version: 3,
  state,
  input: { content: createEmptyLabelContent(), images: [] },
});
const response = (state: LabelDraft['state'] = 'draft'): LabelDraft => ({
  ...draft(state),
  version: 4,
});
function rpc(data: unknown, error: unknown = null): LabelRpcTransport {
  return async () => ({ data, error });
}
async function rejectsWith(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(
    action,
    (error: unknown) => error instanceof LabelRpcError && error.code === code,
  );
}

describe('Revisionsaufträge vorbereiten', () => {
  it('bindet Speichern an Revisionskennung, Version und Wiederholungskennung', () => {
    const command = prepareLabelRevisionCommand('save', draft(), requestId);
    assert.equal(command.revisionId, 20);
    assert.equal(command.referenceId, 10);
    assert.equal(command.expectedVersion, 3);
    assert.equal(command.requestId, requestId);
    assert.deepEqual(command.input, draft().input);
  });
  it('friert den Auftrag einschließlich aller Unterobjekte ein', () => {
    const value = draft();
    const command = prepareLabelRevisionCommand('save', value, requestId);
    assert.ok(Object.isFrozen(command));
    assert.ok(Object.isFrozen(command.input));
    assert.ok(Object.isFrozen(command.input?.content.aliases));
    (value.input.content.aliases as string[]).push('Spätere Eingabe');
    assert.deepEqual(command.input?.content.aliases, []);
  });
  for (const action of ['submit', 'publish', 'discard'] as const) {
    it(`${action} überträgt keine vom Browser erfundene Veröffentlichungskopie`, () => {
      const command = prepareLabelRevisionCommand(action, draft('review'), requestId);
      assert.equal(command.input, null);
    });
  }
  for (const state of ['published', 'discarded'] as const) {
    for (const action of ['save', 'submit', 'publish', 'discard'] as const) {
      it(`${action} auf ${state} wird vor dem Netzwerk abgewiesen`, () => {
        assert.throws(() => prepareLabelRevisionCommand(action, draft(state), requestId));
      });
    }
  }
  it('veröffentlicht keinen ungeprüften Entwurf', () => {
    assert.throws(() => prepareLabelRevisionCommand('publish', draft(), requestId));
  });
  for (const value of ['', 'abc', 'fd01e4fc-9d2b-4b3b-98e0-fbc3a4448001x']) {
    it(`verweigert eine ungültige Vorgangskennung ${JSON.stringify(value)}`, () => {
      assert.throws(() => prepareLabelRevisionCommand('save', draft(), value));
    });
  }
  it('normalisiert eine gültige UUID auf Kleinschreibung', () => {
    assert.equal(
      prepareLabelRevisionCommand('save', draft(), requestId.toUpperCase()).requestId,
      requestId,
    );
  });
  for (const value of [0, -1, 1.1, NaN, 2147483647]) {
    it(`verweigert die nicht fortschreibbare Version ${value}`, () => {
      assert.throws(() =>
        prepareLabelRevisionCommand('save', { ...draft(), version: value }, requestId),
      );
    });
  }
});

describe('RPC-Aufträge ausführen', () => {
  it('sendet ausschließlich den vorgesehenen Save-Vertrag an den Transport', async () => {
    const calls: unknown[] = [];
    const command = prepareLabelRevisionCommand('save', draft(), requestId);
    const transport: LabelRpcTransport = async (name, args) => {
      calls.push({ name, args });
      return { data: response(), error: null };
    };
    assert.deepEqual(await executeLabelRevisionCommand(command, transport), response());
    assert.deepEqual(calls, [
      {
        name: 'save_label_draft',
        args: {
          p_revision_id: 20,
          p_expected_version: 3,
          p_input: draft().input,
          p_request_id: requestId,
        },
      },
    ]);
  });
  it('wiederholt einen unklar fehlgeschlagenen Auftrag nicht automatisch', async () => {
    let calls = 0;
    const transport: LabelRpcTransport = async () => {
      calls += 1;
      throw new Error('private SQL details');
    };
    const command = prepareLabelRevisionCommand('save', draft(), requestId);
    await rejectsWith(() => executeLabelRevisionCommand(command, transport), 'network');
    assert.equal(calls, 1);
  });
  it('behält beim bewussten Wiederholen Kennung und eingefrorene Eingaben', async () => {
    const calls: unknown[] = [];
    const source = draft();
    const command = prepareLabelRevisionCommand('save', source, requestId);
    const transport: LabelRpcTransport = async (name, args) => {
      calls.push({ name, args });
      if (calls.length === 1) throw new Error('Antwort verloren');
      return { data: response(), error: null };
    };
    await rejectsWith(() => executeLabelRevisionCommand(command, transport), 'network');
    (source.input.content.aliases as string[]).push('Nach der ersten Anfrage geändert');
    await executeLabelRevisionCommand(command, transport);
    assert.deepEqual(calls[0], calls[1]);
  });
  it('Prüfung verlangt den passenden neuen Prüfstand', async () => {
    const command = prepareLabelRevisionCommand('submit', draft(), requestId);
    assert.deepEqual(
      await executeLabelRevisionCommand(command, rpc(response('review'))),
      response('review'),
    );
    await rejectsWith(
      () => executeLabelRevisionCommand(command, rpc(response('draft'))),
      'network',
    );
  });
  it('Veröffentlichen erwartet einen passenden serverseitigen Beleg', async () => {
    const command = prepareLabelRevisionCommand('publish', draft('review'), requestId);
    const receipt = { referenceId: 10, revisionId: 20, version: 4 };
    assert.deepEqual(await executeLabelRevisionCommand(command, rpc(receipt)), receipt);
  });
  it('Verwerfen akzeptiert nur einen passenden Verwerfungsbeleg', async () => {
    const command = prepareLabelRevisionCommand('discard', draft(), requestId);
    const receipt = { referenceId: 10, revisionId: 20, version: 4, state: 'discarded' };
    assert.deepEqual(await executeLabelRevisionCommand(command, rpc(receipt)), receipt);
  });
  for (const [name, data] of [
    ['null', null],
    ['leeres Objekt', {}],
    ['fremde Referenz', { ...response(), referenceId: 11 }],
    ['fremde Revision', { ...response(), revisionId: 21 }],
    ['alte Version', { ...response(), version: 3 }],
    ['übersprungene Version', { ...response(), version: 5 }],
    ['falscher Zustand', response('published')],
    ['interner Zusatz', { ...response(), originalPath: 'private/file' }],
    ['ungültiger Inhalt', { ...response(), input: { content: {}, images: [] } }],
  ] as const) {
    it(`behandelt ${name} nicht als erfolgreiche Speicherung`, async () => {
      const command = prepareLabelRevisionCommand('save', draft(), requestId);
      await rejectsWith(() => executeLabelRevisionCommand(command, rpc(data)), 'network');
    });
  }
  it('bestätigt beim Speichern keinen abweichenden Inhalt', async () => {
    const changed = response();
    const data = {
      ...changed,
      input: {
        ...changed.input,
        content: { ...changed.input.content, title: 'Nicht mein Auftrag' },
      },
    };
    await rejectsWith(
      () =>
        executeLabelRevisionCommand(
          prepareLabelRevisionCommand('save', draft(), requestId),
          rpc(data),
        ),
      'network',
    );
  });
  it('akzeptiert keinen Transport ohne explizites Fehlerfeld', async () => {
    const broken = async () => ({ data: response() });
    await rejectsWith(
      () =>
        executeLabelRevisionCommand(
          prepareLabelRevisionCommand('save', draft(), requestId),
          broken as unknown as LabelRpcTransport,
        ),
      'network',
    );
  });
  it('führt keinen Getter in einer Transportantwort aus', async () => {
    let getterCalled = false;
    const transport: LabelRpcTransport = async () => ({
      get data() {
        getterCalled = true;
        return response();
      },
      error: null,
    });
    await rejectsWith(
      () =>
        executeLabelRevisionCommand(
          prepareLabelRevisionCommand('save', draft(), requestId),
          transport,
        ),
      'network',
    );
    assert.equal(getterCalled, false);
  });
  it('verweigert frei erfundene RPC-Namen vor dem Transport', async () => {
    let called = false;
    const command = {
      ...prepareLabelRevisionCommand('save', draft(), requestId),
      action: 'delete_everything',
    };
    await rejectsWith(
      () =>
        executeLabelRevisionCommand(command as unknown as LabelRevisionCommand, async () => {
          called = true;
          return { data: null, error: null };
        }),
      'validation',
    );
    assert.equal(called, false);
  });
});

describe('RPC-Fehler ohne interne Details', () => {
  const cases = [
    [{ code: '42501', message: 'private SQL' }, 'forbidden'],
    [{ code: '22023', message: 'private SQL' }, 'validation'],
    [{ code: 'P0001', details: 'label_version_conflict' }, 'conflict'],
    [{ code: 'P0001', details: 'different-error' }, 'network'],
    [{ status: 401 }, 'unauthorized'],
    [{ status: 403 }, 'forbidden'],
    [{ code: 'P0002' }, 'unavailable'],
    [{ code: '99999', hint: 'secret' }, 'network'],
  ] as const;
  for (const [error, code] of cases) {
    it(`ordnet ${JSON.stringify(error)} als ${code} ein`, async () => {
      const command = prepareLabelRevisionCommand('save', draft(), requestId);
      await rejectsWith(() => executeLabelRevisionCommand(command, rpc(null, error)), code);
    });
  }
  it('zeigt keine SQL-Texte, Pfade oder Tokens aus dem Serverfehler', async () => {
    try {
      await executeLabelRevisionCommand(
        prepareLabelRevisionCommand('save', draft(), requestId),
        rpc(null, { code: '42501', message: 'secret-path', details: 'secret-token' }),
      );
      assert.fail('Fehler erwartet');
    } catch (error: unknown) {
      assert.ok(error instanceof LabelRpcError);
      assert.ok(!JSON.stringify(error).includes('secret'));
      assert.ok(!error.message.includes('secret'));
    }
  });
  it('gibt Fehlern Vorrang vor gleichzeitig gelieferten Erfolgsdaten', async () => {
    await rejectsWith(
      () =>
        executeLabelRevisionCommand(
          prepareLabelRevisionCommand('save', draft(), requestId),
          rpc(response(), { code: '42501' }),
        ),
      'forbidden',
    );
  });
});
