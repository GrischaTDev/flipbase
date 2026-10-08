import type { BrowserInput } from './browser-types.js';

export class BrowserDesktop {
  constructor(private readonly execute: (args: string[], input?: string) => Promise<Buffer>) {}

  async capture(): Promise<Buffer> {
    const frame = await this.execute(['import', '-window', 'root', '-quality', '65', 'jpeg:-']);
    if (
      frame.length < 4 ||
      frame.length > 6 * 1024 * 1024 ||
      frame[0] !== 255 ||
      frame[1] !== 216 ||
      frame[2] !== 255
    )
      throw new Error('Browserbild nicht verfügbar.');
    return frame;
  }

  async input(command: BrowserInput): Promise<void> {
    if (command.kind === 'click') {
      const coordinate = (ratio: number, dimension: number) => {
        if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
          throw new Error('Ungültige Browserposition.');
        return String(Math.min(dimension - 1, Math.floor(ratio * dimension)));
      };
      await this.execute([
        'xdotool',
        'mousemove',
        '--sync',
        coordinate(command.x, 1280),
        coordinate(command.y, 900),
        'click',
        '1',
      ]);
    } else if (command.kind === 'text') {
      if (!command.text || command.text.length > 256 || /\p{Cc}/u.test(command.text))
        throw new Error('Ungültiger Browsertext.');
      await this.execute(
        ['xdotool', 'type', '--clearmodifiers', '--delay', '1', '--file', '-'],
        command.text,
      );
    } else {
      const keys = { Enter: 'Return', Tab: 'Tab', Escape: 'Escape', Backspace: 'BackSpace' };
      const key = keys[command.key];
      if (!key) throw new Error('Ungültige Browsertaste.');
      await this.execute(['xdotool', 'key', '--clearmodifiers', key]);
    }
  }
}
