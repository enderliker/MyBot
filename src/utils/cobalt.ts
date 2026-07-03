export interface CobaltStreamResponse {
  status: string;
  url?: string;
  error?: {
    code: string;
  };
}

let cachedInstances: string[] = [];
let lastCacheTime = 0;
const CACHE_DURATION = 15 * 60 * 1000;

async function fetchWorkingInstances(): Promise<string[]> {
  try {
    const res = await fetch('https://cobalt.directory/api/working', {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];
    const data = await res.json() as { data?: { youtube?: string[] } };
    const instances = data.data?.youtube || [];
    return instances.filter(url => url.startsWith('http'));
  } catch (err) {
    console.error('[cobalt] Failed to fetch instances list:', err);
    return [];
  }
}

export async function getWorkingInstances(): Promise<string[]> {
  const now = Date.now();
  if (cachedInstances.length > 0 && (now - lastCacheTime < CACHE_DURATION)) {
    return cachedInstances;
  }
  const fresh = await fetchWorkingInstances();
  if (fresh.length > 0) {
    cachedInstances = fresh;
    lastCacheTime = now;
    return fresh;
  }
  return cachedInstances;
}

export async function resolveCobaltStream(url: string): Promise<string> {
  const instances = await getWorkingInstances();
  if (instances.length === 0) {
    throw new Error('No working Cobalt instances available');
  }

  for (const api of instances) {
    try {
      console.log(`[cobalt] Trying to resolve stream via: ${api}`);
      const res = await fetch(api, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          downloadMode: 'audio'
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!res.ok) continue;
      const data = await res.json() as CobaltStreamResponse;

      if ((data.status === 'stream' || data.status === 'tunnel' || data.status === 'redirect') && data.url) {
        console.log(`[cobalt] Successfully resolved stream from: ${api}`);
        return data.url;
      }
    } catch (err: any) {
      console.warn(`[cobalt] Instance ${api} failed:`, err.message);
    }
  }

  throw new Error('All available Cobalt instances failed to resolve stream');
}
