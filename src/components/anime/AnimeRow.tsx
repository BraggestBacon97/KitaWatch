import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AnimeSummary } from '@/types';
import AnimeCard from './AnimeCard';
import Skeleton from '@/components/ui/Skeleton';

interface Props {
  title: string;
  items?: AnimeSummary[];
  loading?: boolean;
}

export default function AnimeRow({ title, items, loading }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) =>
    scroller.current?.scrollBy({
      left: dir * scroller.current.clientWidth * 0.8,
      behavior: 'smooth',
    });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-ink-800 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-ink-800 hover:text-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div ref={scroller} className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-[150px] shrink-0 sm:w-[170px]" />
          ))}
        {!loading && items?.map((a, i) => (
          <div key={a.id} className="w-[150px] shrink-0 sm:w-[170px]">
            <AnimeCard anime={a} index={i} />
          </div>
        ))}
        {!loading && items && items.length === 0 && (
          <p className="py-8 text-sm text-zinc-500">Nothing here yet.</p>
        )}
      </div>
    </section>
  );
}
