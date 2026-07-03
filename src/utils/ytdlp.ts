import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { Track } from '../types/music';
import { Readable } from 'stream';

const localBin = join(__dirname, '..', '..', 'bin', 'yt-dlp');
const YTDLP_BIN = existsSync(localBin) ? localBin : 'yt-dlp';

const FALLBACK_INSTANCES = [
  'yewtu.be',
  'invidious.nerdvpn.de',
  'invidious.flokinet.to',
  'invidious.projectsegfau.lt',
  'invidious.privacydev.net'
];

async function getHealthyInvidiousInstance(): Promise<string> {
  try {
    const res = await fetch('https://api.invidious.io/instances.json');
    if (!res.ok) throw new Error('Status not OK');
    const data = await res.json() as [string, any][];
    
    const healthy = data
      .filter(([name, info]) => {
        return info.type === 'https' && 
               info.monitor && 
               info.monitor.last_status === 200 && 
               info.monitor.down === false;
      })
      .map(([name]) => name);

    if (healthy.length > 0) {
      return healthy[Math.floor(Math.random() * healthy.length)];
    }
  } catch (err) {
    console.warn(`[Invidious] Failed to fetch public instances:`, err);
  }
  return FALLBACK_INSTANCES[Math.floor(Math.random() * FALLBACK_INSTANCES.length)];
}

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

export async function searchYtdl(query: string, requester: string, options?: SearchOptions): Promise<Track> {
  const isUrl = query.startsWith('http://') || query.startsWith('https://');
  
  if (isUrl) {
    let playUrl = query;
    const ytMatch = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];
      const instance = await getHealthyInvidiousInstance();
      playUrl = `https://${instance}/watch?v=${videoId}`;
      console.log(`[ytdlp] Direct YouTube URL converted to Invidious URL: ${playUrl}`);
    }

    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',
        '--no-playlist',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player_client=ios,web',
        '--',
        playUrl
      ];

      console.log(`[ytdlp] Spawning info process: ${YTDLP_BIN} ${args.join(' ')}`);
      const child = spawn(YTDLP_BIN, args);
      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (d) => { stdoutData += d.toString(); });
      child.stderr.on('data', (d) => { stderrData += d.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`[ytdlp] Info process exited with code ${code}. Error: ${stderrData}`);
          reject(new Error(`yt-dlp info failed: ${stderrData}`));
          return;
        }
        try {
          const metadata = JSON.parse(stdoutData);
          resolve({
            title: metadata.title,
            url: playUrl,
            duration: Math.round(metadata.duration || 0),
            requester,
            artist: metadata.uploader,
            thumbnail: metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails[0]?.url)
          });
        } catch (err) {
          reject(err);
        }
      });

      child.on('error', (err) => {
        console.error(`[ytdlp] Spawn error during info check:`, err);
        reject(err);
      });
    });
  }

  const instance = await getHealthyInvidiousInstance();
  console.log(`[ytdlp] Querying Invidious search API: ${instance}`);

  try {
    const searchUrl = `https://${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
    const response = await fetch(searchUrl);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const resultsData = await response.json() as any[];

    if (!resultsData || resultsData.length === 0) {
      throw new Error('No results returned from Invidious API');
    }

    const mappedResults = resultsData.map(res => ({
      title: res.title,
      url: `https://${instance}/watch?v=${res.videoId}`,
      duration: res.lengthSeconds,
      view_count: res.viewCount,
      uploader: res.author,
      thumbnail: res.videoThumbnails?.[0]?.url
    }));

    const bestMatch = selectBestResult(mappedResults, query, options);
    console.log(`[ytdlp] Invidious search resolved to: "${bestMatch.title}" (${bestMatch.url})`);

    return {
      title: bestMatch.title,
      url: bestMatch.url,
      duration: bestMatch.duration,
      requester,
      artist: bestMatch.uploader,
      thumbnail: bestMatch.thumbnail
    };
  } catch (err: any) {
    console.warn(`[ytdlp] Invidious search failed: ${err.message}. Falling back to standard ytsearch.`);
    
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',
        '--no-playlist',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player_client=ios,web',
        '--',
        `ytsearch5:${query}`
      ];

      console.log(`[ytdlp] Spawning fallback search process: ${YTDLP_BIN} ${args.join(' ')}`);
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
          console.error(`[ytdlp] Fallback search process exited with code ${code}. Error: ${stderrData}`);
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

          console.log(`[ytdlp] Fallback search resolved to: "${bestMatch.title}" (${bestMatch.webpage_url || bestMatch.url})`);
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
        console.error(`[ytdlp] Spawn error during fallback search:`, err);
        reject(err);
      });
    });
  }
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
