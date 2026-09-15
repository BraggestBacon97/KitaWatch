import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';
import VideoPlayer from '@/components/player/VideoPlayer';
import TorrentPanel from '@/components/player/TorrentPanel';
import ProviderCheck from '@/components/player/ProviderCheck';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import Disclaimer from '@/components/ui/Disclaimer';
import { api } from '@/services/api';
import { anilist } from '@/services/anilist';
import { resolveStreams } from '@/services/streamResolver';
import { useApi } from '@/hooks/useApi';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHistoryStore } from '@/stores/historyStore';
import type { StreamSource } from '@/types';

const fetchInfo = (id: string) =>
  api.info(id).catch(() => anilist.info(id).catch(() => api.info(id)));

export default function Watch() {
  const { id, episode } = useParams<{ id: string; episode: string }>();
  const navigate = useNavigate();
  const epNum = Number(episode) || 1;
  const autoplayNext = useSettingsStore((s) => s.autoplayNext);

  const info = useApi(() => fetchInfo(id!), [id]);
  const streams = useApi(
    () => resolveStreams(id!, epNum, 'sub', info.data?.title),
    [id, epNum, info.data?.title],
  );

  const sources = streams.data?.streams ?? [];
  const [active, setActive] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [torrent, setTorrent] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    setActive(0);
    setExhausted(false);
    setTorrent(null);
  }, [id, epNum, streams.data]);

  useEffect(() => {
    if (info.data && sources.length > 0) {
      useHistoryStore.getState().upsert({
        animeId: Number(id),
        episode: epNum,
        title: info.data.title,
        cover: info.data.cover,
      });
    }
  }, [info.data, sources.length, id, epNum]);

  const totalEpisodes = info.data?.totalEpisodes;
  const hasNext = totalEpisodes == null || epNum < totalEpisodes;
  const activeSource = sources[active];

  const httpPlayer = activeSource && (
    <VideoPlayer
      key={`http-${active}-${activeSource.url}`}
      source={activeSource}
      hasNextEpisode={hasNext}
      autoplayNext={autoplayNext}
      subtitles={streams.data?.subtitles}
      poster={info.data?.banner ?? info.data?.cover}
      onFatal={() => {
        if (active + 1 < sources.length) setActive(active + 1);
        else setExhausted(true);
      }}
      onEnded={() => navigate(`/watch/${id}/${epNum + 1}`)}
    />
  );

  const torrentSource: StreamSource | null = torrent && {
    type: 'mp4',
    url: torrent.url,
    server: torrent.label,
  };

  return (
    <PageContainer className="!space-y-5">
      <div className="flex items-center gap-4">
        <Link
          to={`/anime/${id}`}
          className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        {info.loading ? (
          <Skeleton className="h-6 w-64" />
        ) : (
          <p className="min-w-0 truncate text-sm text-zinc-300">
            <span className="font-semibold text-white">{info.data?.title}</span>
            <span className="mx-2 text-zinc-600">·</span>
            Episode {epNum}
          </p>
        )}
      </div>

      {/* Player (HTTP sources first, torrent blob as last resort) */}
      {streams.loading ? (
        <Skeleton className="aspect-video rounded-2xl" />
      ) : activeSource && !exhausted ? (
        httpPlayer
      ) : torrentSource ? (
        <VideoPlayer
          key={`torrent-${torrentSource.url}`}
          source={torrentSource}
          hasNextEpisode={hasNext}
          autoplayNext={autoplayNext}
          poster={info.data?.banner ?? info.data?.cover}
          onFatal={() => setTorrent(null)}
          onEnded={() => navigate(`/watch/${id}/${epNum + 1}`)}
        />
      ) : sources.length === 0 ? null : (
        <ErrorState
          title="No playable stream found"
          message="Every source failed. Retry, or try the torrent fallback below."
          onRetry={streams.reload}
        />
      )}

      {/* Torrent fallback — when nothing else worked */}
      {!streams.loading && info.data && (
        <TorrentPanel
          animeTitle={info.data.title}
          onStream={(url, label) => {
            setTorrent({ url, label });
            setExhausted(false);
          }}
        />
      )}

      {/* Provider availability probe */}
      {!streams.loading && info.data && (
        <ProviderCheck animeId={id!} title={info.data.title} episode={epNum} />
      )}

      {/* Source selector */}
      {!streams.loading && sources.length > 0 && !torrent && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Sources
          </span>
          {sources.map((s, i) => (
            <button
              key={`${s.server ?? 'src'}-${i}`}
              onClick={() => {
                setActive(i);
                setExhausted(false);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 transition ${
                i === active && !exhausted
                  ? 'bg-accent-600/20 text-accent-300 ring-accent-500/50'
                  : 'bg-ink-850 text-zinc-400 ring-white/10 hover:text-zinc-100'
              }`}
            >
              {s.server ?? `Source ${i + 1}`}
              {s.quality && <span className="text-zinc-500">· {s.quality}</span>}
              {s.audio === 'sub' && <Badge variant="sub">Sub</Badge>}
              {s.audio === 'dub' && <Badge variant="dub">Dub</Badge>}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={epNum <= 1}
          onClick={() => navigate(`/watch/${id}/${epNum - 1}`)}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => navigate(`/watch/${id}/${epNum + 1}`)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-w-md">
        <Disclaimer />
      </div>
    </PageContainer>
  );
}
