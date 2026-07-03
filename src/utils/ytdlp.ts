import { spawn } from 'child_process';
import { Track } from '../types/music';
import { Readable } from 'stream';

export function searchYtdl(query: string, requester: string): Promise<Track> {
  return new Promise((resolve, reject) => {
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const target = isUrl ? query : `ytsearch1:${query}`;
    
    const child = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      target
    ]);

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp search failed with code ${code}: ${stderrData}`));
        return;
      }

      try {
        const metadata = JSON.parse(stdoutData);
        resolve({
          title: metadata.title,
          url: metadata.webpage_url || metadata.url,
          duration: Math.round(metadata.duration || 0),
          requester,
          thumbnail: metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails[0]?.url)
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp metadata: ${err}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

export function getAudioStream(url: string): Readable {
  const child = spawn('yt-dlp', [
    '-o', '-',
    '-f', 'bestaudio',
    '--no-playlist',
    url
  ]);

  return child.stdout;
}
