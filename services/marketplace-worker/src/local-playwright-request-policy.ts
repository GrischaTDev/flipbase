export function allowedPublicRequest(address: string, method: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  try {
    const url = new URL(address);
    const host = url.hostname;
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (host === 'vinted.de' ||
        host.endsWith('.vinted.de') ||
        host === 'vinted.net' ||
        host.endsWith('.vinted.net'))
    );
  } catch {
    return false;
  }
}
