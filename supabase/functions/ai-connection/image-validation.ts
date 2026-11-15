import { Image } from 'jsr:@matmen/imagescript@3.20.3';

export async function validateAiConnectionImage(
  bytes: Uint8Array,
  mimeType: string,
  expectedSize: number,
): Promise<void> {
  if (bytes.length !== expectedSize || bytes.length === 0 || bytes.length > 52428800)
    throw new Error('Der Bild-Upload ist unvollständig oder größer als 50 MB.');
  const actualType =
    bytes[0] === 0xff && bytes[1] === 0xd8
      ? 'image/jpeg'
      : [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
        ? 'image/png'
        : new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
            new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
          ? 'image/webp'
          : null;
  if (actualType !== mimeType)
    throw new Error('Die Datei ist kein passendes JPG-, PNG- oder WebP-Bild.');
  try {
    // Begrenzt den Decoder-Speicher; größere Originale bleiben über den vorhandenen Editor nutzbar.
    const image = await Image.decode(bytes, { maxPixels: 32_000_000, threads: 1 });
    if (!image.width || !image.height) throw new Error('Leeres Bild');
  } catch {
    throw new Error('Das Foto kann hier nicht gelesen werden. Bitte prüfe es im Vinted-Editor.');
  }
}
