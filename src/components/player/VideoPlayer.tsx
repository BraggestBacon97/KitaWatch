import { useEffect, useRef } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import type { StreamSource, SubtitleTrack } from '@/types';
import { proxy } from '@/services/api';
import { useIntroSkip } from '@/hooks/useIntroSkip';

interface Props {
  source: StreamSource;
  animeId: string | number;
  episodeNumber: number;
  hasNextEpisode: boolean;
  autoplayNext: boolean;
  subtitles?: SubtitleTrack[];
  poster?: string;
  /** Current source hit a fatal error — parent switches to the next one. */
  onFatal: () => void;
  /** Episode finished playing. */
  onEnded: () => void;
}

export default function VideoPlayer({
  source,
  animeId,
  episodeNumber,
  hasNextEpisode,
  autoplayNext,
  subtitles,
  poster,
  onFatal,
  onEnded,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const callbacks = useRef({ onFatal, onEnded });
  callbacks.current = { onFatal, onEnded };

  const skipTime = useIntroSkip(animeId, episodeNumber);

  useEffect(() => {
    if (!containerRef.current) return;
    let hls: Hls | null = null;
    let failed = false;

    const fail = () => {
      if (failed) return;
      failed = true;
      callbacks.current.onFatal();
    };

    const isHls =
      source.type === 'hls' || source.url.includes('.m3u8');

    const art = new Artplayer({
      container: containerRef.current,
      url: source.url,
      poster,
      type: isHls ? 'm3u8' : 'mp4',
      autoplay: true,
      volume: 0.8,
      theme: '#9333ea',
      screenshot: true,
      setting: true,
      pip: true,
      fullscreen: true,
      playbackRate: true,
      aspectRatio: true,
      hotkey: {
        f: (art: Artplayer) => art.fullscreen.toggle(),
        s: (art: Artplayer) => art.screenshot(),
        Space: (art: Artplayer) => art.toggle(),
        ArrowLeft: (art: Artplayer) => art.seek = art.currentTime - 5,
        ArrowRight: (art: Artplayer) => art.seek = art.currentTime + 5,
      },
      ...(subtitles?.[0]
        ? {
            subtitle: {
              url: subtitles[0].url,
              type: subtitles[0].url.includes('.srt') ? 'srt' : 'vtt',
              encoding: 'utf-8' as const,
              style: { color: '#fff', fontSize: '24px', textShadow: '0 0 5px #000' },
            },
          }
        : {}),
      customType: {
        m3u8: (video, url, art) => {
          const finalUrl =
            source.viaProxy && source.referer
              ? proxy.m3u8(url, source.referer)
              : url;
          if (Hls.isSupported()) {
            hls = new Hls({ maxBufferLength: 30, enableWorker: true });
            hls.loadSource(finalUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_e, data) => {
              if (data?.fatal) fail();
            });
            art.on('destroy', () => hls?.destroy());
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          } else {
            fail();
          }
        },
      },
    });
    artRef.current = art;

    // Fatal error on direct mp4 files too
    art.video.addEventListener('error', fail);
    art.on('video:ended', () => {
      if (autoplayNext && hasNextEpisode) callbacks.current.onEnded();
    });

    return () => {
      art.destroy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.url, source.type]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
      <div ref={containerRef} className="h-full w-full" />
      {skipTime && (
        <button
          className="absolute bottom-16 right-4 z-10 rounded-full bg-black/60 px-4 py-2 text-sm text-white hover:bg-black/80"
          onClick={() => {
            if (artRef.current) artRef.current.currentTime = skipTime.end;
          }}
        >
          Skip Intro
        </button>
      )}
    </div>
  );
}
