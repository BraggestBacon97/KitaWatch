import { Link, useParams } from 'react-router-dom';
import { Play, Plus, Check, Star } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { api } from '@/services/api';
import { anilist } from '@/services/anilist';
import { useApi } from '@/hooks/useApi';
import { useAnimeStore } from '@/stores/animeStore';
import { useAuthStore } from '@/stores/authStore';
import type { AnimeSummary, EpisodeSummary } from '@/types';

/** Metadata comes from AniList (reliable, legal); if it's unreachable we
 *  fall back to the Kuhi API's info endpoint. Episodes always come from
 *  Kuhi — that's where the provider streams live. */
// Race local Kuhi against AniList in parallel — first success wins
// (serial fallback made the page sit silent for up to ~50s on failures).
const fetchInfo = (id: string) =>
  Promise.any([api.info(id), anilist.info(id)]).catch(() => api.info(id));

/** When every provider's episode list fails, fall back to AniList's episode
 *  count so playback can still be attempted by number (extract works by
 *  anilist ID + episode number alone). Thumbnails fall back to the cover. */
function fallbackEpisodes(
  total: number | undefined,
  cover: string | undefined,
): EpisodeSummary[] {
  if (!total || total <= 0 || total > 500) return [];
  return Array.from({ length: total }, (_, i) => ({
    number: i + 1,
    thumbnail: cover,
  }));
}

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const info = useApi(() => fetchInfo(id!), [id]);
  const episodes = useApi(() => api.episodes(id!), [id]);
  const { favorites, toggleFavorite } = useAnimeStore();

  const handleToggleFavorite = (anime: AnimeSummary) => {
    toggleFavorite(anime);
    const token = useAuthStore.getState().accessToken;
    if (token) {
      anilist
        .toggleFavorite(token, anime.id)
        .catch((e) => console.error('[kitawatch] AniList sync failed:', e));
    }
  };

  if (info.error && !info.data) {
    return (
      <PageContainer>
        <ErrorState
          title="Couldn't load this anime"
          message={info.error}
          onRetry={info.reload}
        />
      </PageContainer>
    );
  }

  const a = info.data;
  const favorite = a ? favorites.some((f) => f.id === a.id) : false;
  const shownEpisodes: EpisodeSummary[] =
    episodes.data && episodes.data.length > 0
      ? episodes.data
      : episodes.loading || episodes.error
        ? []
        : fallbackEpisodes(a?.totalEpisodes, a?.cover);

  return (
    <PageContainer className="!space-y-0 !p-0">
      {/* Banner */}
      <div className="relative h-72 overflow-hidden">
        {info.loading ? (
          <Skeleton className="h-full rounded-none" />
        ) : (
          <>
            {a?.banner || a?.cover ? (
              <img
                src={a?.banner ?? a?.cover}
                alt=""
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="h-full bg-ink-800" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" />
          </>
        )}
      </div>

      <div className="space-y-8 px-6 pb-6">
        {/* Header */}
        <div className="-mt-20 flex flex-col gap-6 sm:flex-row">
          {info.loading ? (
            <Skeleton className="aspect-[2/3] w-40 rounded-xl" />
          ) : (
            <img
              src={a?.cover ?? a?.banner}
              alt={a?.title}
              className="aspect-[2/3] w-40 rounded-xl object-cover shadow-2xl ring-1 ring-white/10"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-end pt-20 sm:pt-0">
            {info.loading ? (
              <Skeleton className="h-9 w-72" />
            ) : (
              <h1 className="text-3xl font-bold text-white">{a?.title}</h1>
            )}
            {!info.loading && a && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {a.rating != null && typeof a.rating === 'number' && (
                    <Badge variant="rating">
                      <Star className="h-3 w-3 fill-current" />
                      {a.rating.toFixed(1)}
                    </Badge>
                  )}
                  {a.status && <Badge variant="neutral">{a.status}</Badge>}
                  {a.type && <Badge variant="neutral">{a.type}</Badge>}
                  {a.year && <Badge variant="neutral">{a.year}</Badge>}
                  {(a.subCount ?? 0) > 0 && <Badge variant="sub">Sub</Badge>}
                  {(a.dubCount ?? 0) > 0 && <Badge variant="dub">Dub</Badge>}
                </div>
                {a.genres && a.genres.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.genres.map((g) => (
                      <span
                        key={g}
                        className="rounded-full bg-ink-800 px-3 py-1 text-xs text-zinc-400 ring-1 ring-white/10"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex gap-3">
                  <Link to={`/watch/${a.id}/1`}>
                    <Button>
                      <Play className="h-4 w-4 fill-current" /> Play
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => handleToggleFavorite(a)}
                  >
                    {favorite ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" /> In My List
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" /> Add to List
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Synopsis */}
        {!info.loading && a?.synopsis && (
          <section>
            <h2 className="mb-2 text-lg font-semibold text-white">Synopsis</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
              {a.synopsis}
            </p>
          </section>
        )}

        {/* Episodes */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Episodes
            {shownEpisodes.length > 0 && (
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({shownEpisodes.length})
              </span>
            )}
          </h2>
          {episodes.loading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          )}
          {episodes.error && !episodes.data && (
            <ErrorState
              title="Couldn't load episodes"
              message={episodes.error}
              onRetry={episodes.reload}
            />
          )}
          {!episodes.loading && !episodes.error && shownEpisodes.length === 0 && (
            <p className="py-8 text-sm text-zinc-500">
              No episodes found — providers may not carry this title yet.
            </p>
          )}
          {!episodes.loading && shownEpisodes.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {shownEpisodes.map((ep) => (
                <Link
                  key={ep.number}
                  to={`/watch/${id}/${ep.number}`}
                  className="group overflow-hidden rounded-xl bg-ink-850 ring-1 ring-white/5 transition hover:ring-accent-500/60"
                >
                  <div className="aspect-video overflow-hidden bg-ink-800">
                    {ep.thumbnail && (
                      <img
                        src={ep.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-zinc-200">
                      Episode {ep.number}
                    </p>
                    {ep.title && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
                        {ep.title}
                      </p>
                    )}
                    <div className="mt-1 flex gap-1">
                      {ep.hasSub && <Badge variant="sub">Sub</Badge>}
                      {ep.hasDub && <Badge variant="dub">Dub</Badge>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
