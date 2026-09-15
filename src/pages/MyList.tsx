import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';
import AnimeCard from '@/components/anime/AnimeCard';
import Button from '@/components/ui/Button';
import { useAnimeStore } from '@/stores/animeStore';

export default function MyList() {
  const favorites = useAnimeStore((s) => s.favorites);

  return (
    <PageContainer>
      <h1 className="text-2xl font-bold text-white">My List</h1>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-ink-900 py-20 ring-1 ring-white/5">
          <Bookmark className="h-12 w-12 text-zinc-700" />
          <div className="text-center">
            <p className="font-semibold text-zinc-300">Your list is empty</p>
            <p className="mt-1 text-sm text-zinc-500">
              Save anime with &ldquo;Add to List&rdquo; to find them here.
            </p>
          </div>
          <Link to="/browse">
            <Button variant="outline">Browse anime</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {favorites.map((a, i) => (
            <AnimeCard key={a.id} anime={a} index={i} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
