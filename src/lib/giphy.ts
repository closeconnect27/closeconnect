// Giphy's REST API called directly from the client (NEXT_PUBLIC_ key, no
// server action) -- there's no user-specific data involved, just a public
// search, so a round trip through a server action would only add latency.
// 100 req/hr per key (Giphy's free tier) is the reason both trending and
// per-query search results are cached: trending for 5 minutes (module-level
// variable, survives across GifPicker opens within that window), search
// results for the whole session (a plain Map, cleared only on a full page
// reload) since the same query typed twice shouldn't cost a second call.

export type GiphyResult = { id: string; url: string; previewUrl: string; width: number; height: number };

const RATING = "pg-13";
const TRENDING_TTL_MS = 5 * 60 * 1000;

let trendingCache: { fetchedAt: number; limit: number; results: GiphyResult[] } | null = null;
const searchCache = new Map<string, GiphyResult[]>();

type GiphyImage = { url: string; width: string; height: string };
type GiphyGif = {
  id: string;
  images: {
    original: GiphyImage;
    fixed_width_small?: GiphyImage;
    preview_gif?: GiphyImage;
  };
};

function apiKey(): string {
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if (!key) throw new Error("GIF search isn't configured right now");
  return key;
}

async function callGiphy(path: string, params: Record<string, string>): Promise<GiphyResult[]> {
  const url = new URL(`https://api.giphy.com/v1/gifs/${path}`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("rating", RATING);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (res.status === 429) throw new Error("Too many GIF searches right now -- try again in a bit");
  if (!res.ok) throw new Error("Could not load GIFs");

  const json = (await res.json()) as { data: GiphyGif[] };
  return json.data.map((g) => {
    const preview = g.images.fixed_width_small ?? g.images.preview_gif ?? g.images.original;
    return {
      id: g.id,
      url: g.images.original.url,
      previewUrl: preview.url,
      width: Number(g.images.original.width),
      height: Number(g.images.original.height),
    };
  });
}

export async function getTrendingGifs(limit = 24): Promise<GiphyResult[]> {
  const now = Date.now();
  if (trendingCache && trendingCache.limit === limit && now - trendingCache.fetchedAt < TRENDING_TTL_MS) {
    return trendingCache.results;
  }
  const results = await callGiphy("trending", { limit: String(limit) });
  trendingCache = { fetchedAt: now, limit, results };
  return results;
}

export async function searchGifs(query: string, limit = 24): Promise<GiphyResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return getTrendingGifs(limit);

  const cacheKey = `${trimmed.toLowerCase()}::${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const results = await callGiphy("search", { q: trimmed, limit: String(limit) });
  searchCache.set(cacheKey, results);
  return results;
}
