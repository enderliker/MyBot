import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types/command';
import { queues } from '../utils/queue';

export const resume: Command = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the current track'),
  async execute(interaction: ChatInputCommandInteraction) {
    const queue = queues.get(interaction.guildId!);

    if (!queue) {
      await interaction.reply({ content: 'I am not playing anything!', ephemeral: true });
      return;
    }

    const success = queue.resume();
    if (success) {
      await interaction.reply('Resumed playback.');
    } else {
      await interaction.reply('Playback is not paused.');
    }
  },
};
