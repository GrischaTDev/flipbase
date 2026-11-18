import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  encodeBase64,
  generateForegroundMask,
  hasPngSignature,
  parseImageDataUri,
  resolvePhotoMaskProvider,
} from './provider.ts';

const SAMPLE_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
]);
const SAMPLE_JPEG_DATA_URI = `data:image/jpeg;base64,${encodeBase64(
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]),
)}`;

function envMap(values: Record<string, string>) {
  return { get: (key: string) => values[key] };
}

Deno.test('resolvePhotoMaskProvider waehlt fal, replicate oder null anhand Konfiguration', () => {
  assertEquals(resolvePhotoMaskProvider(envMap({})), null);
  assertEquals(resolvePhotoMaskProvider(envMap({ FAL_KEY: 'fal-secret' }))?.provider, 'fal');
  assertEquals(
    resolvePhotoMaskProvider(envMap({ REPLICATE_API_TOKEN: 'rep-secret' }))?.provider,
    'replicate',
  );
  assertEquals(
    resolvePhotoMaskProvider(
      envMap({
        FAL_KEY: 'fal-secret',
        REPLICATE_API_TOKEN: 'rep-secret',
        PHOTO_MASK_PROVIDER: 'replicate',
      }),
    )?.provider,
    'replicate',
  );
});

Deno.test('parseImageDataUri und hasPngSignature pruefen Bildkoepfe strikt', () => {
  assertEquals(hasPngSignature(SAMPLE_PNG), true);
  assertEquals(hasPngSignature(new Uint8Array([1, 2, 3])), false);
  const parsed = parseImageDataUri(SAMPLE_JPEG_DATA_URI);
  assertEquals(parsed.mimeType, 'image/jpeg');
  assertEquals(parsed.bytes[0], 0xff);
});

Deno.test(
  'generateForegroundMask unterstuetzt fal-ai sync_mode Data-URI ohne Zweitabruf',
  async () => {
    const pngUri = `data:image/png;base64,${encodeBase64(SAMPLE_PNG)}`;
    const config = resolvePhotoMaskProvider(envMap({ FAL_KEY: 'fal-key' }))!;
    let requestedUrl = '';
    const bytes = await generateForegroundMask(
      config,
      SAMPLE_JPEG_DATA_URI,
      async (input, init) => {
        requestedUrl = String(input);
        const body = JSON.parse(String((init as RequestInit | undefined)?.body));
        assertEquals(body.output_mask, true);
        assertEquals(body.mask_only, true);
        assertEquals(body.sync_mode, true);
        return new Response(JSON.stringify({ mask_image: { url: pngUri } }), { status: 200 });
      },
    );
    assertEquals(requestedUrl, 'https://fal.run/fal-ai/birefnet');
    assertEquals(bytes, SAMPLE_PNG);
  },
);

Deno.test(
  'generateForegroundMask unterstuetzt Replicate mit Prefer:wait und lehnt Nicht-PNG ab',
  async () => {
    const config = resolvePhotoMaskProvider(envMap({ REPLICATE_API_TOKEN: 'rep-key' }))!;
    const calls: string[] = [];
    const bytes = await generateForegroundMask(config, SAMPLE_JPEG_DATA_URI, async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === 'https://api.replicate.com/v1/predictions') {
        return new Response(
          JSON.stringify({
            status: 'succeeded',
            output: 'https://replicate.delivery/masks/result.png',
          }),
          { status: 201 },
        );
      }
      return new Response(SAMPLE_PNG, { status: 200 });
    });
    assertEquals(calls, [
      'https://api.replicate.com/v1/predictions',
      'https://replicate.delivery/masks/result.png',
    ]);
    assertEquals(bytes, SAMPLE_PNG);

    await assertRejects(() =>
      generateForegroundMask(config, SAMPLE_JPEG_DATA_URI, async (input) =>
        String(input).includes('/v1/predictions')
          ? new Response(
              JSON.stringify({ status: 'succeeded', output: 'https://replicate.delivery/bad.png' }),
              { status: 201 },
            )
          : new Response(new Uint8Array([0, 1, 2, 3]), { status: 200 }),
      ),
    );
  },
);
