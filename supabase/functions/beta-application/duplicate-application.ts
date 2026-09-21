export type DuplicateApplicationDisposition = 'existing';

export function classifyDuplicateApplication(input: {
  status: string;
  receiptEmailStatus: string;
}): DuplicateApplicationDisposition {
  void input;
  return 'existing';
}
