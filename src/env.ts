import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Better Auth
    BETTER_AUTH_SECRET: z.string(),

    // Composio API (global key)
    COMPOSIO_API_KEY: z.string(),

    // Telegram bot (optional - Telegram features disabled when missing)
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_BOT_USERNAME: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis (optional - resumable streams disabled when missing; basic streaming still works)
    REDIS_URL: z.string().optional(),

    // Cron auth. Required in production so unauthenticated callers can't hit
    // /api/cron/* endpoints. Vercel auto-injects this when crons are configured
    // in vercel.json; the trustclaw deploy CLI also generates one on first deploy.
    CRON_SECRET: z.string(),

    // Signup gate. By default, signup is only allowed when the database has
    // zero users (initial deployment). Set ALLOW_SIGNUPS=true to temporarily
    // re-open signup, e.g. to invite a second user. Set ALLOW_SIGNUPS=false
    // (or leave unset) to lock signup once the first user is provisioned.
    ALLOW_SIGNUPS: z
      .string()
      .optional()
      .transform((v) => v === "true"),

    // Mashov (Israeli school portal) credentials. All four required to enable
    // the Mashov tools; if any are missing the tools are not registered.
    // MASHOV_SCHOOL_ID is the school's "semel" / numeric id, found via the
    // schools list on https://web.mashov.info. MASHOV_YEAR is the academic
    // year (e.g. 2026 for 2025-2026).
    MASHOV_USERNAME: z.string().optional(),
    MASHOV_PASSWORD: z.string().optional(),
    MASHOV_SCHOOL_ID: z.coerce.number().int().optional(),
    MASHOV_YEAR: z.coerce.number().int().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    // Server
    NODE_ENV: process.env.NODE_ENV,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    ALLOW_SIGNUPS: process.env.ALLOW_SIGNUPS,
    MASHOV_USERNAME: process.env.MASHOV_USERNAME,
    MASHOV_PASSWORD: process.env.MASHOV_PASSWORD,
    MASHOV_SCHOOL_ID: process.env.MASHOV_SCHOOL_ID,
    MASHOV_YEAR: process.env.MASHOV_YEAR,

    // Client URL resolution:
    //  - dev: derive from PORT so `PORT=3001 pnpm dev` just works
    //  - prod with explicit override: use NEXT_PUBLIC_APP_URL
    //  - on Vercel: fall back to the auto-injected canonical URL so self-hosters
    //    don't need to set anything (VERCEL_PROJECT_PRODUCTION_URL is the
    //    stable production domain; VERCEL_URL is the per-deployment URL)
    NEXT_PUBLIC_APP_URL:
      process.env.NODE_ENV === "development"
        ? `http://localhost:${process.env.PORT ?? "3000"}`
        : process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : undefined),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
