import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { createDb } from "@libremod/db";
import { runMigrations } from "@libremod/db/migrate";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { onInteractionCreate } from "./events/interactionCreate.js";
import { onGuildCreate } from "./events/guildCreate.js";
import { startTempBanScheduler } from "./services/tempbans.js";
import { handleMemberJoin, handleMessage, invalidateAutomod } from "./services/automod.js";
import * as log from "./services/logging.js";
import { handleMessageXp, invalidateLevels, startSeasonJob, startVoiceXp } from "./services/levels.js";
import { scheduleCommandSync, syncAllCommands, syncGuildCommands } from "./services/customcommands.js";
import { startScheduler } from "./services/scheduler.js";
import { startCounters } from "./services/counters.js";
import { startNotifications } from "./services/notifications.js";
import { handleMessageCoins, invalidateEconomy } from "./services/economy.js";
import { startPhishingLists } from "./services/phishlists.js";
import { onTicketChannelDeleted, startTicketJobs, trackTicketMessage } from "./services/tickets.js";
import { invalidateHighlights, onHighlightReaction, startChannelTools, trackSlowmodeMessage } from "./services/channeltools.js";
import { startFunJobs } from "./services/fun.js";
import { handleCountMessage, handleSuggestionMessage, invalidateCounting, invalidateSuggestions, onTempRoleMemberLeave, startCommunityJobs } from "./services/community2.js";
import { invalidateVerification, onVerifyJoin, onVerifyLeave, onLockedChannelDeleted, startProtectionJobs } from "./services/protection.js";
import { invalidateTempVoice, loadTempChannels, onTempVoiceState } from "./services/tempvoice.js";
import { handleWordChainMessage, invalidateVoiceRoles, invalidateWordChains, onVoiceRoleState } from "./services/extras.js";
import { checkMemberName, invalidateNameGuard, onNameGuardUpdate } from "./services/safety.js";
import { invalidateWelcome, onWelcomeJoin, onWelcomeLeave, onWelcomeMemberUpdate } from "./services/welcome.js";

await runMigrations(config.DATABASE_URL);
logger.info("Datenbank ist auf dem neuesten Stand");

const { db, close, onSettingsChanged } = createDb(config.DATABASE_URL);
await onSettingsChanged((guildId) => {
  invalidateAutomod(guildId);
  log.invalidateLogging(guildId);
  invalidateWelcome(guildId);
  invalidateLevels(guildId);
  invalidateTempVoice(guildId);
  invalidateHighlights(guildId);
  invalidateEconomy(guildId);
  invalidateVerification(guildId);
  invalidateSuggestions(guildId);
  invalidateCounting();
  invalidateWordChains();
  invalidateVoiceRoles(guildId);
  invalidateNameGuard(guildId);
  scheduleCommandSync(client, db, guildId);
});
const ctx = { db };
let tempBanTimer: NodeJS.Timeout | undefined;
let voiceXpTimer: NodeJS.Timeout | undefined;
let seasonTimer: NodeJS.Timeout | undefined;
let schedulerTimer: NodeJS.Timeout | undefined;
let counterTimer: NodeJS.Timeout | undefined;
let notifyTimer: NodeJS.Timeout | undefined;
let ticketTimer: NodeJS.Timeout | undefined;
let phishListTimer: NodeJS.Timeout | undefined;
let channelToolTimers: NodeJS.Timeout[] = [];
let funTimers: NodeJS.Timeout[] = [];
let protectionTimers: NodeJS.Timeout[] = [];
let communityTimers: NodeJS.Timeout[] = [];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    // Privilegiert: im Developer Portal unter „Bot“ einschalten.
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  // Damit auch Ereignisse zu nicht zwischengespeicherten Nachrichten und Mitgliedern ankommen (Logging).
  partials: [Partials.Message, Partials.GuildMember, Partials.User, Partials.Reaction],
});

client.once(Events.ClientReady, (c) => {
  logger.info({ user: c.user.tag, guilds: c.guilds.cache.size }, "Libremod ist online");
  tempBanTimer ??= startTempBanScheduler(c, db);
  voiceXpTimer ??= startVoiceXp(c, db);
  seasonTimer ??= startSeasonJob(c, db);
  schedulerTimer ??= startScheduler(c, db);
  counterTimer ??= startCounters(c, db);
  notifyTimer ??= startNotifications(c, db);
  ticketTimer ??= startTicketJobs(c, db);
  if (!channelToolTimers.length) channelToolTimers = startChannelTools(c, db);
  if (!funTimers.length) funTimers = startFunJobs(c, db);
  if (!protectionTimers.length) protectionTimers = startProtectionJobs(c, db);
  if (!communityTimers.length) communityTimers = startCommunityJobs(c, db);
  phishListTimer ??= startPhishingLists();
  void loadTempChannels(c, db).catch(logError("Temporäre Kanäle"));
  void syncAllCommands(c, db).catch(logError("Eigene Befehle"));
});
client.on(Events.InteractionCreate, (i) => void onInteractionCreate(i, ctx));
const logError = (what: string) => (err: unknown) => logger.error({ err }, `${what} fehlgeschlagen`);
client.on(Events.MessageCreate, (m) => {
  trackSlowmodeMessage(m);
  void trackTicketMessage(m, db).catch(logError("Tickets"));
  void handleCountMessage(m, db);
  void handleWordChainMessage(m, db);
  void handleSuggestionMessage(m, db).catch(logError("Vorschläge"));
});
client.on(Events.MessageCreate, (m) =>
  void handleMessage(m, db)
    .catch((err) => (logError("Auto-Mod")(err), false))
    // Was die Auto-Mod entfernt, bringt keine XP.
    .then((removed) => (removed ? undefined : Promise.all([handleMessageXp(m, db), handleMessageCoins(m, db)])))
    .catch(logError("Level")),
);
client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  void log.onMessageUpdate(oldMessage, newMessage, db).catch(logError("Logging"));
  // Nur echte Textänderungen prüfen, nicht z. B. nachgeladene Link-Vorschauen.
  if (newMessage.partial || (!oldMessage.partial && oldMessage.content === newMessage.content)) return;
  void handleMessage(newMessage, db, { edited: true }).catch(logError("Auto-Mod"));
});
client.on(Events.GuildMemberAdd, (m) => {
  void handleMemberJoin(m, db).catch(logError("Raid-Schutz"));
  void log.onMemberJoin(m, db).catch(logError("Logging"));
  void onWelcomeJoin(m, db).catch(logError("Begrüßung"));
  void onVerifyJoin(m, db).catch(logError("Verifizierung"));
  void checkMemberName(m, db).catch(logError("Namensschutz"));
});
client.on(Events.MessageReactionAdd, (r, u) => void onHighlightReaction(r, u, db).catch(logError("Highlights")));
client.on(Events.MessageReactionRemove, (r, u) => void onHighlightReaction(r, u, db).catch(logError("Highlights")));
client.on(Events.GuildMemberRemove, (m) => void onWelcomeLeave(m, db).catch(logError("Abschied")));
client.on(Events.GuildMemberRemove, (m) => void onVerifyLeave(m, db).catch(logError("Verifizierung")));
client.on(Events.GuildMemberRemove, (m) => void onTempRoleMemberLeave(m, db).catch(logError("Rollen auf Zeit")));
client.on(Events.GuildMemberUpdate, (a, b) => void onWelcomeMemberUpdate(a, b, db).catch(logError("Auto-Rollen")));
client.on(Events.GuildMemberUpdate, (a, b) => void onNameGuardUpdate(a, b, db).catch(logError("Namensschutz")));

// Logging
const logged =
  <A extends unknown[]>(fn: (...args: [...A, typeof db]) => Promise<void>) =>
  (...args: A) =>
    void fn(...args, db).catch(logError("Logging"));
client.on(Events.MessageDelete, logged(log.onMessageDelete));
client.on(Events.MessageBulkDelete, logged(log.onMessageBulkDelete));
client.on(Events.GuildMemberRemove, logged(log.onMemberLeave));
client.on(Events.GuildMemberUpdate, logged(log.onMemberUpdate));
client.on(Events.UserUpdate, (before, after) => void log.onUserUpdate(before, after, client, db).catch(logError("Logging")));
client.on(Events.ChannelCreate, logged(log.onChannelCreate));
client.on(Events.ChannelDelete, logged(log.onChannelDelete));
client.on(Events.ChannelDelete, (c) => void onTicketChannelDeleted(c.id, db).catch(logError("Tickets")));
client.on(Events.ChannelDelete, (c) => void onLockedChannelDeleted(c.id, db).catch(logError("Lockdown")));
client.on(Events.ThreadDelete, (t) => void onTicketChannelDeleted(t.id, db).catch(logError("Tickets")));
client.on(Events.ChannelUpdate, logged(log.onChannelUpdate));
client.on(Events.GuildRoleCreate, logged(log.onRoleCreate));
client.on(Events.GuildRoleDelete, logged(log.onRoleDelete));
client.on(Events.GuildRoleUpdate, logged(log.onRoleUpdate));
client.on(Events.GuildUpdate, logged(log.onGuildUpdate));
client.on(Events.VoiceStateUpdate, logged(log.onVoiceStateUpdate));
client.on(Events.VoiceStateUpdate, (a, b) => void onTempVoiceState(a, b, db).catch(logError("Temporäre Kanäle")));
client.on(Events.VoiceStateUpdate, (a, b) => void onVoiceRoleState(a, b, db).catch(logError("Sprachkanal-Rollen")));
client.on(Events.GuildCreate, (g) => void syncGuildCommands(client, db, g.id).catch(logError("Eigene Befehle")));
client.on(Events.GuildCreate, (g) =>
  void onGuildCreate(g, ctx).catch((err) => logger.error({ err }, "guildCreate fehlgeschlagen")),
);

async function shutdown(signal: string) {
  logger.info({ signal }, "Fahre herunter");
  clearInterval(tempBanTimer);
  clearInterval(voiceXpTimer);
  clearInterval(seasonTimer);
  clearInterval(schedulerTimer);
  clearInterval(counterTimer);
  clearInterval(notifyTimer);
  clearInterval(ticketTimer);
  clearInterval(phishListTimer);
  channelToolTimers.forEach(clearInterval);
  funTimers.forEach(clearInterval);
  protectionTimers.forEach(clearInterval);
  communityTimers.forEach(clearInterval);
  await client.destroy();
  await close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(config.DISCORD_TOKEN);
