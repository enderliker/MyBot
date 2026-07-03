import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types/command';
import { queues } from '../utils/queue';

export const stop: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing and leave the voice channel'),
  async execute(interaction: ChatInputCommandInteraction) {
    const queue = queues.get(interaction.guildId!);

    if (!queue) {
      await interaction.reply({ content: 'I am not connected to a voice channel!', ephemeral: true });
      return;
    }

    queue.destroy();
    await interaction.reply('Stopped playback and cleared the queue.');
  },
};
