/** Nur die bekannte Tarifgrenze wird weitergegeben; Anbieterantworten bleiben privat. */
export class GoLoginApiLimitError extends Error {
  constructor() {
    super('GoLogin-API-Limit erreicht');
  }
}

export async function assertGoLoginApiAvailable(response: Response): Promise<void> {
  if (response.status !== 403) return;
  const body = await response.text();
  if (body.includes('You have reached your free API requests limit'))
    throw new GoLoginApiLimitError();
}
