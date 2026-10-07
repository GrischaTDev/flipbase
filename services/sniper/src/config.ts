import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().default(''),
  SNIPER_BROWSER_HOST: z
    .string()
    .refine(
      (host) => host === '127.0.0.1' || host === '172.18.0.1',
      'Browser control must use a private address',
    )
    .default('127.0.0.1'),
  SNIPER_BROWSER_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  SNIPER_BROWSER_CDP_PORT: z.coerce.number().int().min(1).max(65535).default(9228),
  SNIPER_BROWSER_PROFILE_DIR: z.string().min(1).default('/var/lib/flipbase-sniper/browser'),
  VINTED_BASE_URL: z.string().min(1).default('https://www.vinted.de'),
  SNIPER_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  SNIPER_TICK_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  SNIPER_REQUEST_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
  SNIPER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(20_000),
  SNIPER_USER_AGENT: z
    .string()
    .min(1)
    .default(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    ),
  SNIPER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  SNIPER_CATEGORY_MAX_AGE_MS: z.coerce.number().int().min(60_000).default(86_400_000),
});

export interface SnipeConfig {
  supabaseAnonKey: string;
  browserHost: string;
  browserPort: number;
  browserCdpPort: number;
  browserProfileDir: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  vintedBaseUrl: string;
  requestsPerMinute: number;
  tickIntervalMs: number;
  requestMinIntervalMs: number;
  requestTimeoutMs: number;
  userAgent: string;
  healthPort: number;
  categoryMaxAgeMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): SnipeConfig {
  const parsed = EnvSchema.parse(env);

  return {
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    browserHost: parsed.SNIPER_BROWSER_HOST,
    browserPort: parsed.SNIPER_BROWSER_PORT,
    browserCdpPort: parsed.SNIPER_BROWSER_CDP_PORT,
    browserProfileDir: parsed.SNIPER_BROWSER_PROFILE_DIR,
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    vintedBaseUrl: parsed.VINTED_BASE_URL,
    requestsPerMinute: parsed.SNIPER_REQUESTS_PER_MINUTE,
    tickIntervalMs: parsed.SNIPER_TICK_INTERVAL_MS,
    requestMinIntervalMs: parsed.SNIPER_REQUEST_MIN_INTERVAL_MS,
    requestTimeoutMs: parsed.SNIPER_REQUEST_TIMEOUT_MS,
    userAgent: parsed.SNIPER_USER_AGENT,
    healthPort: parsed.SNIPER_HEALTH_PORT,
    categoryMaxAgeMs: parsed.SNIPER_CATEGORY_MAX_AGE_MS,
  };
}
