import { useSettingsStore } from '@/stores/settingsStore';

export interface NyaaResult {
  title: string;
  magnet: string;
  size: string;
  seeders: number;
}

const NYAA_SEARCH = 'https://nyaa.si/?q={q}&c=1_2&f=0';

/** Search Nyaa (English-translated anime category), sorted by seeders. */
export async function searchNyaa(query: string): Promise<NyaaResult[]> {
  const target = NYAA_SEARCH.replace('{q}', encodeURIComponent(query));

  const proxyBase = useSettingsStore.getState().proxyBaseUrl;
  const proxyUrl = `${proxyBase}/fetch?u=${encodeURIComponent(target)}&ref=${encodeURIComponent('https://nyaa.si/')}`;

  let html: string;
  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Proxy failed');
    html = await res.text();
  } catch (e) {
    throw new Error('Nyaa unreachable through local proxy');
  }

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
