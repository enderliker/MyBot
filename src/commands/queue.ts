import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types/command';
import { queues } from '../utils/queue';

export const queue: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue'),
  async execute(interaction: ChatInputCommandInteraction) {
    const queue = queues.get(interaction.guildId!);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({ content: 'There are no songs in the queue!', ephemeral: true });
      return;
    }

    const currentTrack = queue.tracks[0];
    let reply = `**Now Playing:** ${currentTrack.title} (${currentTrack.artist || 'Unknown Artist'}) | Requested by: ${currentTrack.requester}\n\n`;

    if (queue.tracks.length > 1) {
      reply += `**Up Next:**\n`;
      const upNext = queue.tracks.slice(1, 11);
      upNext.forEach((track, index) => {
        reply += `${index + 1}. ${track.title} (${track.artist || 'Unknown Artist'}) | Requested by: ${track.requester}\n`;
      });

      if (queue.tracks.length > 11) {
        reply += `...and ${queue.tracks.length - 11} more tracks.`;
      }
    }

    await interaction.reply(reply);
  },
};
