import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AnimeSummary } from '@/types';
import AnimeCard from './AnimeCard';

const GAP = 16;
const TITLE_SPACE = 44; // two-line title below the poster

interface Props {
  items: AnimeSummary[];
  /** The scroll container (PageContainer's <main>). */
  scrollElement: RefObject<HTMLElement | null>;
}

function columnCount(width: number): number {
  if (width >= 1400) return 6;
  if (width >= 1100) return 5;
  if (width >= 850) return 4;
  if (width >= 560) return 3;
  return 2;
}

/** Virtualized poster grid — only visible rows are mounted, so load-more
 *  pagination stays smooth into the hundreds. */
export default function AnimeGrid({ items, scrollElement }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cols = columnCount(width);
  const cardW = Math.max(120, (width - GAP * (cols - 1)) / cols);
  const rowH = cardW * 1.5 + TITLE_SPACE;

  const virtualizer = useVirtualizer({
    count: items.length,
    lanes: cols,
    getScrollElement: () => scrollElement.current,
    estimateSize: () => rowH,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowH, cols, virtualizer]);

  return (
    <div
      ref={listRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vi) => {
        const anime = items[vi.index];
        if (!anime) return null;
        return (
          <div
            key={vi.key}
            className="absolute left-0 top-0"
            style={{
              width: cardW,
              transform: `translateX(${(vi.lane ?? 0) * (cardW + GAP)}px) translateY(${vi.start}px)`,
            }}
          >
            <AnimeCard anime={anime} index={vi.index % 18} />
          </div>
        );
      })}
    </div>
  );
}
