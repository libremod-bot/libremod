import { Client, Events, GatewayIntentBits } from "discord.js";
import { createDb, runMigrations } from "@libremod/db";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { onInteractionCreate } from "./events/interactionCreate.js";
import { onGuildCreate } from "./events/guildCreate.js";
import { startTempBanScheduler } from "./services/tempbans.js";

await runMigrations(config.DATABASE_URL);
logger.info("Datenbank ist auf dem neuesten Stand");

const { db, close } = createDb(config.DATABASE_URL);
const ctx = { db };
let tempBanTimer: NodeJS.Timeout | undefined;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildModeration],
});

client.once(Events.ClientReady, (c) => {
  logger.info({ user: c.user.tag, guilds: c.guilds.cache.size }, "Libremod ist online");
  tempBanTimer ??= startTempBanScheduler(c, db);
});
client.on(Events.InteractionCreate, (i) => void onInteractionCreate(i, ctx));
client.on(Events.GuildCreate, (g) =>
  void onGuildCreate(g, ctx).catch((err) => logger.error({ err }, "guildCreate fehlgeschlagen")),
);

async function shutdown(signal: string) {
  logger.info({ signal }, "Fahre herunter");
  clearInterval(tempBanTimer);
  await client.destroy();
  await close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(config.DISCORD_TOKEN);
