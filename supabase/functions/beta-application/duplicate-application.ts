export type DuplicateApplicationDisposition = 'rejected' | 'already_confirmed' | 'retry_receipt';

export function classifyDuplicateApplication(input: {
  status: string;
  receiptEmailStatus: string;
}): DuplicateApplicationDisposition {
  if (input.status === 'rejected') return 'rejected';
  return input.receiptEmailStatus === 'sent' ? 'already_confirmed' : 'retry_receipt';
}
