import { tl } from "@libremod/shared";
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
import { event } from "./events.js";
import {
  massban,
  masskick,
  masstimeout,
  reportMessageMenu,
  reportPhishingMenu,
} from "./safety.js";
import { quote, saveQuoteMenu, type ContextMenu } from "./extras.js";
import {
  balance,
  buy,
  coins,
  daily,
  inventory,
  payCommand,
  richlist,
  shop,
  work,
} from "./economy.js";

/** Neue Befehle hier eintragen. */
const all: Command[] = [
  ping,
  config,
  automod,
  logging,
  welcome,
  rank,
  leaderboard,
  xp,
  warn,
  timeout,
  untimeout,
  kick,
  ban,
  unban,
  purge,
  cases,
  caseCommand,
  ticket,
  balance,
  daily,
  work,
  payCommand,
  shop,
  buy,
  inventory,
  richlist,
  coins,
  giveaway,
  poll,
  remind,
  birthday,
  event,
  verify,
  lockdown,
  unlock,
  note,
  modstats,
  suggest,
  suggestion,
  temprole,
  quote,
  massban,
  masskick,
  masstimeout,
];

export const commands = new Collection<string, Command>(
  all.map((c) => [c.data.name, c]),
);

/** Befehle im Rechtsklick-Menü von Nachrichten. */
export const contextMenus = new Collection<string, ContextMenu>(
  [saveQuoteMenu, reportPhishingMenu, reportMessageMenu].map((c) => [c.data.name, c]),
);

/** Alles, was bei Discord registriert wird, mit Übersetzungen (Discord zeigt jeder Person ihre Sprache). */
export function commandBodies() {
  return [...commands.map((c) => c.data.toJSON()), ...contextMenus.map((c) => c.data.toJSON())].map((c) => localizeCommand(c));
}

type Localizable = {
  name: string;
  description?: string;
  type?: number;
  name_localizations?: Record<string, string> | null;
  description_localizations?: Record<string, string> | null;
  options?: Localizable[];
  choices?: { name: string; value: unknown; name_localizations?: Record<string, string> | null }[];
};

const EN = ["en-US", "en-GB"] as const;

/**
 * Übersetzt Beschreibungen und Auswahl-Namen (Grundsprache Englisch, Deutsch als Übersetzung).
 * Namen von Befehlen und Optionen bleiben in der Grundsprache, weil der Code sie darüber liest;
 * Englisch kommt als Übersetzung dazu (Schlüssel „cmd:name“ im Wörterbuch).
 */
export function localizeCommand<T>(json: T, top = true): T {
  const node = json as unknown as Localizable;
  // Rechtsklick-Menüs (oberste Ebene, type 2/3) haben einen lesbaren Namen ohne Beschreibung.
  // Bei Optionen heißen dieselben Zahlen etwas anderes (Unterbefehl-Gruppe, Text).
  const nameKey = top && (node.type === 2 || node.type === 3) ? node.name : `cmd:${node.name}`;
  const enName = tl("en", nameKey);
  if (enName !== nameKey) node.name_localizations = { ...node.name_localizations, ...Object.fromEntries(EN.map((l) => [l, enName])) };
  if (node.description) {
    const en = tl("en", node.description);
    if (en !== node.description) {
      node.description_localizations = { ...node.description_localizations, de: node.description };
      node.description = en.slice(0, 100);
    }
  }
  for (const c of node.choices ?? []) {
    const en = tl("en", c.name);
    if (en !== c.name) {
      c.name_localizations = { ...c.name_localizations, de: c.name };
      c.name = en.slice(0, 100);
    }
  }
  for (const o of node.options ?? []) localizeCommand(o, false);
  return json;
}
