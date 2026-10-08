export class DiscordLinkConflictError extends Error {}

export interface DiscordLinkPorts {
  reserve(userId: string, discordUserId: string): Promise<void>;
  assignRole(): Promise<void>;
  confirm(userId: string, discordUserId: string): Promise<void>;
}

export async function completeDiscordLink(
  userId: string,
  discordUserId: string,
  ports: DiscordLinkPorts,
): Promise<void> {
  // Die eindeutige Bindung bleibt bei unklarem Anbieterfehler reserviert.
  // Nur dasselbe Discord-Konto darf eine idempotente Rollenvergabe wiederholen.
  await ports.reserve(userId, discordUserId);
  await ports.assignRole();
  await ports.confirm(userId, discordUserId);
}
