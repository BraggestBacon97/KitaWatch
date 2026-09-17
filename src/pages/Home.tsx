import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';
import AnimeRow from '@/components/anime/AnimeRow';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { api } from '@/services/api';
import { useHistoryStore } from '@/stores/historyStore';
import type { HistoryEntry } from '@/stores/historyStore';
import { useApi } from '@/hooks/useApi';
import type { SpotlightAnime, Paged, AnimeSummary } from '@/types';

function Hero({ anime }: { anime: SpotlightAnime }) {
  const navigate = useNavigate();
  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl ring-1 ring-white/5">
      {anime.banner || anime.cover ? (
        <img
          src={anime.banner ?? anime.cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-ink-800" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950/80 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 max-w-2xl p-8">
        <Badge variant="accent">#1 Spotlight</Badge>
        <h1 className="mt-3 text-4xl font-bold text-white drop-shadow-lg">
          {anime.title}
        </h1>
        {anime.description && (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-300">
            {anime.description}
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <Button onClick={() => navigate(`/watch/${anime.id}/1`)}>
            <Play className="h-4 w-4 fill-current" /> Watch Now
          </Button>
          <Button variant="outline" onClick={() => navigate(`/anime/${anime.id}`)}>
            Details
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const spotlight = useApi(api.spotlight, [], { retries: 8 });
  const trending = useApi(() => api.trending(1, 14), []);
  const popular = useApi(() => api.popular(1, 14), []);
  const recent = useApi(() => api.recent(1, 14), []);
  const historyEntries = useHistoryStore((s) => s.entries);
  const continueWatching = historyEntries.slice(0, 14).map((h) => ({
    id: h.animeId,
    title: h.title,
    cover: h.cover,
  }));

  const latestWatch = historyEntries[0];
  const recommendations = useApi(
    () =>
      latestWatch
        ? api.recommendations(latestWatch.animeId, 1)
        : Promise.resolve({
            page: 1,
            perPage: 0,
            total: 0,
            hasNextPage: false,
            results: [],
          } as Paged<AnimeSummary>),
    [latestWatch?.animeId]
  );

  return (
    <PageContainer>
      {spotlight.error && !spotlight.data ? (
        <ErrorState
          title="Couldn't reach the API"
          message={`${spotlight.error} Check that the Kuhi API is running, or update the URL in Settings.`}
          onRetry={spotlight.reload}
        />
      ) : spotlight.loading ? (
        <Skeleton className="h-[420px] rounded-2xl" />
      ) : spotlight.data?.[0] ? (
        <Hero anime={spotlight.data[0]} />
      ) : null}

      {continueWatching.length > 0 && (
        <AnimeRow title="Continue Watching" items={continueWatching} />
      )}

      {latestWatch && recommendations.data && (recommendations.data.results || []).length > 0 && (
        <AnimeRow
          title={`Because you watched ${latestWatch.title}`}
          items={recommendations.data.results}
          loading={recommendations.loading}
        />
      )}

      <AnimeRow title="Trending Now" items={trending.data?.results} loading={trending.loading} />
      <AnimeRow title="Popular This Season" items={popular.data?.results} loading={popular.loading} />
      <AnimeRow title="Recently Aired" items={recent.data?.results} loading={recent.loading} />
    </PageContainer>
  );
}
