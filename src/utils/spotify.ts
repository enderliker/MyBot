export interface SpotifyResolvedTrack {
  title: string;
  artist: string;
  duration: number;
  url: string;
  thumbnail?: string;
}

const clientId = process.env.SPOTIFY_CLIENT_ID || '';
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';

let accessToken = '';
let tokenExpiration = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiration) {
    return accessToken;
  }

  if (!clientId || !clientSecret) {
    return '';
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      return '';
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    tokenExpiration = Date.now() + data.expires_in * 1000 - 60000;
    return accessToken;
  } catch {
    return '';
  }
}

export function isSpotifyUrl(url: string): boolean {
  return /https:\/\/open\.spotify\.com\/(track|playlist|album)\/[a-zA-Z0-9]+/.test(url);
}

export async function resolveSpotifyUrl(url: string): Promise<SpotifyResolvedTrack[]> {
  const match = url.match(/https:\/\/open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
  if (!match) return [];

  const [, type, id] = match;
  const token = await getAccessToken();

  if (!token) {
    if (type === 'track') {
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
      const response = await fetch(oembedUrl);
      if (!response.ok) {
        throw new Error('Failed to resolve Spotify track metadata via public oEmbed API.');
      }
      const data = await response.json() as { title: string; thumbnail_url?: string };
      const titleParts = data.title.split(' by ');
      const title = titleParts[0] || 'Unknown';
      const artist = titleParts.slice(1).join(' by ') || 'Unknown';
      return [{
        title,
        artist,
        duration: 0,
        url,
        thumbnail: data.thumbnail_url
      }];
    } else {
      throw new Error('Spotify API credentials (SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET) are required for playlists/albums.');
    }
  }

  const headers = { 'Authorization': `Bearer ${token}` };

  if (type === 'track') {
    const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, { headers });
    if (!response.ok) throw new Error('Failed to fetch Spotify track details');
    const data = await response.json() as any;
    return [{
      title: data.name,
      artist: data.artists.map((a: any) => a.name).join(', '),
      duration: Math.round(data.duration_ms / 1000),
      url: data.external_urls?.spotify || url,
      thumbnail: data.album?.images?.[0]?.url,
    }];
  }

  if (type === 'playlist') {
    let tracks: SpotifyResolvedTrack[] = [];
    let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`;

    while (nextUrl) {
      const response = await fetch(nextUrl, { headers });
      if (!response.ok) throw new Error('Failed to fetch Spotify playlist tracks');
      const data = await response.json() as any;
      
      for (const item of data.items) {
        if (!item.track) continue;
        tracks.push({
          title: item.track.name,
          artist: item.track.artists.map((a: any) => a.name).join(', '),
          duration: Math.round(item.track.duration_ms / 1000),
          url: item.track.external_urls?.spotify || '',
          thumbnail: item.track.album?.images?.[0]?.url,
        });
      }
      nextUrl = data.next;
    }
    return tracks;
  }

  if (type === 'album') {
    const albumResponse = await fetch(`https://api.spotify.com/v1/albums/${id}`, { headers });
    if (!albumResponse.ok) throw new Error('Failed to fetch Spotify album details');
    const albumData = await albumResponse.json() as any;
    const albumThumbnail = albumData.images?.[0]?.url;

    let tracks: SpotifyResolvedTrack[] = [];
    let nextUrl: string | null = `https://api.spotify.com/v1/albums/${id}/tracks?limit=100`;

    while (nextUrl) {
      const response = await fetch(nextUrl, { headers });
      if (!response.ok) throw new Error('Failed to fetch Spotify album tracks');
      const data = await response.json() as any;

      for (const item of data.items) {
        tracks.push({
          title: item.name,
          artist: item.artists.map((a: any) => a.name).join(', '),
          duration: Math.round(item.duration_ms / 1000),
          url: item.external_urls?.spotify || '',
          thumbnail: albumThumbnail,
        });
      }
      nextUrl = data.next;
    }
    return tracks;
  }

  return [];
}
