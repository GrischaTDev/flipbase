// @deno-types="npm:@types/nodemailer@8.0.2"
import nodemailer from 'npm:nodemailer@10.0.10';

export interface BetaEmailEnvironment {
  BETA_SMTP_HOST: string;
  BETA_SMTP_PORT: string;
  BETA_SMTP_USER: string;
  BETA_SMTP_PASS: string;
  BETA_SMTP_FROM_EMAIL: string;
  BETA_SMTP_FROM_NAME: string;
}

export interface BetaEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface BetaTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth: { user: string; pass: string };
}

export interface BetaMailEnvelope extends BetaEmailMessage {
  from: string;
}

export interface BetaMailTransport {
  sendMail(message: BetaMailEnvelope): Promise<unknown> | unknown;
}

export type BetaTransportFactory = (options: BetaTransportOptions) => BetaMailTransport;

function readEnvironment(): Partial<BetaEmailEnvironment> {
  return {
    BETA_SMTP_HOST: Deno.env.get('BETA_SMTP_HOST'),
    BETA_SMTP_PORT: Deno.env.get('BETA_SMTP_PORT'),
    BETA_SMTP_USER: Deno.env.get('BETA_SMTP_USER'),
    BETA_SMTP_PASS: Deno.env.get('BETA_SMTP_PASS'),
    BETA_SMTP_FROM_EMAIL: Deno.env.get('BETA_SMTP_FROM_EMAIL'),
    BETA_SMTP_FROM_NAME: Deno.env.get('BETA_SMTP_FROM_NAME'),
  };
}

function requireSetting(
  environment: Partial<BetaEmailEnvironment>,
  key: keyof BetaEmailEnvironment,
): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`${key} fehlt.`);
  }
  return value;
}

function defaultTransportFactory(options: BetaTransportOptions): BetaMailTransport {
  return nodemailer.createTransport(options);
}

export async function sendBetaEmail(
  message: BetaEmailMessage,
  environment: Partial<BetaEmailEnvironment> = readEnvironment(),
  createTransport: BetaTransportFactory = defaultTransportFactory,
): Promise<void> {
  const host = requireSetting(environment, 'BETA_SMTP_HOST');
  const portValue = requireSetting(environment, 'BETA_SMTP_PORT');
  const user = requireSetting(environment, 'BETA_SMTP_USER');
  const pass = requireSetting(environment, 'BETA_SMTP_PASS');
  const fromEmail = requireSetting(environment, 'BETA_SMTP_FROM_EMAIL');
  const fromName = requireSetting(environment, 'BETA_SMTP_FROM_NAME');
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('BETA_SMTP_PORT ist ungueltig.');
  }

  if ([message.to, fromEmail, fromName].some((value) => /[\r\n]/u.test(value))) {
    throw new Error('E-Mail-Kopfzeile ist ungueltig.');
  }

  const transport = createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
  });

  await transport.sendMail({
    from: `"${fromName.replaceAll('"', '\\"')}" <${fromEmail}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}
