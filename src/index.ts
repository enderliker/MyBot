import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from './config';
import { Command } from './types/command';
import { ping } from './commands/ping';
import { play } from './commands/play';
import { skip } from './commands/skip';
import { stop } from './commands/stop';
import { pause } from './commands/pause';
import { resume } from './commands/resume';
import { queue } from './commands/queue';
import ready from './events/ready';
import interactionCreate from './events/interactionCreate';
import { queues } from './utils/queue';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

const commands = new Collection<string, Command>();

commands.set(ping.data.name, ping);
commands.set(play.data.name, play);
commands.set(skip.data.name, skip);
commands.set(stop.data.name, stop);
commands.set(pause.data.name, pause);
commands.set(resume.data.name, resume);
commands.set(queue.data.name, queue);

client.once(Events.ClientReady, (c) => ready.execute(c));
client.on(Events.InteractionCreate, (interaction) => interactionCreate.execute(interaction, commands));

async function deployCommands() {
  const commandsData = Array.from(commands.values()).map(command => command.data.toJSON());
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
  if (config.token) {
    await deployCommands();
    await client.login(config.token);
  } else {
    console.error('Error: Token is missing. Bot cannot start.');
  }
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
