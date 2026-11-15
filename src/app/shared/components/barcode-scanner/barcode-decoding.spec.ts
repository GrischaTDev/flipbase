import {
  BarcodeFormat,
  BinaryBitmap,
  HybridBinarizer,
  NotFoundException,
  RGBLuminanceSource,
} from '@zxing/library';
import { BrowserMultiFormatReader } from '@zxing/browser';
import JsBarcode from 'jsbarcode';
import { describe, expect, it } from 'vitest';

function barcodeImage(format: string, code: string, top = 60, barHeight = 80): BinaryBitmap {
  const encoded: { encodings?: { data: string }[] } = {};
  JsBarcode(encoded, code, { format, displayValue: false });
  const modules = encoded.encodings?.map((encoding) => encoding.data).join('');
  if (!modules) throw new Error('Barcode fixture could not be encoded.');
  const moduleWidth = 3;
  const margin = 30;
  const width = modules.length * moduleWidth + 2 * margin;
  const height = 200;
  const pixels = new Int32Array(width * height).fill(0xffffff);
  for (let row = top; row < top + barHeight; row += 1) {
    for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
      if (modules[moduleIndex] !== '1') continue;
      const start = row * width + margin + moduleIndex * moduleWidth;
      pixels.fill(0, start, start + moduleWidth);
    }
  }
  return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
}

describe('Barcode decoding used by the scanner fallback', () => {
  it.each([
    ['EAN13', '4006381333931', BarcodeFormat.EAN_13],
    ['EAN8', '96385074', BarcodeFormat.EAN_8],
    ['CODE128', 'FB-000123', BarcodeFormat.CODE_128],
  ])('decodes %s from the barcode encoding used by labels', (format, code, expectedFormat) => {
    const result = new BrowserMultiFormatReader().decodeBitmap(barcodeImage(format, code));
    expect(result.getText()).toBe(code);
    expect(result.getBarcodeFormat()).toBe(expectedFormat);
  });

  it('recognizes an EAN above the image center without TRY_HARDER', () => {
    const result = new BrowserMultiFormatReader().decodeBitmap(
      barcodeImage('EAN13', '4006381333931', 30, 20),
    );
    expect(result.getText()).toBe('4006381333931');
    expect(result.getBarcodeFormat()).toBe(BarcodeFormat.EAN_13);
  });

  it('does not report a barcode in an empty frame', () => {
    const pixels = new Int32Array(200 * 200).fill(0xffffff);
    const image = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, 200, 200)));
    const reader = new BrowserMultiFormatReader();
    expect(() => reader.decodeBitmap(image)).toThrow(NotFoundException);
    expect(reader.decodeBitmap(barcodeImage('EAN13', '4006381333931')).getText()).toBe(
      '4006381333931',
    );
  });
});
