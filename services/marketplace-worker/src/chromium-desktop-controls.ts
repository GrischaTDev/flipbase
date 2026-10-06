import type { BrowserDragPoint } from './gologin-cloud-browser.ts';

interface DesktopControlOptions {
  width: number;
  height: number;
  authorize(): Promise<void>;
  execute(argumentsList: string[], input?: string): Promise<Buffer>;
}

export class ChromiumDesktopControls {
  private readonly options: DesktopControlOptions;
  constructor(options: DesktopControlOptions) {
    if (
      !Number.isSafeInteger(options.width) ||
      options.width < 640 ||
      options.width > 2560 ||
      !Number.isSafeInteger(options.height) ||
      options.height < 480 ||
      options.height > 1600
    )
      throw new Error('Ungültige Browseranzeige');
    this.options = options;
  }

  private coordinate(ratio: number, dimension: number): string {
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
      throw new Error('Ungültige Browserposition');
    return String(Math.min(dimension - 1, Math.floor(ratio * dimension)));
  }

  private async run(argumentsList: string[], input?: string): Promise<Buffer> {
    await this.options.authorize();
    try {
      return await this.options.execute(argumentsList, input);
    } catch {
      throw new Error('Browserbedienung fehlgeschlagen');
    }
  }

  async capture(): Promise<Buffer> {
    const image = await this.run(['import', '-window', 'root', '-quality', '65', 'jpeg:-']);
    if (
      image.length < 4 ||
      image.length > 6 * 1024 * 1024 ||
      image[0] !== 255 ||
      image[1] !== 216 ||
      image[2] !== 255
    )
      throw new Error('Browserbild nicht verfügbar');
    return image;
  }

  async click(x: number, y: number): Promise<void> {
    await this.run([
      'xdotool',
      'mousemove',
      '--sync',
      this.coordinate(x, this.options.width),
      this.coordinate(y, this.options.height),
      'click',
      '1',
    ]);
  }

  async type(text: string): Promise<void> {
    if (!text || text.length > 256 || /\p{Cc}/u.test(text))
      throw new Error('Ungültiger Browsertext');
    // Zugangsdaten stehen ausschließlich im Eingabekanal, nie in Prozessargumenten.
    await this.run(['xdotool', 'type', '--clearmodifiers', '--delay', '1', '--file', '-'], text);
  }

  async press(key: 'Enter' | 'Tab' | 'Escape' | 'Backspace'): Promise<void> {
    const keys = { Enter: 'Return', Tab: 'Tab', Escape: 'Escape', Backspace: 'BackSpace' };
    const nativeKey = keys[key];
    if (typeof nativeKey !== 'string') throw new Error('Ungültige Browsertaste');
    await this.run(['xdotool', 'key', '--clearmodifiers', nativeKey]);
  }

  async drag(points: BrowserDragPoint[]): Promise<void> {
    const first = points[0];
    if (!first || points.length < 2 || points.length > 256 || first.elapsedMs !== 0)
      throw new Error('Ungültige Browserbewegung');
    const argumentsList = [
      'xdotool',
      'mousemove',
      '--sync',
      this.coordinate(first.x, this.options.width),
      this.coordinate(first.y, this.options.height),
      'mousedown',
      '1',
    ];
    let previousTime = 0;
    for (const point of points.slice(1)) {
      if (
        !Number.isFinite(point.elapsedMs) ||
        point.elapsedMs < previousTime ||
        point.elapsedMs > 10_000
      )
        throw new Error('Ungültige Browserbewegung');
      if (point.elapsedMs > previousTime)
        argumentsList.push('sleep', String((point.elapsedMs - previousTime) / 1000));
      argumentsList.push(
        'mousemove',
        this.coordinate(point.x, this.options.width),
        this.coordinate(point.y, this.options.height),
      );
      previousTime = point.elapsedMs;
    }
    try {
      await this.run(argumentsList);
    } finally {
      await this.run(['xdotool', 'mouseup', '1']);
    }
  }
}
