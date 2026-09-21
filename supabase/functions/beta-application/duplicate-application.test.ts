import { classifyDuplicateApplication } from './duplicate-application.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Erwartet ${String(expected)}, erhalten ${String(actual)}`);
  }
}

Deno.test('verraet bei vorhandenen Bewerbungen keinen Status', () => {
  for (const status of ['open', 'accepted', 'rejected']) {
    for (const receiptEmailStatus of ['pending', 'sent', 'failed']) {
      assertEquals(classifyDuplicateApplication({ status, receiptEmailStatus }), 'existing');
    }
  }
});
