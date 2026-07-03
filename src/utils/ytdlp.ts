import { spawn } from 'child_process';
import { Track } from '../types/music';
import { Readable } from 'stream';

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
    const args = ['--dump-json', '--no-playlist'];
    
    if (isUrl) {
      args.push(query);
    } else {
      args.push(`ytsearch5:${query}`);
    }

    const child = spawn('yt-dlp', args);
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
