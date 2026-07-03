import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types/command';
import { queues } from '../utils/queue';

export const skip: Command = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current playing song'),
  async execute(interaction: ChatInputCommandInteraction) {
    const queue = queues.get(interaction.guildId!);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({ content: 'There is nothing playing to skip!', ephemeral: true });
      return;
    }

    queue.skip();
    await interaction.reply('Skipped the current song.');
  },
};
