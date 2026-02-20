'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Paperclip, X, Mic, Square, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useSendMessage } from '@/lib/hooks/use-conversations';
import { queryKeys } from '@/lib/query-keys';
import type { ClientDocument } from '@/lib/types';

interface MessageComposerProps {
  conversationId: string;
  clientId?: string | null;
  onPickDocument?: () => void;
  selectedDocument?: ClientDocument | null;
  onClearDocument?: () => void;
}

const VOICE_MIME_TYPE_PRIORITY = [
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/webm;codecs=opus',
  'audio/webm',
] as const;
const TELEGRAM_VOICE_MIME_TYPE = 'audio/ogg;codecs=opus';
const OPUS_RECORDER_UMD_PATH = '/opus-media-recorder/OpusMediaRecorder.umd.js';
const OPUS_WORKER_PATH = '/opus-media-recorder/encoderWorker.umd.js';
const OPUS_OGG_WASM_PATH = '/opus-media-recorder/OggOpusEncoder.wasm';

interface OpusWorkerOptions {
  encoderWorkerFactory?: () => Worker;
  OggOpusEncoderWasmPath?: string;
}

type OpusMediaRecorderConstructor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions,
  workerOptions?: OpusWorkerOptions
) => MediaRecorder;

declare global {
  interface Window {
    OpusMediaRecorder?: OpusMediaRecorderConstructor;
    __opusMediaRecorderLoadingPromise?: Promise<OpusMediaRecorderConstructor>;
    __opusMediaRecorderAssertPatched?: boolean;
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function normalizeAudioMimeType(value: string | null | undefined): string {
  return (value ?? '').split(';')[0].trim().toLowerCase();
}

function extensionFromAudioMimeType(value: string | null | undefined): string {
  const mime = normalizeAudioMimeType(value);
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'ogg';
}

function selectNativeRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return VOICE_MIME_TYPE_PRIORITY
    .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}

function ensureSafeConsoleAssertForOpusMediaRecorder(): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'development') return;
  if (window.__opusMediaRecorderAssertPatched) return;

  const originalAssert = console.assert.bind(console);
  console.assert = (condition?: unknown, ...args: unknown[]) => {
    if (condition) return;
    const message = typeof args[0] === 'string'
      ? args[0]
      : '[voice] assertion failed inside opus-media-recorder';
    originalAssert(false, message);
  };
  window.__opusMediaRecorderAssertPatched = true;
}

function loadOpusMediaRecorderFromUmd(): Promise<OpusMediaRecorderConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpusMediaRecorder доступний тільки в браузері'));
  }
  ensureSafeConsoleAssertForOpusMediaRecorder();

  if (window.OpusMediaRecorder) {
    return Promise.resolve(window.OpusMediaRecorder);
  }

  if (window.__opusMediaRecorderLoadingPromise) {
    return window.__opusMediaRecorderLoadingPromise;
  }

  window.__opusMediaRecorderLoadingPromise = new Promise<OpusMediaRecorderConstructor>((resolve, reject) => {
    const finishSuccess = () => {
      if (!window.OpusMediaRecorder) {
        window.__opusMediaRecorderLoadingPromise = undefined;
        reject(new Error('OpusMediaRecorder UMD script loaded but global constructor is missing'));
        return;
      }
      resolve(window.OpusMediaRecorder);
    };

    const fail = () => {
      window.__opusMediaRecorderLoadingPromise = undefined;
      reject(new Error('Failed to load OpusMediaRecorder UMD script'));
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-opus-media-recorder="true"]');
    if (existing) {
      existing.addEventListener('load', finishSuccess, { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = OPUS_RECORDER_UMD_PATH;
    script.async = true;
    script.dataset.opusMediaRecorder = 'true';
    script.onload = finishSuccess;
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return window.__opusMediaRecorderLoadingPromise;
}

async function createVoiceRecorder(stream: MediaStream): Promise<MediaRecorder> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder API недоступний у цьому браузері');
  }

  if (MediaRecorder.isTypeSupported(TELEGRAM_VOICE_MIME_TYPE)) {
    return new MediaRecorder(stream, { mimeType: TELEGRAM_VOICE_MIME_TYPE });
  }

  const fallbackMimeType = selectNativeRecorderMimeType();

  try {
    const OpusMediaRecorder = await loadOpusMediaRecorderFromUmd();
    return new OpusMediaRecorder(
      stream,
      { mimeType: TELEGRAM_VOICE_MIME_TYPE, audioBitsPerSecond: 32000 },
      {
        encoderWorkerFactory: () => new Worker(OPUS_WORKER_PATH),
        OggOpusEncoderWasmPath: OPUS_OGG_WASM_PATH,
      }
    );
  } catch (error) {
    console.warn(
      `[voice] opus-media-recorder unavailable, falling back to native MediaRecorder: ${toSafeErrorMessage(error)}`
    );
    return new MediaRecorder(stream, fallbackMimeType ? { mimeType: fallbackMimeType } : undefined);
  }
}

export default function MessageComposer({
  conversationId,
  onPickDocument,
  selectedDocument,
  onClearDocument,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMutation = useSendMessage();
  const qc = useQueryClient();

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const stopTimeRef = useRef<number | null>(null);

  const canSend = text.trim().length > 0 || !!selectedDocument;
  const isSending = sendMutation.isPending;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        stopTimeRef.current = Date.now();
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleSend = useCallback(() => {
    if (!canSend || isSending) return;

    sendMutation.mutate(
      {
        conversationId,
        body: text.trim() || undefined,
        documentId: selectedDocument?.id,
      },
      {
        onSuccess: () => {
          setText('');
          onClearDocument?.();
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        },
      }
    );
  }, [canSend, isSending, sendMutation, conversationId, text, selectedDocument, onClearDocument]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const startRecording = useCallback(async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = await createVoiceRecorder(stream);
      chunksRef.current = [];
      stopTimeRef.current = null;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const stopTime = stopTimeRef.current ?? Date.now();
        const elapsedMs = Math.max(0, stopTime - startTimeRef.current);
        const duration = Math.max(1, Math.round(elapsedMs / 1000));
        const recordedMimeType = normalizeAudioMimeType(recorder.mimeType || TELEGRAM_VOICE_MIME_TYPE);
        const blob = new Blob(chunksRef.current, { type: recordedMimeType });

        if (blob.size === 0) {
          setVoiceError('Порожній запис');
          setIsRecording(false);
          setRecordingSeconds(0);
          mediaRecorderRef.current = null;
          startTimeRef.current = 0;
          stopTimeRef.current = null;
          return;
        }

        setIsRecording(false);
        setIsSendingVoice(true);

        try {
          const formData = new FormData();
          const extension = extensionFromAudioMimeType(blob.type || recordedMimeType);
          formData.append('audio', blob, `voice.${extension}`);
          formData.append('duration', String(duration));

          const response = await fetch(`/api/conversations/${conversationId}/voice`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error((payload as { error?: string }).error || 'Не вдалося надіслати голосове');
          }
          // Refresh messages list immediately
          await qc.invalidateQueries({ queryKey: queryKeys.conversations.messages(conversationId) });
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : 'Помилка надсилання');
        } finally {
          setIsSendingVoice(false);
          setRecordingSeconds(0);
          mediaRecorderRef.current = null;
          startTimeRef.current = 0;
          stopTimeRef.current = null;
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setVoiceError('Немає доступу до мікрофону');
    }
  }, [conversationId, qc]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      stopTimeRef.current = Date.now();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    stopTimeRef.current = Date.now();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      const mr = mediaRecorderRef.current;
      mr.onstop = () => { mr.stream?.getTracks().forEach((t) => t.stop()); };
      mr.stop();
    }
    mediaRecorderRef.current = null;
    startTimeRef.current = 0;
    stopTimeRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
    setVoiceError(null);
  }, []);

  return (
    <div className="border-t border-surface-200 bg-white p-3">
      {selectedDocument && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-surface-50 border border-surface-200">
          <Paperclip size={14} className="text-text-muted flex-shrink-0" />
          <span className="text-xs text-text-secondary truncate flex-1">
            {selectedDocument.file_name}
          </span>
          <button
            onClick={onClearDocument}
            className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {onPickDocument && !isRecording && !isSendingVoice && (
          <button
            onClick={onPickDocument}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
            title="Прикріпити документ"
          >
            <Paperclip size={18} />
          </button>
        )}

        {isRecording ? (
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm text-red-600 font-medium tabular-nums">
              {formatDuration(recordingSeconds)}
            </span>
            <span className="text-xs text-red-400 flex-1">Запис...</span>
            <button
              onClick={cancelRecording}
              className="text-red-400 hover:text-red-600 transition-colors"
              title="Скасувати"
            >
              <X size={16} />
            </button>
          </div>
        ) : isSendingVoice ? (
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
            <Loader2 size={14} className="text-brand-600 animate-spin flex-shrink-0" />
            <span className="text-sm text-text-muted">Надсилання...</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Написати повідомлення..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-surface-200 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            style={{ maxHeight: '120px' }}
          />
        )}

        {isRecording ? (
          <button
            onClick={stopRecording}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors flex-shrink-0"
            title="Зупинити та надіслати"
          >
            <Square size={14} />
          </button>
        ) : canSend ? (
          <button
            onClick={handleSend}
            disabled={isSending || isSendingVoice}
            className={cn(
              'w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0',
              !isSending && !isSendingVoice
                ? 'bg-brand-600 hover:bg-brand-700 text-white'
                : 'bg-surface-100 text-text-muted cursor-not-allowed'
            )}
            title="Надіслати"
          >
            <Send size={16} />
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={isSendingVoice}
            className={cn(
              'w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0',
              !isSendingVoice
                ? 'hover:bg-surface-100 text-text-muted hover:text-text-primary'
                : 'text-text-muted cursor-not-allowed opacity-50'
            )}
            title="Записати голосове"
          >
            <Mic size={18} />
          </button>
        )}
      </div>

      {(sendMutation.isError || voiceError) && (
        <p className="text-xs text-red-600 mt-1.5 px-1">
          {voiceError || sendMutation.error?.message || 'Помилка надсилання'}
        </p>
      )}
    </div>
  );
}
