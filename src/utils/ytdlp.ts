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

function parseDuration(text?: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseViews(text?: string): number {
  if (!text) return 0;
  return parseInt(text.replace(/[^0-9]/g, '')) || 0;
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

async function scrapeSearch(query: string): Promise<any[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  const html = await res.text();
  const match = html.match(/ytInitialData\s*=\s*({.+?});/);
  if (!match) {
    throw new Error('Could not parse search results');
  }

  const data = JSON.parse(match[1]);
  const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
  if (!contents) {
    throw new Error('No contents found in search page');
  }

  const results: any[] = [];
  for (const section of contents) {
    const itemSection = section.itemSectionRenderer;
    if (!itemSection || !itemSection.contents) continue;
    for (const item of itemSection.contents) {
      const video = item.videoRenderer;
      if (video) {
        results.push({
          title: video.title?.runs?.[0]?.text || 'Unknown Title',
          videoId: video.videoId,
          url: `https://music.youtube.com/watch?v=${video.videoId}`,
          uploader: video.ownerText?.runs?.[0]?.text || 'Unknown Artist',
          duration: parseDuration(video.lengthText?.simpleText),
          view_count: parseViews(video.viewCountText?.simpleText),
          thumbnail: video.thumbnail?.thumbnails?.[0]?.url
        });
      }
    }
  }
  return results;
}

export async function searchYtdl(query: string, requester: string, options?: SearchOptions): Promise<Track> {
  const isUrl = query.startsWith('http://') || query.startsWith('https://');
  
  if (isUrl) {
    let playUrl = query;
    const ytMatch = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      playUrl = `https://music.youtube.com/watch?v=${ytMatch[1]}`;
    }

    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',
        '--no-playlist',
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

  console.log(`[ytdlp] Scraping YouTube search page HTML for: "${query}"`);
  const scrapedResults = await scrapeSearch(query);
  if (scrapedResults.length === 0) {
    throw new Error('No search results found.');
  }

  const bestMatch = selectBestResult(scrapedResults, query, options);
  console.log(`[ytdlp] Search resolved to: "${bestMatch.title}" (${bestMatch.url})`);

  return {
    title: bestMatch.title,
    url: bestMatch.url,
    duration: bestMatch.duration,
    requester,
    artist: bestMatch.uploader,
    thumbnail: bestMatch.thumbnail
  };
}

export async function getAudioStream(url: string): Promise<Readable> {
  let playUrl = url;
  const ytMatch = url.match(/(?:watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    playUrl = `https://music.youtube.com/watch?v=${ytMatch[1]}`;
  }

  console.log(`[ytdlp] Spawning audio stream process: ${YTDLP_BIN} -o - -f bestaudio --no-playlist --js-runtimes node --extractor-args youtube:player_client=ios,web -- ${playUrl}`);
  const child = spawn(YTDLP_BIN, [
    '-o', '-',
    '-f', 'bestaudio',
    '--no-playlist',
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=ios,web',
    '--',
    playUrl
  ]);

  child.on('error', (err) => {
    console.error('[ytdlp] Failed to spawn yt-dlp audio stream process:', err);
  });

  child.stderr.on('data', (data) => {
    console.log(`[ytdlp stream stderr] ${data.toString().trim()}`);
  });

  return child.stdout;
}
