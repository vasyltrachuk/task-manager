'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Check, Clock, AlertCircle, Paperclip, Mic, Loader2, Play, Pause, X } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { ConversationMessageWithAttachments, MessageAttachment } from '@/lib/types';

interface MessageBubbleProps {
  message: ConversationMessageWithAttachments;
}

const WAVEFORM_BARS = 48;
const WAVEFORM_VIEWBOX_WIDTH = 190;
const WAVEFORM_VIEWBOX_HEIGHT = 23;
const WAVEFORM_BAR_WIDTH = 2;
const WAVEFORM_BAR_GAP = 2;
const FALLBACK_WAVEFORM = Array.from({ length: WAVEFORM_BARS }, (_, i) =>
  // Gentle arch fallback when decoding is unavailable.
  0.25 + Math.sin((i / (WAVEFORM_BARS - 1)) * Math.PI) * 0.45
);
const waveformCache = new Map<string, number[]>();
const waveformInFlight = new Map<string, Promise<number[]>>();

function getAudioContextCtor():
  | (new () => AudioContext)
  | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext;
}

async function decodeWaveform(src: string): Promise<number[]> {
  const response = await fetch(src, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Waveform fetch failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) {
    return FALLBACK_WAVEFORM;
  }

  const ctx = new AudioContextCtor();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channels = decoded.numberOfChannels;
    if (channels <= 0 || decoded.length <= 0) {
      return FALLBACK_WAVEFORM;
    }

    const bars = Array.from({ length: WAVEFORM_BARS }, () => 0);
    const chunkSize = Math.max(1, Math.floor(decoded.length / WAVEFORM_BARS));

    for (let bar = 0; bar < WAVEFORM_BARS; bar += 1) {
      const start = bar * chunkSize;
      const end = Math.min(decoded.length, start + chunkSize);
      let peak = 0;

      for (let ch = 0; ch < channels; ch += 1) {
        const data = decoded.getChannelData(ch);
        for (let i = start; i < end; i += 1) {
          const sample = Math.abs(data[i] ?? 0);
          if (sample > peak) peak = sample;
        }
      }

      bars[bar] = peak;
    }

    const maxPeak = Math.max(...bars, 0);
    if (maxPeak <= 0) {
      return FALLBACK_WAVEFORM;
    }

    return bars.map((value) => Math.max(0.12, value / maxPeak));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function getWaveform(src: string): Promise<number[]> {
  const cached = waveformCache.get(src);
  if (cached) return cached;

  let inFlight = waveformInFlight.get(src);
  if (!inFlight) {
    inFlight = decodeWaveform(src).catch(() => FALLBACK_WAVEFORM);
    waveformInFlight.set(src, inFlight);
  }

  const bars = await inFlight;
  waveformInFlight.delete(src);
  waveformCache.set(src, bars);
  return bars;
}

function DeliveryIcon({ status }: { status: string }) {
  switch (status) {
    case 'sent':
    case 'received':
      return <Check size={12} />;
    case 'queued':
      return <Clock size={12} />;
    case 'failed':
      return <AlertCircle size={12} className="text-red-300" />;
    default:
      return null;
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isImageLike(att: MessageAttachment): boolean {
  if (att.mime) return att.mime.startsWith('image/');
  return /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(att.file_name);
}

function isVoiceLike(att: MessageAttachment): boolean {
  if (att.mime) return att.mime.startsWith('audio/');
  return att.file_name.startsWith('voice_') || att.file_name.startsWith('audio_');
}

function isPending(att: MessageAttachment): boolean {
  if (!att.storage_path.includes('/pending/')) return false;
  // Telegram attachments can be streamed by telegram_file_id even before background
  // job rewrites storage_path from /pending/ to /tg/.
  return !att.telegram_file_id;
}

// ── Custom audio player ────────────────────────────────────────────────────

function VoicePlayer({
  src,
  durationSeconds,
  isOutbound,
}: {
  src: string;
  durationSeconds: number | null | undefined;
  isOutbound: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(durationSeconds ?? 0);
  const [loading, setLoading] = useState(false);
  const [waveform, setWaveform] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    getWaveform(src)
      .then((bars) => {
        if (!cancelled) setWaveform(bars);
      })
      .catch(() => {
        if (!cancelled) setWaveform(FALLBACK_WAVEFORM);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  // Lazily create audio element
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio(src);
      a.preload = 'none';
      a.onloadedmetadata = () => {
        if (isFinite(a.duration)) setTotalSec(Math.round(a.duration));
      };
      a.ontimeupdate = () => {
        const dur = isFinite(a.duration) ? a.duration : (durationSeconds ?? 0);
        setCurrentSec(Math.floor(a.currentTime));
        setProgress(dur > 0 ? a.currentTime / dur : 0);
      };
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
        setCurrentSec(0);
      };
      a.onwaiting = () => setLoading(true);
      a.onplaying = () => setLoading(false);
      a.onerror = () => { setPlaying(false); setLoading(false); };
      audioRef.current = a;
    }
    return audioRef.current;
  }, [src, durationSeconds]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlay = useCallback(async () => {
    const a = getAudio();
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      setLoading(true);
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setLoading(false);
      }
    }
  }, [playing, getAudio]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = getAudio();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = isFinite(a.duration) ? a.duration : (durationSeconds ?? 0);
    if (dur > 0) {
      a.currentTime = ratio * dur;
      setProgress(ratio);
      setCurrentSec(Math.floor(ratio * dur));
    }
  }, [getAudio, durationSeconds]);

  const displayTotal = totalSec || durationSeconds || 0;
  const displayCurrent = playing || progress > 0 ? currentSec : null;

  const btnBg = isOutbound ? 'bg-white/20 hover:bg-white/30' : 'bg-brand-100 hover:bg-brand-200';
  const iconColor = isOutbound ? 'text-white' : 'text-brand-600';
  const timeColor = isOutbound ? 'text-white/60' : 'text-text-muted';
  const bars = waveform ?? FALLBACK_WAVEFORM;
  const progressPct = Math.max(0, Math.min(100, progress * 100));
  const waveBackgroundColor = isOutbound ? 'text-white/35' : 'text-surface-300';
  const waveProgressColor = isOutbound ? 'text-white' : 'text-brand-500';
  const waveformRects = useMemo(() =>
    bars.map((peak, index) => {
      const x = index * (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP);
      const barHeight = Math.round(4 + peak * 19);
      const y = WAVEFORM_VIEWBOX_HEIGHT - barHeight;
      return (
        <rect
          key={`wave-${index}`}
          className="audio-waveform-bar"
          x={x}
          y={y}
          width={WAVEFORM_BAR_WIDTH}
          height={barHeight}
          rx={1}
          ry={1}
          fill="currentColor"
        />
      );
    }),
    [bars]
  );

  return (
    <div className="flex items-center gap-2.5 w-full min-w-[200px] max-w-[260px]">
      {/* Play / Pause button */}
      <button
        onClick={togglePlay}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
          btnBg
        )}
      >
        {loading
          ? <Loader2 size={14} className={cn('animate-spin', iconColor)} />
          : playing
            ? <Pause size={14} className={iconColor} />
            : <Play size={14} className={cn(iconColor, 'translate-x-px')} />
        }
      </button>

      {/* Waveform */}
      <div className="flex-1 flex flex-col gap-1">
        <div
          className={cn(
            'audio-waveform-container w-[190px] max-w-full rounded-md cursor-pointer',
            isOutbound ? 'bg-white/12' : 'bg-surface-100'
          )}
          onClick={handleSeek}
        >
          <div className={cn('audio-waveform audio-waveform-background', waveBackgroundColor)}>
            <svg
              className="audio-waveform-bars"
              width={WAVEFORM_VIEWBOX_WIDTH}
              height={WAVEFORM_VIEWBOX_HEIGHT}
              viewBox={`0 0 ${WAVEFORM_VIEWBOX_WIDTH} ${WAVEFORM_VIEWBOX_HEIGHT}`}
              aria-hidden="true"
            >
              {waveformRects}
            </svg>
          </div>

          <div
            className={cn('audio-waveform audio-waveform-fake', waveProgressColor)}
            style={{ width: `${progressPct}%` }}
          >
            <svg
              className="audio-waveform-bars"
              width={WAVEFORM_VIEWBOX_WIDTH}
              height={WAVEFORM_VIEWBOX_HEIGHT}
              viewBox={`0 0 ${WAVEFORM_VIEWBOX_WIDTH} ${WAVEFORM_VIEWBOX_HEIGHT}`}
              aria-hidden="true"
            >
              {waveformRects}
            </svg>
          </div>
        </div>
        <span className={cn('text-[10px] tabular-nums leading-none', timeColor)}>
          {displayCurrent != null ? formatDuration(displayCurrent) : formatDuration(displayTotal)}
        </span>
      </div>
    </div>
  );
}

// ── Image lightbox ─────────────────────────────────────────────────────────

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
        onClick={onClose}
      >
        <X size={24} />
      </button>
      <div
        className="max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="max-w-full max-h-[90vh] rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}

// ── Image attachment ────────────────────────────────────────────────────────

function ImageAttachment({ src }: { src: string }) {
  const [lightbox, setLightbox] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const canOpen = loaded && !failed;
  const openLightbox = () => {
    if (!canOpen) return;
    setLightbox(true);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={!canOpen}
        aria-label="Переглянути зображення"
        onClick={openLightbox}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openLightbox();
        }}
        className={cn(
          'relative mx-auto h-[250px] w-[250px] max-w-full overflow-hidden rounded-[4px] transition-[filter] duration-300',
          canOpen ? 'cursor-pointer hover:brightness-90' : 'cursor-default'
        )}
      >
        {!loaded && !failed && (
          <div className="pointer-events-none absolute inset-0 rounded-[4px] bg-gradient-to-br from-surface-100 via-surface-50 to-surface-100 animate-pulse" />
        )}

        {!loaded && !failed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-text-muted" />
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded && !failed ? 'opacity-100' : 'opacity-0'
          )}
        />

        {failed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-100 text-[11px] text-text-muted">
            Не вдалося завантажити
          </div>
        )}
      </div>

      {lightbox && canOpen && <ImageLightbox src={src} onClose={() => setLightbox(false)} />}
    </>
  );
}

// ── Attachment row ─────────────────────────────────────────────────────────

function AttachmentRow({
  att,
  isOutbound,
}: {
  att: MessageAttachment;
  isOutbound: boolean;
}) {
  const image = isImageLike(att);
  const voice = isVoiceLike(att);
  const pending = isPending(att);
  const src = `/api/documents/download?path=${encodeURIComponent(att.storage_path)}&attachmentId=${encodeURIComponent(att.id)}`;

  if (image && !pending) {
    return <ImageAttachment src={src} />;
  }

  if (voice) {
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-xl px-2.5 py-2 w-full',
        isOutbound ? 'bg-white/10' : 'bg-surface-50 border border-surface-100'
      )}>
        {/* Mic avatar */}
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isOutbound ? 'bg-white/20' : 'bg-brand-100'
        )}>
          {pending
            ? <Loader2 size={14} className={cn('animate-spin', isOutbound ? 'text-white/60' : 'text-text-muted')} />
            : <Mic size={14} className={isOutbound ? 'text-white' : 'text-brand-600'} />
          }
        </div>

        {pending ? (
          <span className={cn('text-[11px]', isOutbound ? 'text-white/50' : 'text-text-muted')}>
            Обробляється...
          </span>
        ) : (
          <VoicePlayer
            src={src}
            durationSeconds={att.duration_seconds}
            isOutbound={isOutbound}
          />
        )}
      </div>
    );
  }

  return (
    <a
      href={pending ? undefined : src}
      download={pending ? undefined : att.file_name}
      className={cn(
        'flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 w-full transition-colors',
        isOutbound
          ? 'bg-white/15 hover:bg-white/25 text-white'
          : 'bg-surface-50 hover:bg-surface-100 text-text-secondary',
        pending && 'opacity-60 cursor-default'
      )}
    >
      {pending
        ? <Loader2 size={12} className="flex-shrink-0 animate-spin" />
        : <Paperclip size={12} className="flex-shrink-0" />
      }
      <span className="truncate">{att.file_name}</span>
    </a>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isSystem = message.source === 'system';
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const hasBody = !!message.body;

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-surface-100 text-text-muted text-xs px-3 py-1.5 rounded-full max-w-xs text-center">
          {message.body}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex mb-2', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-xl px-3.5 py-2',
          isOutbound
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-white border border-surface-200 text-text-primary rounded-bl-sm'
        )}
      >
        {message.sender && !isOutbound && (
          <p className="text-[11px] font-semibold text-brand-600 mb-0.5">
            {message.sender.full_name}
          </p>
        )}

        {hasBody && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {hasAttachments && (
          <div className={cn('space-y-1', hasBody && 'mt-1.5')}>
            {message.attachments!.map((att) => (
              <AttachmentRow
                key={att.id}
                att={att}
                isOutbound={isOutbound}
              />
            ))}
          </div>
        )}

        <div className={cn(
          'flex items-center gap-1 mt-1',
          isOutbound ? 'justify-end' : 'justify-start'
        )}>
          <span className={cn(
            'text-[10px]',
            isOutbound ? 'text-white/60' : 'text-text-muted'
          )}>
            {formatTime(message.created_at)}
          </span>
          {isOutbound && (
            <span className="text-white/60">
              <DeliveryIcon status={message.status} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
