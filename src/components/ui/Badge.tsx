import type { ReactNode } from 'react';

type Variant = 'sub' | 'dub' | 'rating' | 'neutral' | 'accent';

const styles: Record<Variant, string> = {
  sub: 'bg-sky-500/90 text-white',
  dub: 'bg-emerald-500/90 text-white',
  rating: 'bg-black/70 text-amber-300',
  neutral: 'bg-ink-700 text-zinc-300',
  accent: 'bg-accent-600 text-white',
};

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export default function Badge({ variant = 'neutral', children, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
