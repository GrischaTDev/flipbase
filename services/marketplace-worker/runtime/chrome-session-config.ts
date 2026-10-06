import {
  isPublicHost,
  type ProxyForwarderOptions,
} from '../../../tools/cloud-browser-pilot/proxy-forwarder.mjs';

function record(configuration: unknown): Record<string, unknown> {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration))
    throw new Error('Ungültige Chrome-Sitzungskonfiguration');
  return configuration as Record<string, unknown>;
}

export function parseChromeSessionConfiguration(configuration: unknown): {
  width: number;
  height: number;
  argumentsList: string[];
  proxy?: ProxyForwarderOptions;
} {
  const settings = record(configuration);
  const dimensions = record(settings.viewport);
  const width = dimensions.width;
  const height = dimensions.height;
  if (
    Object.keys(settings).some(
      (key) => !['headless', 'locale', 'viewport', 'proxy'].includes(key),
    ) ||
    settings.headless !== false ||
    settings.locale !== 'de-DE' ||
    Object.keys(dimensions).some((key) => !['width', 'height'].includes(key)) ||
    typeof width !== 'number' ||
    !Number.isSafeInteger(width) ||
    width < 640 ||
    width > 2560 ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(height) ||
    height < 480 ||
    height > 1600
  )
    throw new Error('Ungültige Chrome-Sitzungskonfiguration');
  let proxy: ProxyForwarderOptions | undefined;
  if (settings.proxy !== undefined) {
    const upstream = record(settings.proxy);
    let address: URL;
    try {
      address = new URL(String(upstream.server));
    } catch {
      throw new Error('Ungültige Chrome-Proxykonfiguration');
    }
    if (
      Object.keys(upstream).some((key) => !['server', 'username', 'password'].includes(key)) ||
      typeof upstream.server !== 'string' ||
      address.protocol !== 'http:' ||
      !isPublicHost(address.hostname) ||
      address.username ||
      address.password ||
      address.pathname !== '/' ||
      address.search ||
      address.hash ||
      (upstream.username !== undefined && typeof upstream.username !== 'string') ||
      (upstream.password !== undefined && typeof upstream.password !== 'string')
    )
      throw new Error('Ungültige Chrome-Proxykonfiguration');
    proxy = {
      server: address.href,
      username: upstream.username ?? '',
      password: upstream.password ?? '',
    };
  }
  return {
    width,
    height,
    ...(proxy ? { proxy } : {}),
    argumentsList: [
      '--user-data-dir=/profile',
      '--no-first-run',
      '--lang=de-DE',
      `--window-size=${width},${height}`,
      '--start-maximized',
      '--remote-debugging-port=9223',
      ...(proxy ? ['--proxy-server=http://127.0.0.1:3128', '--proxy-bypass-list=<-loopback>'] : []),
      'about:blank',
    ],
  };
}
