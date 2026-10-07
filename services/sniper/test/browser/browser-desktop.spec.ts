import { describe, expect, it } from 'vitest';
import { BrowserDesktop } from '../../src/browser/browser-desktop.js';

describe('BrowserDesktop', () => {
  it('passes typed text through stdin and keeps it out of process arguments', async () => {
    const calls: { args: string[]; input?: string }[] = [];
    const desktop = new BrowserDesktop(async (args, input) => {
      calls.push({ args, input });
      return Buffer.alloc(0);
    });
    await desktop.input({ kind: 'text', text: 'private-text' });
    expect(calls).toEqual([
      {
        args: ['xdotool', 'type', '--clearmodifiers', '--delay', '1', '--file', '-'],
        input: 'private-text',
      },
    ]);
  });
  it.each([-0.1, 1.1, NaN, Infinity])(
    'rejects an invalid native click coordinate %s',
    async (x) => {
      let executed = false;
      const desktop = new BrowserDesktop(async () => {
        executed = true;
        return Buffer.alloc(0);
      });
      await expect(desktop.input({ kind: 'click', x, y: 0.5 })).rejects.toThrow();
      expect(executed).toBe(false);
    },
  );
  it('rejects a non-image screenshot', async () => {
    const desktop = new BrowserDesktop(async () => Buffer.from('private text'));
    await expect(desktop.capture()).rejects.toThrow();
  });
});
