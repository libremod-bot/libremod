import { Collection } from "discord.js";
import type { Command } from "./types.js";
import { ping } from "./ping.js";

/** Neue Befehle hier eintragen. */
const all: Command[] = [ping];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));
