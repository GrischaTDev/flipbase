import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarcodeScannerComponent } from './barcode-scanner.component';

const { decodeVideo } = vi.hoisted(() => ({
  decodeVideo:
    vi.fn<
      (
        video: HTMLVideoElement,
        callback: (result: { getText: () => string } | undefined) => void,
      ) => Promise<{ stop: () => void }>
    >(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoElement = decodeVideo;
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  decodeVideo.mockReset();
});

function scannerWithCamera() {
  const track = { stop: vi.fn(), getCapabilities: () => ({}) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const scanner = Object.create(BarcodeScannerComponent.prototype) as BarcodeScannerComponent;
  const detected = { emit: vi.fn() };
  const closed = { emit: vi.fn() };
  Object.assign(scanner, {
    scanGeneration: 0,
    isScanning: signal(false),
    scannedResult: signal(null),
    errorMessage: signal(null),
    hasTorch: signal(false),
    facingMode: signal('environment'),
    videoRef: () => ({ nativeElement: document.createElement('video') }),
    logger: { warn: vi.fn() },
    detected,
    closed,
  });
  return { scanner, track, getUserMedia, detected, closed };
}

describe('BarcodeScannerComponent', () => {
  it('übernimmt eine manuelle Eingabe auch ohne gestartete Kamera', () => {
    vi.useFakeTimers();
    const detected = { emit: vi.fn() };
    const closed = { emit: vi.fn() };
    const scanner = Object.create(BarcodeScannerComponent.prototype) as BarcodeScannerComponent;
    Object.assign(scanner, {
      scanGeneration: 0,
      isScanning: signal(false),
      scannedResult: signal(null),
      manualEanControl: new FormControl('4006381333931'),
      detected,
      closed,
    });

    scanner.onManualSubmit();
    vi.advanceTimersByTime(400);

    expect(detected.emit).toHaveBeenCalledWith('4006381333931');
    expect(closed.emit).toHaveBeenCalledOnce();
  });

  it('übernimmt ein ZXing-Ergebnis einmal und beendet Decoder und Kamera', async () => {
    const { scanner, track, detected, closed } = scannerWithCamera();
    const controls = { stop: vi.fn() };
    decodeVideo.mockResolvedValue(controls);
    await scanner.startCamera();
    const callback = decodeVideo.mock.calls[0]?.[1];
    expect(callback).toBeDefined();
    vi.useFakeTimers();
    callback?.({ getText: () => ' 4006381333931 ' });
    callback?.({ getText: () => '4006381333931' });
    vi.advanceTimersByTime(400);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(detected.emit).toHaveBeenCalledExactlyOnceWith('4006381333931');
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(scanner.isScanning()).toBe(false);
  });

  it('beendet verspätet gelieferte Decoder-Steuerung nach dem Schließen', async () => {
    const { scanner, track, detected, closed } = scannerWithCamera();
    const controls = { stop: vi.fn() };
    let finishDecoder: ((controls: { stop: () => void }) => void) | undefined;
    decodeVideo.mockImplementation(() => new Promise((resolve) => (finishDecoder = resolve)));
    const starting = scanner.startCamera();
    await vi.waitFor(() => expect(decodeVideo).toHaveBeenCalledOnce());
    scanner.ngOnDestroy();
    finishDecoder?.(controls);
    await starting;
    decodeVideo.mock.calls[0]?.[1]({ getText: () => '4006381333931' });
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(detected.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
  });

  it('beendet den Decoder auch bei einem Treffer im ersten Bild vor seiner Rückgabe', async () => {
    const { scanner, track, detected, closed } = scannerWithCamera();
    const controls = { stop: vi.fn() };
    decodeVideo.mockImplementation(async (_video, callback) => {
      callback({ getText: () => '4006381333931' });
      return controls;
    });
    vi.useFakeTimers();
    await scanner.startCamera();
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(400);
    expect(detected.emit).toHaveBeenCalledExactlyOnceWith('4006381333931');
    expect(closed.emit).toHaveBeenCalledOnce();
  });

  it('zeigt eine verweigerte Kamerafreigabe und startet keinen Decoder', async () => {
    const { scanner, getUserMedia } = scannerWithCamera();
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await scanner.startCamera();
    expect(scanner.errorMessage()).toContain('Kamerazugriff verweigert');
    expect(scanner.isScanning()).toBe(false);
    expect(decodeVideo).not.toHaveBeenCalled();
  });
});
