import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import { Command } from '../types/command';
import { searchYtdl } from '../utils/ytdlp';
import { isSpotifyUrl, resolveSpotifyUrl } from '../utils/spotify';
import { queues, GuildQueue } from '../utils/queue';
import { Track } from '../types/music';

export const play: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube or Spotify')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song name, YouTube URL, or Spotify URL')
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.reply({ content: 'You must be in a voice channel to use this command!', ephemeral: true });
      return;
    }

    if (!voiceChannel.joinable) {
      await interaction.reply({ content: 'I cannot join your voice channel. Make sure I have permissions!', ephemeral: true });
      return;
    }

    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    try {
      const guildId = interaction.guildId!;
      let queue = queues.get(guildId);

      if (!queue) {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        queue = new GuildQueue(guildId, connection, interaction.channel!);
        queues.set(guildId, queue);
      }

      const requester = interaction.user.tag;

      if (isSpotifyUrl(query)) {
        const spotifyTracks = await resolveSpotifyUrl(query);
        if (spotifyTracks.length === 0) {
          await interaction.editReply('Could not find any tracks at that Spotify URL.');
          return;
        }

        const tracks: Track[] = spotifyTracks.map(t => ({
          title: t.title,
          artist: t.artist,
          url: t.url,
          duration: t.duration,
          requester,
        }));

        queue.addTracks(tracks);

        if (tracks.length === 1) {
          await interaction.editReply(`Added Spotify track: **${tracks[0].title}** to the queue.`);
        } else {
          await interaction.editReply(`Added **${tracks.length}** tracks from Spotify to the queue.`);
        }
      } else {
        const track = await searchYtdl(query, requester);
        queue.addTrack(track);
        await interaction.editReply(`Added **${track.title}** to the queue.`);
      }
    } catch (error: any) {
      console.error(error);
      await interaction.editReply(`There was an error trying to play: ${error.message}`);
    }
  },
};
