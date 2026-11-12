import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN fehlt"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID fehlt"),
  DISCORD_DEV_GUILD_ID: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  DATABASE_URL: z.string().min(1, "DATABASE_URL fehlt"),
  /** Für Links ins Dashboard, z. B. zum Einspruch gegen einen Ban. */
  DASHBOARD_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Öffentliche Betrugslink-Listen herunterladen (Standard: an). „off“ schaltet sie für alle Server ab. */
  PHISHING_LISTS: z
    .string()
    .optional()
    .transform(
      (v) =>
        !["off", "false", "0", "aus", "no"].includes(
          (v ?? "").trim().toLowerCase(),
        ),
    ),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Ungültige Konfiguration, bitte .env prüfen:");
  for (const issue of parsed.error.issues)
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const config = parsed.data;
