import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { config } from './config';
import { Command } from './types/command';
import { queues } from './utils/queue';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const commands = new Collection<string, Command>();

async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const mod = await import(filePath);
    const command: Command = mod[Object.keys(mod)[0]];
    if (command?.data && typeof command?.execute === 'function') {
      commands.set(command.data.name, command);
    } else {
      console.warn(`Skipping ${file}: missing data or execute export.`);
    }
  }
}

async function loadEvents() {
  const eventsPath = join(__dirname, 'events');
  const eventFiles = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = join(eventsPath, file);
    const mod = await import(filePath);
    const event = mod.default;
    if (!event?.name || !event?.execute) {
      console.warn(`Skipping ${file}: missing name or execute export.`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args: any[]) => event.execute(...args, commands));
    } else {
      client.on(event.name, (...args: any[]) => event.execute(...args, commands));
    }
  }
}

async function deployCommands() {
  const commandsData = Array.from(commands.values()).map(c => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    console.log(`Started refreshing ${commandsData.length} application (/) commands.`);

    if (config.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandsData },
      );
      console.log('Successfully reloaded application (/) commands for development guild.');
    } else {
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

async function start() {
  if (!config.token) {
    console.error('Error: Token is missing. Bot cannot start.');
    return;
  }

  await loadCommands();
  await loadEvents();
  await deployCommands();
  await client.login(config.token);
}

function shutdown() {
  console.log('Shutting down bot gracefully...');
  for (const q of queues.values()) {
    try {
      q.destroy();
    } catch (error) {
      console.error('Error destroying queue on shutdown:', error);
    }
  }
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
