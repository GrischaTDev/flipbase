import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LabelMediaService, type LabelImageUpload } from './label-media.service';
const requestId = '00000000-0000-4000-8000-000000000001';
const image = {
  assetId: 1,
  version: 2,
  status: 'approved' as const,
  attribution: 'Eigene Aufnahme',
  allowedUse: 'Referenzbibliothek',
};
function setup() {
  const rpc = vi.fn();
  const invoke = vi.fn();
  const createSignedUrl = vi.fn();
  const from = vi.fn().mockReturnValue({ createSignedUrl });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: { client: { rpc, functions: { invoke }, storage: { from } } },
      },
    ],
  });
  return { service: TestBed.inject(LabelMediaService), rpc, invoke, createSignedUrl, from };
}
function upload(): LabelImageUpload {
  return Object.freeze({
    original: new File(['original'], 'original.webp', { type: 'image/webp' }),
    image: new Blob(['normalized'], { type: 'image/png' }),
    attribution: image.attribution,
    allowedUse: image.allowedUse,
    requestId,
  });
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('LabelMediaService: Normalisierung und sichere Aufträge', () => {
  it('normalisiert auf PNG bis 1200 Pixel und schließt den dekodierten Bitmap', async () => {
    const { service } = setup();
    const bitmap = { width: 4000, height: 2000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const normalized = new Blob(['normalized'], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(normalized),
    );
    const original = new File(['original'], 'large.jpg', { type: 'image/jpeg' });
    const command = await service.prepare(original, ' Fotografin ', ' Lexikon ');
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1200, 600);
    expect(command.original).toBe(original);
    expect(command.image).toBe(normalized);
    expect(command.attribution).toBe('Fotografin');
    expect(command.allowedUse).toBe('Lexikon');
    expect(Object.isFrozen(command)).toBe(true);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
  it('prüft Dateiformat und Pflichtrechte vor dem Dekodieren', async () => {
    const { service } = setup();
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    await expect(
      service.prepare(
        new File(['svg'], 'image.svg', { type: 'image/svg+xml' }),
        'Urheber',
        'Nutzung',
      ),
    ).rejects.toThrow(/Bild/);
    await expect(
      service.prepare(new File(['png'], 'image.png', { type: 'image/png' }), ' ', 'Nutzung'),
    ).rejects.toThrow(/Bildnachweis/);
    expect(decode).not.toHaveBeenCalled();
  });
  it('gibt den Bitmap auch nach Überschreiten der Pixelgrenze frei', async () => {
    const { service } = setup();
    const bitmap = { width: 6000, height: 5000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    await expect(
      service.prepare(new File(['png'], 'image.png', { type: 'image/png' }), 'Urheber', 'Nutzung'),
    ).rejects.toThrow(/24 Millionen/);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
  it('sendet den unveränderten Upload bei bewusster Wiederholung erneut', async () => {
    const { service, invoke } = setup();
    const command = upload();
    invoke
      .mockResolvedValueOnce({ data: null, error: new Error('offline') })
      .mockResolvedValueOnce({ data: { assetId: 4 }, error: null });
    await expect(service.upload(command)).rejects.toThrow(/nicht bestätigt/);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(await service.upload(command)).toBe(4);
    for (const call of invoke.mock.calls) {
      expect(call[0]).toBe('brand-label-media');
      const form: FormData = call[1].body;
      expect(form.get('requestId')).toBe(requestId);
      expect(form.get('attribution')).toBe(image.attribution);
      expect(form.get('allowedUse')).toBe(image.allowedUse);
      const original = form.get('original');
      const normalized = form.get('image');
      expect(original).toBeInstanceOf(File);
      expect(normalized).toBeInstanceOf(File);
      if (original instanceof File && normalized instanceof File) {
        expect(original.name).toBe('original.webp');
        expect(original.size).toBe(command.original.size);
        expect(normalized.name).toBe('reference.png');
        expect(normalized.type).toBe('image/png');
        expect(normalized.size).toBe(command.image.size);
      }
    }
  });
  it('bestätigt keine fremden oder ungültigen Uploadreceipts', async () => {
    const { service, invoke } = setup();
    invoke.mockResolvedValueOnce({ data: { assetId: 0 }, error: null });
    await expect(service.upload(upload())).rejects.toThrow();
  });
  it('sendet exakte Freigabeargumente und prüft die Folgeversion', async () => {
    const { service, rpc } = setup();
    rpc.mockResolvedValueOnce({ data: { version: 3 }, error: null });
    await service.setPermission(image, 'revoked', requestId);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_label_image_permission', {
      p_asset_id: 1,
      p_expected_version: 2,
      p_status: 'revoked',
      p_attribution: image.attribution,
      p_allowed_use: image.allowedUse,
      p_request_id: requestId,
    });
    rpc.mockResolvedValueOnce({ data: { version: 2 }, error: null });
    await expect(service.setPermission(image, 'revoked', requestId)).rejects.toThrow(
      /nicht bestätigt/,
    );
  });
  it('behandelt 42501 als Rechteentzug ohne interne Meldungen', async () => {
    const { service, rpc } = setup();
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private SQL token' } });
    await expect(service.list()).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.setPermission(image, 'revoked', requestId)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(service.list()).rejects.not.toThrow(/private|token/);
  });
  it('behandelt Edge403 beim Upload als Rechteentzug', async () => {
    const { service, invoke } = setup();
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response('private token', { status: 403 }) },
    });
    await expect(service.upload(upload())).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('fragt Bild-URLs ausschließlich über den Medien-Endpunkt ab und sendet keine TTL oder Speicherpfade', async () => {
    const { service, invoke, from, createSignedUrl } = setup();
    invoke.mockResolvedValueOnce({
      data: {
        signedUrl: 'http://kong:8000/storage/v1/object/sign/label-images/7.png?token=test-token',
      },
      error: null,
    });
    expect(await service.signedUrl(7)).toBe(
      'http://127.0.0.1:54351/storage/v1/object/sign/label-images/7.png?token=test-token',
    );
    expect(invoke).toHaveBeenCalledExactlyOnceWith('brand-label-media', { body: { assetId: 7 } });
    expect(from).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(await service.signedUrl(0)).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('zeigt bei gesperrtem Medienzugang und unzulässigem URL-Protokoll kein Bild', async () => {
    const { service, invoke } = setup();
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response('Denied', { status: 403 }) },
    });
    expect(await service.signedUrl(7)).toBeNull();
    invoke.mockResolvedValueOnce({ data: { signedUrl: 'javascript:alert(1)' }, error: null });
    expect(await service.signedUrl(7)).toBeNull();
  });
});
