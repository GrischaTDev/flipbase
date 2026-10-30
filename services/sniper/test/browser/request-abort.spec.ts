import { describe, expect, it, vi } from 'vitest';
import { abortableBrowserOperation } from '../../src/browser/request-abort.js';

describe('abortable browser setup', () => {
  it('disposes a connection created just before the abortable wait begins', async () => {
    const connection = { close: vi.fn(async () => undefined) };
    const controller = new AbortController();
    const operation = Promise.resolve(connection);
    controller.abort(new Error('cancelled'));
    await expect(
      abortableBrowserOperation(operation, controller.signal, (late) => late.close()),
    ).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(connection.close).toHaveBeenCalledTimes(1));
  });

  it('rejects a pending setup promptly and disposes its eventual connection once', async () => {
    let release: (connection: object) => void = () => undefined;
    const operation = new Promise<object>((resolve) => {
      release = resolve;
    });
    const dispose = vi.fn(async () => undefined);
    const controller = new AbortController();
    const waiting = abortableBrowserOperation(operation, controller.signal, dispose);
    const rejected = expect(waiting).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await rejected;
    const connection = {};
    release(connection);
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledWith(connection));
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
