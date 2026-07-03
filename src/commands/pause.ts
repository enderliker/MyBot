import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types/command';
import { queues } from '../utils/queue';

export const pause: Command = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track'),
  async execute(interaction: ChatInputCommandInteraction) {
    const queue = queues.get(interaction.guildId!);

    if (!queue) {
      await interaction.reply({ content: 'I am not playing anything!', ephemeral: true });
      return;
    }

    const success = queue.pause();
    if (success) {
      await interaction.reply('Paused playback.');
    } else {
      await interaction.reply('Playback is already paused.');
    }
  },
};
