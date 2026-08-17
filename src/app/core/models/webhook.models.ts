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

export interface AppNotification {
  id: string;
  type: 'sale' | 'purchase' | 'alert' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}
