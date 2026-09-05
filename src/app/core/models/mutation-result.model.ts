export interface MutationResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}
