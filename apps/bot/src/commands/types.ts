import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { Db } from "@libremod/db";

export interface CommandContext {
  db: Db;
}

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute(
    interaction: ChatInputCommandInteraction,
    ctx: CommandContext,
  ): Promise<void>;
  autocomplete?(
    interaction: AutocompleteInteraction,
    ctx: CommandContext,
  ): Promise<void>;
}
