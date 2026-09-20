import { classifyDuplicateApplication } from './duplicate-application.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Erwartet ${String(expected)}, erhalten ${String(actual)}`);
  }
}

Deno.test('weist eine erneut eingereichte abgelehnte Bewerbung aus', () => {
  assertEquals(
    classifyDuplicateApplication({ status: 'rejected', receiptEmailStatus: 'sent' }),
    'rejected',
  );
});

Deno.test('unterscheidet bestaetigte und erneut zu versendende Bewerbungen', () => {
  assertEquals(
    classifyDuplicateApplication({ status: 'open', receiptEmailStatus: 'sent' }),
    'already_confirmed',
  );
  assertEquals(
    classifyDuplicateApplication({ status: 'open', receiptEmailStatus: 'failed' }),
    'retry_receipt',
  );
});
