import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VINTED_BASE_URL: z.string().min(1).default('https://www.vinted.de'),
  SNIPER_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  SNIPER_TICK_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  SNIPER_USER_AGENT: z.string().min(1).default('Mozilla/5.0 (compatible; FlipbaseSniper/0.1)'),
  SNIPER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  SNIPER_CATEGORY_MAX_AGE_MS: z.coerce.number().int().min(60_000).default(86_400_000),
});

export interface SnipeConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  vintedBaseUrl: string;
  requestsPerMinute: number;
  tickIntervalMs: number;
  userAgent: string;
  healthPort: number;
  categoryMaxAgeMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): SnipeConfig {
  const parsed = EnvSchema.parse(env);

  return {
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    vintedBaseUrl: parsed.VINTED_BASE_URL,
    requestsPerMinute: parsed.SNIPER_REQUESTS_PER_MINUTE,
    tickIntervalMs: parsed.SNIPER_TICK_INTERVAL_MS,
    userAgent: parsed.SNIPER_USER_AGENT,
    healthPort: parsed.SNIPER_HEALTH_PORT,
    categoryMaxAgeMs: parsed.SNIPER_CATEGORY_MAX_AGE_MS,
  };
}
