import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from './config';
import { Command } from './types/command';
import { ping } from './commands/ping';
import ready from './events/ready';
import interactionCreate from './events/interactionCreate';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Initialize commands collection
const commands = new Collection<string, Command>();

// Register commands in the collection
commands.set(ping.data.name, ping);

// Set up event listeners
client.once(Events.ClientReady, (c) => ready.execute(c));
client.on(Events.InteractionCreate, (interaction) => interactionCreate.execute(interaction, commands));

// Register/Deploy Slash Commands to Discord API
async function deployCommands() {
  const commandsData = Array.from(commands.values()).map(command => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    console.log(`Started refreshing ${commandsData.length} application (/) commands.`);

    if (config.guildId) {
      // Dev mode: Register to a specific guild (instant update)
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandsData },
      );
      console.log('Successfully reloaded application (/) commands for development guild.');
    } else {
      // Production mode: Register globally (can take up to an hour)
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commandsData },
      );
      console.log('Successfully reloaded application (/) commands globally.');
    }
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
}

// Start the bot
async function start() {
  if (config.token) {
    await deployCommands();
    await client.login(config.token);
  } else {
    console.error('Error: Token is missing. Bot cannot start.');
  }
}

start();
