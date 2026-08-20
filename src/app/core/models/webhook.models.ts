export interface WebhookConfig {
  discordEnabled: boolean;
  discordWebhookUrl?: string;
  telegramEnabled: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  customWebhookEnabled: boolean;
  customWebhookUrl?: string;
  notifyOnSale: boolean;
  notifyOnPurchase: boolean;
  notifyOnLowMargin: boolean;
  soundEnabled: boolean;
}

/**
 * Art der Meldung.
 *
 * `system` sind Meldungen des Betreibers an alle - Willkommensgruss,
 * Wartungsarbeiten, Neuigkeiten. Alles andere entsteht aus dem, was der Nutzer
 * selbst tut: ein Einkauf, ein Verkauf, ein Hinweis zu seinen Daten. Die
 * Unterscheidung ist im Menue sichtbar, damit man eine Ankuendigung nicht mit
 * einem eigenen Vorgang verwechselt.
 */
export type AppNotificationType = 'sale' | 'purchase' | 'alert' | 'system';

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  /** Ziel innerhalb der Anwendung, z. B. '/purchases/123'. */
  link?: string;
  /**
   * Ausfuehrlicher Text, der beim Anklicken in einem Dialog erscheint.
   *
   * Gedacht fuer Meldungen ohne Ziel - eine Ankuendigung fuehrt nirgendwohin,
   * hat aber mehr zu sagen, als in eine Zeile im Menue passt.
   */
  details?: string;
}
