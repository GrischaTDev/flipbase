export type PhotoMaskProviderName = 'fal' | 'replicate';

export interface PhotoMaskProviderConfig {
  readonly provider: PhotoMaskProviderName;
  readonly model: string;
  readonly apiKey: string;
  readonly estimatedCostUsd: number;
  readonly endpointUrl: string;
  readonly replicateVersion?: string;
}

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_MASK_BYTES = 15 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const DEFAULT_REPLICATE_BIREFNET_VERSION =
  '9c5380630f1124b2e25582d0438d0e571b8e2c0125b83841d01b1706ba43364c';

export function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
}

export function decodeBase64(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 24 &&
    bytes.length <= MAX_MASK_BYTES &&
    PNG_SIGNATURE.every((expected, index) => bytes[index] === expected)
  );
}

export function matchesAllowedImageHeader(
  bytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): boolean {
  if (bytes.length < 16 || bytes.length > MAX_INPUT_BYTES) return false;
  if (mimeType === 'image/png') return hasPngSignature(bytes);
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  );
}

export function parseImageDataUri(dataUri: string): {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Uint8Array;
} {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri.trim());
  if (!match) throw new Error('Ungueltige Bilddaten.');
  const mimeType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp';
  const base64 = match[2]!;
  if (base64.length > 7_200_000) throw new Error('Das Foto ist zu gross.');
  const bytes = decodeBase64(base64);
  if (!matchesAllowedImageHeader(bytes, mimeType)) throw new Error('Ungueltiges Bildformat.');
  return { mimeType, bytes };
}

export function resolvePhotoMaskProvider(
  env: { get(name: string): string | undefined } = Deno.env,
): PhotoMaskProviderConfig | null {
  const preferred = env.get('PHOTO_MASK_PROVIDER')?.trim().toLowerCase();
  const falKey = env.get('FAL_KEY')?.trim() ?? '';
  const replicateKey = env.get('REPLICATE_API_TOKEN')?.trim() ?? '';

  if (preferred === 'replicate' && replicateKey) {
    return {
      provider: 'replicate',
      model: 'men1scus/birefnet',
      apiKey: replicateKey,
      estimatedCostUsd: 0.0018,
      endpointUrl: 'https://api.replicate.com/v1/predictions',
      replicateVersion:
        env.get('REPLICATE_BIREFNET_VERSION')?.trim() || DEFAULT_REPLICATE_BIREFNET_VERSION,
    };
  }
  if (preferred !== 'replicate' && falKey) {
    return {
      provider: 'fal',
      model: env.get('FAL_BIREFNET_MODEL')?.trim() || 'fal-ai/birefnet',
      apiKey: falKey,
      estimatedCostUsd: 0.0012,
      endpointUrl: 'https://fal.run/fal-ai/birefnet',
    };
  }
  if (!preferred && replicateKey) {
    return {
      provider: 'replicate',
      model: 'men1scus/birefnet',
      apiKey: replicateKey,
      estimatedCostUsd: 0.0018,
      endpointUrl: 'https://api.replicate.com/v1/predictions',
      replicateVersion:
        env.get('REPLICATE_BIREFNET_VERSION')?.trim() || DEFAULT_REPLICATE_BIREFNET_VERSION,
    };
  }
  return null;
}

export async function downloadMaskPng(
  target: string,
  requestImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  if (target.startsWith('data:')) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(target.trim());
    if (!match) throw new Error('Maskenantwort ist kein PNG.');
    const bytes = decodeBase64(match[1]!);
    if (!hasPngSignature(bytes)) throw new Error('Masken-PNG ist ungueltig.');
    return bytes;
  }
  const url = new URL(target);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Maskenadresse wird nicht unterstuetzt.');
  }
  const response = await requestImpl(url.href, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Maskendownload HTTP ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (!hasPngSignature(buffer)) throw new Error('Geladene Maskendatei ist kein gueltiges PNG.');
  return buffer;
}

export async function generateForegroundMask(
  config: PhotoMaskProviderConfig,
  inputDataUri: string,
  requestImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  if (config.provider === 'fal') {
    const response = await requestImpl(config.endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Key ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: inputDataUri,
        model: 'General Use (Light)',
        output_mask: true,
        mask_only: true,
        sync_mode: true,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`Maskenprovider HTTP ${response.status}`);
    const payload = (await response.json()) as {
      mask_image?: { url?: string };
      image?: { url?: string };
    };
    const resultUrl = payload.mask_image?.url ?? payload.image?.url;
    if (typeof resultUrl !== 'string' || !resultUrl) {
      throw new Error('Maskenantwort enthaelt keine Bildadresse.');
    }
    return await downloadMaskPng(resultUrl, requestImpl);
  }

  const response = await requestImpl(config.endpointUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=45',
    },
    body: JSON.stringify({
      version: config.replicateVersion ?? DEFAULT_REPLICATE_BIREFNET_VERSION,
      input: {
        image: inputDataUri,
        resolution: '1024x1024',
      },
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) throw new Error(`Maskenprovider HTTP ${response.status}`);
  const payload = (await response.json()) as {
    status?: string;
    output?: unknown;
  };
  if (payload.status !== 'succeeded') {
    throw new Error('Maskenerstellung nicht abgeschlossen.');
  }
  const outputUrl =
    typeof payload.output === 'string'
      ? payload.output
      : Array.isArray(payload.output) && typeof payload.output[0] === 'string'
        ? payload.output[0]
        : null;
  if (!outputUrl) throw new Error('Maskenantwort enthaelt kein Ergebnis.');
  return await downloadMaskPng(outputUrl, requestImpl);
}
