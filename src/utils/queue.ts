import { 
  AudioPlayer, 
  AudioPlayerStatus, 
  createAudioPlayer, 
  createAudioResource, 
  StreamType, 
  VoiceConnection 
} from '@discordjs/voice';
import { Collection, TextBasedChannel } from 'discord.js';
import { Track } from '../types/music';
import { getAudioStream, searchYtdl } from './ytdlp';
import { isSpotifyUrl } from './spotify';

export class GuildQueue {
  public guildId: string;
  public tracks: Track[] = [];
  public connection: VoiceConnection;
  public player: AudioPlayer;
  public textChannel: any;
  public isPaused: boolean = false;

  constructor(guildId: string, connection: VoiceConnection, textChannel: any) {
    this.guildId = guildId;
    this.connection = connection;
    this.textChannel = textChannel;
    this.player = createAudioPlayer();

    this.connection.subscribe(this.player);

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
    });

    this.player.on('error', (error) => {
      this.textChannel.send(`Error playing track: ${error.message}`).catch(() => {});
      this.playNext();
    });
  }

  public addTrack(track: Track) {
    this.tracks.push(track);
    if (this.tracks.length === 1 && this.player.state.status === AudioPlayerStatus.Idle) {
      this.play();
    }
  }

  public addTracks(tracks: Track[]) {
    this.tracks.push(...tracks);
    if (this.tracks.length === tracks.length && this.player.state.status === AudioPlayerStatus.Idle) {
      this.play();
    }
  }

  public async play() {
    if (this.tracks.length === 0) {
      return;
    }

    const currentTrack = this.tracks[0];
    try {
      let playUrl = currentTrack.url;
      if (isSpotifyUrl(playUrl)) {
        const query = `${currentTrack.title} ${currentTrack.artist || ''}`;
        const ytTrack = await searchYtdl(query, currentTrack.requester, {
          targetTitle: currentTrack.title,
          targetArtist: currentTrack.artist,
          targetDuration: currentTrack.duration,
        });
        playUrl = ytTrack.url;
      }
      
      const stream = getAudioStream(playUrl);
      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
      });

      this.player.play(resource);
      this.textChannel.send(`Now playing: **${currentTrack.title}** (Requested by: *${currentTrack.requester}*)`).catch(() => {});
    } catch (error: any) {
      this.textChannel.send(`Failed to play **${currentTrack.title}**: ${error.message}`).catch(() => {});
      this.playNext();
    }
  }

  public playNext() {
    this.tracks.shift();
    if (this.tracks.length > 0) {
      this.play();
    } else {
      this.destroy();
    }
  }

  public skip() {
    this.player.stop();
  }

  public pause() {
    if (this.player.state.status !== AudioPlayerStatus.Paused) {
      this.player.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  public resume() {
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      this.player.unpause();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  public destroy() {
    this.tracks = [];
    this.player.stop();
    try {
      this.connection.destroy();
    } catch {}
    queues.delete(this.guildId);
  }
}

export const queues = new Collection<string, GuildQueue>();
