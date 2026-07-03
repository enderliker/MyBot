import { 
  AudioPlayer, 
  AudioPlayerStatus, 
  createAudioPlayer, 
  createAudioResource, 
  entersState,
  StreamType, 
  VoiceConnection,
  VoiceConnectionStatus
} from '@discordjs/voice';
import { Collection } from 'discord.js';
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

    console.log(`[Queue] Initialized GuildQueue for guild: ${guildId}`);

    this.player.on('stateChange', (oldState, newState) => {
      console.log(`[Queue Player] State changed from ${oldState.status} to ${newState.status}`);
    });

    this.connection.on('stateChange', (oldState, newState) => {
      console.log(`[Queue Connection] State changed from ${oldState.status} to ${newState.status}`);
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[Queue Player] Idle state reached. Playing next...`);
      this.playNext();
    });

    this.player.on('error', (error) => {
      console.error(`[Queue Player] Error emitted:`, error);
      this.textChannel.send(`Error playing track: ${error.message}`).catch(() => {});
      this.playNext();
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(`[Queue Connection] Connection disconnected. Attempting reconnect...`);
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        console.log(`[Queue Connection] Reconnection timed out. Destroying connection.`);
        this.destroy();
      }
    });
  }

  public addTrack(track: Track) {
    console.log(`[Queue] Adding single track: "${track.title}"`);
    this.tracks.push(track);
    if (this.tracks.length === 1 && this.player.state.status === AudioPlayerStatus.Idle) {
      console.log(`[Queue] Queue was idle, starting playback.`);
      this.play();
    }
  }

  public addTracks(tracks: Track[]) {
    console.log(`[Queue] Adding ${tracks.length} tracks to queue.`);
    this.tracks.push(...tracks);
    if (this.tracks.length === tracks.length && this.player.state.status === AudioPlayerStatus.Idle) {
      console.log(`[Queue] Queue was idle, starting playback.`);
      this.play();
    }
  }

  public async play() {
    if (this.tracks.length === 0) {
      console.log(`[Queue] play() called, but tracks queue is empty.`);
      return;
    }

    const currentTrack = this.tracks[0];
    console.log(`[Queue] Play request triggered for: "${currentTrack.title}"`);
    try {
      let playUrl = currentTrack.url;
      if (isSpotifyUrl(playUrl)) {
        console.log(`[Queue] Resolving Spotify metadata query on-the-fly...`);
        const query = `${currentTrack.title} ${currentTrack.artist || ''}`;
        const ytTrack = await searchYtdl(query, currentTrack.requester, {
          targetTitle: currentTrack.title,
          targetArtist: currentTrack.artist,
          targetDuration: currentTrack.duration,
        });
        playUrl = ytTrack.url;
      }
      
      console.log(`[Queue] Fetching audio stream for: "${currentTrack.title}" (${playUrl})`);
      const stream = getAudioStream(playUrl);
      
      console.log(`[Queue] Creating audio resource...`);
      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
      });

      console.log(`[Queue] Calling player.play()...`);
      this.player.play(resource);
      this.textChannel.send(`Now playing: **${currentTrack.title}** (Requested by: *${currentTrack.requester}*)`).catch(() => {});
    } catch (error: any) {
      console.error(`[Queue] Failed during playback configuration:`, error);
      this.textChannel.send(`Failed to play **${currentTrack.title}**: ${error.message}`).catch(() => {});
      this.playNext();
    }
  }

  public playNext() {
    console.log(`[Queue] Shifting current track out of queue.`);
    this.tracks.shift();
    if (this.tracks.length > 0) {
      console.log(`[Queue] Remaining tracks in queue: ${this.tracks.length}. Playing next.`);
      this.play();
    } else {
      console.log(`[Queue] No tracks left in queue. Destroying queue state.`);
      this.destroy();
    }
  }

  public skip() {
    console.log(`[Queue] Skip requested.`);
    this.player.stop();
  }

  public pause() {
    console.log(`[Queue] Pause requested.`);
    if (this.player.state.status !== AudioPlayerStatus.Paused) {
      this.player.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  public resume() {
    console.log(`[Queue] Resume requested.`);
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      this.player.unpause();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  public destroy() {
    console.log(`[Queue] Destroying GuildQueue instance for guild: ${this.guildId}`);
    this.tracks = [];
    this.player.stop();
    try {
      this.connection.destroy();
    } catch {}
    queues.delete(this.guildId);
  }
}

export const queues = new Collection<string, GuildQueue>();
