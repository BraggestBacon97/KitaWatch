/* Experimental WebTorrent streaming.
 * The library is loaded from CDN at runtime (UMD build) to avoid the
 * Node-polyfill bundler churn of packaging it with Vite. */

interface WebTorrentFile {
  name: string;
  length: number;
  getBlobURL: (cb: (err: Error | null, url?: string) => void) => void;
}

interface Torrent {
  files: WebTorrentFile[];
  progress: number;
}

interface WebTorrentClient {
  add: (
    magnet: string,
    opts: Record<string, unknown>,
    cb: (torrent: Torrent) => void,
  ) => void;
  destroy: (cb?: () => void) => void;
}

declare global {
  interface Window {
    WebTorrent?: new (opts?: Record<string, unknown>) => WebTorrentClient;
  }
}

let loader: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load WebTorrent'));
    document.head.appendChild(el);
  });
}

const CDNS = [
  'https://cdn.jsdelivr.net/npm/webtorrent@1.9.7/webtorrent.min.js',
  'https://unpkg.com/webtorrent@1.9.7/webtorrent.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/webtorrent/1.9.7/webtorrent.min.js',
];

export async function ensureWebTorrent(): Promise<void> {
  if (window.WebTorrent) return;
  if (!loader) {
    loader = (async () => {
      for (const src of CDNS) {
        try {
          await loadScript(src);
          return;
        } catch {
          // try next CDN
        }
      }
      throw new Error('Could not load WebTorrent from any CDN');
    })();
  }
  await loader;
}

export interface TorrentStream {
  url: string;
  fileName: string;
}

/** Start streaming a magnet; resolves with a blob URL for the player.
 *  NOTE: WebTorrent in a browser only connects to WebRTC peers, so thin
 *  swarms may never buffer — that's a protocol limitation, not a bug. */
export async function startTorrentStream(
  magnet: string,
  onProgress: (pct: number) => void,
): Promise<TorrentStream> {
  await ensureWebTorrent();
  const client = new window.WebTorrent!();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.destroy();
      reject(
        new Error('Timed out finding peers — WebRTC swarms are often thin; try a more-seeded release'),
      );
    }, 60_000);

    client.add(magnet, {}, (torrent) => {
      const playable =
        torrent.files.find((f) => /\.(mp4|m4v|webm|mov)$/i.test(f.name)) ??
        torrent.files.reduce((a, b) => (a.length > b.length ? a : b));

      const progressTimer = setInterval(
        () => onProgress(Math.min(99, Math.round(torrent.progress * 100))),
        500,
      );

      playable.getBlobURL((err, url) => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        if (err || !url) {
          client.destroy();
          reject(err ?? new Error('Could not create a stream from this torrent'));
          return;
        }
        onProgress(100);
        resolve({ url, fileName: playable.name });
      });
    });
  });
}
