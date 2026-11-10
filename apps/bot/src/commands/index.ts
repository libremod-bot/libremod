import { Collection } from "discord.js";
import type { Command } from "./types.js";
import { ping } from "./ping.js";
import { config } from "./config.js";
import { warn } from "./moderation/warn.js";
import { timeout, untimeout } from "./moderation/timeout.js";
import { kick } from "./moderation/kick.js";
import { ban, unban } from "./moderation/ban.js";
import { purge } from "./moderation/purge.js";
import { cases, caseCommand } from "./moderation/cases.js";

/** Neue Befehle hier eintragen. */
const all: Command[] = [ping, config, warn, timeout, untimeout, kick, ban, unban, purge, cases, caseCommand];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));
