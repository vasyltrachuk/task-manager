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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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

  const canSend = text.trim().length > 0 || !!selectedDocument;
  const isSending = sendMutation.isPending;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
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

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/ogg' });

        if (blob.size === 0) {
          setVoiceError('Порожній запис');
          setIsRecording(false);
          setRecordingSeconds(0);
          return;
        }

        setIsRecording(false);
        setIsSendingVoice(true);

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'voice.ogg');
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
  }, [conversationId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      const mr = mediaRecorderRef.current;
      mr.onstop = () => { mr.stream?.getTracks().forEach((t) => t.stop()); };
      mr.stop();
    }
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
