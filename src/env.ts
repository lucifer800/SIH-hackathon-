import { z } from "zod";

// Node 20.12+ can read .env itself — no dotenv dependency.
try {
  process.loadEnvFile?.();
} catch {
  /* no .env file: rely on the real environment (CI, Render) */
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  TZ: z.string().default("Asia/Kolkata"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  CHANNEL_DRIVER: z.enum(["stub", "msg91"]).default("stub"),
  SMS_API_KEY: z.string().optional(),
  BHASHINI_API_KEY: z.string().optional(),
  DATA_GOV_API_KEY: z.string().optional(),

  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`Invalid environment.\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
