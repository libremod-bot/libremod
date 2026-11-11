import { Collection } from "discord.js";
import type { Command } from "./types.js";
import { ping } from "./ping.js";
import { config } from "./config.js";
import { automod } from "./automod.js";
import { logging } from "./logging.js";
import { welcome } from "./welcome.js";
import { leaderboard, rank, xp } from "./levels.js";
import { warn } from "./moderation/warn.js";
import { timeout, untimeout } from "./moderation/timeout.js";
import { kick } from "./moderation/kick.js";
import { ban, unban } from "./moderation/ban.js";
import { purge } from "./moderation/purge.js";
import { cases, caseCommand } from "./moderation/cases.js";
import { ticket } from "./tickets.js";
import { suggest, suggestion, temprole } from "./community2.js";
import { lockdown, modstats, note, unlock, verify } from "./protection.js";
import { birthday, giveaway, poll, remind } from "./fun.js";
import { balance, buy, coins, daily, inventory, payCommand, richlist, shop, work } from "./economy.js";

/** Neue Befehle hier eintragen. */
const all: Command[] = [ping, config, automod, logging, welcome, rank, leaderboard, xp, warn, timeout, untimeout, kick, ban, unban, purge, cases, caseCommand, ticket, balance, daily, work, payCommand, shop, buy, inventory, richlist, coins, giveaway, poll, remind, birthday, verify, lockdown, unlock, note, modstats, suggest, suggestion, temprole];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));
