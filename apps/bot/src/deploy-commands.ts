import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commandBodies } from "./commands/index.js";

const rest = new REST().setToken(config.DISCORD_TOKEN);
const body = commandBodies();

const route = config.DISCORD_DEV_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_DEV_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

await rest.put(route, { body });
console.log(
  `${body.length} Befehl(e) ${config.DISCORD_DEV_GUILD_ID ? "auf dem Testserver" : "global"} registriert.`,
);
