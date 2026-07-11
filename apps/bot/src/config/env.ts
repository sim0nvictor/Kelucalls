import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalNonEmptyString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional()
);

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: optionalNonEmptyString.transform((value) => value ?? ""),
  TELEGRAM_WEBHOOK_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().optional()
  ),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  BOT_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(300000).default(5000),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NODE_ENV: z.string().default("development")
}).superRefine((env, ctx) => {
  if (env.TELEGRAM_WEBHOOK_URL && !env.TELEGRAM_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: "custom",
      path: ["TELEGRAM_WEBHOOK_SECRET"],
      message: "TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_WEBHOOK_URL is set"
    });
  }
});

export const env = envSchema.parse(process.env);
