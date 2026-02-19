'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Check, Clock, AlertCircle, Paperclip, Mic, Loader2, Play, Pause, X } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { ConversationMessageWithAttachments, MessageAttachment } from '@/lib/types';

interface MessageBubbleProps {
  message: ConversationMessageWithAttachments;
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
  return att.storage_path.includes('/pending/');
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

  const trackBg = isOutbound ? 'bg-white/20' : 'bg-surface-200';
  const fillBg = isOutbound ? 'bg-white' : 'bg-brand-500';
  const thumbBg = isOutbound ? 'bg-white' : 'bg-brand-600';
  const btnBg = isOutbound ? 'bg-white/20 hover:bg-white/30' : 'bg-brand-100 hover:bg-brand-200';
  const iconColor = isOutbound ? 'text-white' : 'text-brand-600';
  const timeColor = isOutbound ? 'text-white/60' : 'text-text-muted';

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

      {/* Waveform / progress bar */}
      <div className="flex-1 flex flex-col gap-1">
        <div
          className={cn('relative h-1.5 rounded-full cursor-pointer', trackBg)}
          onClick={handleSeek}
        >
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full transition-all', fillBg)}
            style={{ width: `${progress * 100}%` }}
          />
          {/* Thumb dot */}
          <div
            className={cn('absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full shadow-sm transition-all', thumbBg)}
            style={{ left: `calc(${progress * 100}% - 5px)` }}
          />
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

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Переглянути зображення"
        onClick={() => setLightbox(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLightbox(true); }}
        className="relative cursor-pointer rounded-[4px] mx-auto hover:brightness-90 transition-[filter] duration-400"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: 'cover',
          backgroundPosition: '50%',
          backgroundRepeat: 'no-repeat',
          height: 250,
          width: 250,
          maxWidth: '100%',
          margin: '4px auto 5px',
        }}
      />
      {lightbox && <ImageLightbox src={src} onClose={() => setLightbox(false)} />}
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
