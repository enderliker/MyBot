import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { Track } from '../types/music';
import { Readable } from 'stream';

const localBin = join(__dirname, '..', '..', 'bin', 'yt-dlp');
const YTDLP_BIN = existsSync(localBin) ? localBin : 'yt-dlp';

export interface SearchOptions {
  targetTitle?: string;
  targetArtist?: string;
  targetDuration?: number;
}

function selectBestResult(results: any[], rawQuery: string, options?: SearchOptions): any {
  const queryLower = rawQuery.toLowerCase();
  let bestResult = results[0];
  let highestScore = -Infinity;

  for (const res of results) {
    let score = 0;

    const views = res.view_count || 0;
    score += Math.log10(views + 1);

    const uploader = (res.uploader || '').toLowerCase();
    if (uploader.endsWith(' - topic')) {
      score += 15;
    } else if (uploader.includes('vevo')) {
      score += 12;
    }

    const title = (res.title || '').toLowerCase();

    if (options && options.targetTitle) {
      const targetTitleLower = options.targetTitle.toLowerCase();
      const targetArtistLower = options.targetArtist ? options.targetArtist.toLowerCase() : '';

      if (title.includes(targetTitleLower)) {
        score += 20;
      }
      
      if (targetArtistLower) {
        const artists = targetArtistLower.split(',').map(a => a.trim());
        for (const artist of artists) {
          if (title.includes(artist) || uploader.includes(artist)) {
            score += 10;
          }
        }
      }

      if (options.targetDuration && res.duration) {
        const diff = Math.abs(res.duration - options.targetDuration);
        if (diff <= 5) {
          score += 15;
        } else if (diff <= 15) {
          score += 8;
        } else if (diff > 60) {
          score -= 15;
        } else if (diff > 180) {
          score -= 30;
        }
      }
    } else {
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      let matches = 0;
      for (const word of queryWords) {
        if (title.includes(word)) {
          matches++;
        }
      }
      score += matches * 5;
    }

    if (title.includes('official audio') || title.includes('official track')) {
      score += 8;
    } else if (title.includes('lyrics') || title.includes('lyric video')) {
      score += 6;
    } else if (title.includes('official video') || title.includes('official music video')) {
      score += 4;
    }

    const negativeKeywords = ['cover', 'remix', 'live', 'mashup', 'tutorial', 'karaoke', 'instrumental'];
    for (const kw of negativeKeywords) {
      if (title.includes(kw) && !queryLower.includes(kw)) {
        score -= 20;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestResult = res;
    }
  }

  return bestResult;
}

export function searchYtdl(query: string, requester: string, options?: SearchOptions): Promise<Track> {
  return new Promise((resolve, reject) => {
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const args = [
      '--dump-json', 
      '--no-playlist', 
      '--js-runtimes', 'node',
      '--extractor-args', 'youtube:player_client=ios,web',
      '--'
    ];
    
    if (isUrl) {
      args.push(query);
    } else {
      args.push(`ytsearch5:${query}`);
    }

    console.log(`[ytdlp] Spawning search process: ${YTDLP_BIN} ${args.join(' ')}`);
    const child = spawn(YTDLP_BIN, args);
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
        console.error(`[ytdlp] Search process exited with code ${code}. Error: ${stderrData}`);
        reject(new Error(`yt-dlp search failed with code ${code}: ${stderrData}`));
        return;
      }

      try {
        const lines = stdoutData.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) {
          reject(new Error('No search results found.'));
          return;
        }

        const results = lines.map(line => JSON.parse(line));
        let bestMatch = results[0];
        
        if (results.length > 1) {
          bestMatch = selectBestResult(results, query, options);
        }

        console.log(`[ytdlp] Search resolved to: "${bestMatch.title}" (${bestMatch.webpage_url || bestMatch.url})`);
        resolve({
          title: bestMatch.title,
          url: bestMatch.webpage_url || bestMatch.url,
          duration: Math.round(bestMatch.duration || 0),
          requester,
          artist: bestMatch.uploader,
          thumbnail: bestMatch.thumbnail || (bestMatch.thumbnails && bestMatch.thumbnails[0]?.url)
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp metadata: ${err}`));
      }
    });

    child.on('error', (err) => {
      console.error(`[ytdlp] Spawn error during search:`, err);
      reject(err);
    });
  });
}

export function getAudioStream(url: string): Readable {
  console.log(`[ytdlp] Spawning audio stream process: ${YTDLP_BIN} -o - -f bestaudio --no-playlist --js-runtimes node --extractor-args youtube:player_client=ios,web -- ${url}`);
  const child = spawn(YTDLP_BIN, [
    '-o', '-',
    '-f', 'bestaudio',
    '--no-playlist',
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=ios,web',
    '--',
    url
  ]);

  child.on('error', (err) => {
    console.error('[ytdlp] Failed to spawn yt-dlp audio stream process:', err);
  });

  child.stderr.on('data', (data) => {
    console.log(`[ytdlp stream stderr] ${data.toString().trim()}`);
  });

  return child.stdout;
}
