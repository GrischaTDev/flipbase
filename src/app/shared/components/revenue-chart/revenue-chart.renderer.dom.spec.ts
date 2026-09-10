import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevenueChartRenderer, type RevenueChartHandle } from './revenue-chart.renderer';

const hosts: HTMLDivElement[] = [];

function createHost(): HTMLDivElement {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of hosts) host.remove();
  hosts.length = 0;
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(render = vi.fn().mockResolvedValue(undefined)) {
  const handle = {
    render,
    updateOptions: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  } as unknown as RevenueChartHandle;
  const factory = vi.fn((element: HTMLElement) => {
    element.append(document.createElement('span'));
    return handle;
  });
  const status = vi.fn();
  const host = createHost();
  const renderer = new RevenueChartRenderer(host, async () => factory, status);
  return { handle, factory, status, renderer, host };
}

describe('RevenueChartRenderer', () => {
  it('behält den Renderfehler bei zusätzlichem Aufräumfehler und wirft beim Verlassen nicht', async () => {
    const original = Error('render');
    const cleanup = Error('destroy');
    const { renderer, handle, status, host } = setup(
      vi.fn().mockRejectedValueOnce(original).mockResolvedValue(undefined),
    );
    vi.mocked(handle.destroy).mockImplementation(() => {
      throw cleanup;
    });
    await expect(renderer.update({})).resolves.toBeUndefined();
    expect(status).toHaveBeenLastCalledWith('error', original);
    expect(host.childElementCount).toBe(0);
    await renderer.update({});
    expect(host.childElementCount).toBe(1);
    expect(() => renderer.destroy()).not.toThrow();
    expect(status).toHaveBeenLastCalledWith('error', cleanup);
    expect(host.childElementCount).toBe(0);
  });
  it('erneuert die Instanz bei geänderter Sichtbarkeit, da Apex ausgeblendete Reihen intern behält', async () => {
    const { renderer, factory, handle } = setup();
    await renderer.update({ series: [{ name: 'Wareneinsatz', data: [35], hidden: false }] });
    await renderer.update({ series: [{ name: 'Wareneinsatz', data: [35], hidden: true }] });
    await renderer.update({ series: [{ name: 'Wareneinsatz', data: [35], hidden: false }] });
    expect(factory).toHaveBeenCalledTimes(3);
    expect(handle.destroy).toHaveBeenCalledTimes(2);
  });
  it('meldet bereit erst nach Renderabschluss und aktualisiert dieselbe Instanz', async () => {
    const render = deferred<void>();
    const { renderer, handle, status, factory, host } = setup(vi.fn(() => render.promise));
    const initial = renderer.update({ series: [1] });
    await Promise.resolve();
    expect(status).toHaveBeenLastCalledWith('loading');
    render.resolve();
    await initial;
    expect(status).toHaveBeenLastCalledWith('ready');
    await renderer.update({ series: [2], chart: { animations: { enabled: false } } });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(handle.updateOptions).toHaveBeenCalledWith(
      { series: [2], chart: { animations: { enabled: false } } },
      true,
      false,
      false,
    );
    expect(host.childElementCount).toBe(1);
    renderer.destroy();
    renderer.destroy();
    expect(handle.destroy).toHaveBeenCalledTimes(1);
    expect(host.childElementCount).toBe(0);
  });
  it('konstruiert nach einem verspäteten Import bei zerstörter Ansicht keinen Chart', async () => {
    const { factory, status } = setup();
    const load = deferred<typeof factory>();
    const host = createHost();
    const renderer = new RevenueChartRenderer(host, () => load.promise, status);
    const update = renderer.update({});
    renderer.destroy();
    load.resolve(factory);
    await update;
    expect(factory).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalledWith('ready');
    expect(host.childElementCount).toBe(0);
  });
  it('fängt Import- und Konstruktorfehler und erlaubt erneutes Laden', async () => {
    const { handle, status } = setup();
    const host = createHost();
    let attempt = 0;
    const renderer = new RevenueChartRenderer(
      host,
      async () => {
        attempt++;
        if (attempt === 1) throw Error('import');
        return () => {
          if (attempt === 2) {
            host.append(document.createElement('span'));
            throw Error('constructor');
          }
          return handle;
        };
      },
      status,
    );
    await renderer.update({});
    expect(status).toHaveBeenLastCalledWith('error', expect.any(Error));
    await renderer.update({});
    expect(status).toHaveBeenLastCalledWith('error', expect.any(Error));
    expect(host.childElementCount).toBe(0);
    await renderer.update({});
    expect(status).toHaveBeenLastCalledWith('ready');
  });
  it('räumt nach Render- und Aktualisierungsfehlern auf', async () => {
    const { renderer, handle, status } = setup(
      vi.fn().mockRejectedValueOnce(Error('render')).mockResolvedValue(undefined),
    );
    await renderer.update({});
    expect(status).toHaveBeenLastCalledWith('error', expect.any(Error));
    expect(handle.destroy).toHaveBeenCalledTimes(1);
    await renderer.update({});
    vi.mocked(handle.updateOptions).mockRejectedValueOnce(Error('update'));
    await renderer.update({ series: [2] });
    expect(status).toHaveBeenLastCalledWith('error', expect.any(Error));
    expect(handle.destroy).toHaveBeenCalledTimes(2);
  });
  it('fasst Änderungen während des Renderns zusammen und wendet zuletzt aktuelle Optionen an', async () => {
    const render = deferred<void>();
    const { renderer, handle, factory } = setup(vi.fn(() => render.promise));
    const initial = renderer.update({ series: [1] });
    await Promise.resolve();
    void renderer.update({ series: [2] });
    void renderer.update({ series: [3] });
    render.resolve();
    await initial;
    expect(factory).toHaveBeenCalledTimes(1);
    expect(handle.updateOptions).toHaveBeenCalledTimes(1);
    expect(handle.updateOptions).toHaveBeenLastCalledWith({ series: [3] }, true, true, false);
  });
});
