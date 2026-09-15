export interface NyaaResult {
  title: string;
  magnet: string;
  size: string;
  seeders: number;
}

const NYAA_SEARCH = 'https://nyaa.si/?q={q}&c=1_2&f=0';

// Nyaa has no CORS headers — reach it through public CORS proxies.
const PROXIES: ((u: string) => string)[] = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

/** Search Nyaa (English-translated anime category), sorted by seeders. */
export async function searchNyaa(query: string): Promise<NyaaResult[]> {
  const target = NYAA_SEARCH.replace('{q}', encodeURIComponent(query));
  let html: string | null = null;
  for (const wrap of PROXIES) {
    try {
      const res = await fetch(wrap(target));
      if (!res.ok) continue;
      html = await res.text();
      if (html) break;
    } catch {
      // try next proxy
    }
  }
  if (!html) throw new Error('Nyaa unreachable (CORS proxies down?)');

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('tr')].filter((tr) =>
    tr.querySelector('a[href^="magnet:"]'),
  );

  const results: NyaaResult[] = rows.map((tr) => {
    const magnet = tr.querySelector('a[href^="magnet:"]')?.getAttribute('href') ?? '';
    const title = tr.querySelector('a[href*="/view/"]')?.textContent?.trim() ?? 'Unknown';
    const cells = [...tr.querySelectorAll('td')];
    const size = cells[cells.length - 4]?.textContent?.trim() ?? '';
    const seeders = Number(cells[cells.length - 3]?.textContent?.trim() ?? 0);
    return { title, magnet, size, seeders };
  });

  return results.sort((a, b) => b.seeders - a.seeders).slice(0, 15);
}
