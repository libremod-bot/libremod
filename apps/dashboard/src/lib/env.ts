import "server-only";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { t } from "@/lib/i18n";

// In der Entwicklung die gemeinsame .env aus dem Hauptordner mitnutzen.
const rootEnv = resolve(process.cwd(), "../../.env");
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(t("Umgebungsvariable {name} fehlt. Bitte .env prüfen.", { name }));
  return value;
}

export const env = {
  get clientId() {
    return required("DISCORD_CLIENT_ID");
  },
  get clientSecret() {
    return required("DISCORD_CLIENT_SECRET");
  },
  get botToken() {
    return required("DISCORD_TOKEN");
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) throw new Error(t("SESSION_SECRET muss mindestens 32 Zeichen lang sein."));
    return secret;
  },
  get dashboardUrl() {
    return required("DASHBOARD_URL").replace(/\/$/, "");
  },
};
