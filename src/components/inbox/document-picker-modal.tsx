'use client';

import { useMemo, useState } from 'react';
import { X, FileText, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useClientDocuments } from '@/lib/hooks/use-documents';
import type { ClientDocument } from '@/lib/types';

interface DocumentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  onSelect: (document: ClientDocument) => void;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentPickerModal({
  isOpen,
  onClose,
  clientId,
  onSelect,
}: DocumentPickerModalProps) {
  const { data: documents, isLoading } = useClientDocuments(clientId);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!documents) return [];
    if (!search.trim()) return documents;

    const q = search.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.file_name.toLowerCase().includes(q) ||
        doc.doc_type?.toLowerCase().includes(q) ||
        doc.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [documents, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h3 className="text-sm font-bold text-text-primary">Вибрати документ</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-surface-200">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук документів..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-surface-200 focus:outline-none focus:border-brand-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <p className="text-sm text-text-muted text-center py-6">Завантаження...</p>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-6">
              {search.trim() ? 'Нічого не знайдено' : 'Документів немає'}
            </p>
          )}

          <div className="space-y-1.5">
            {filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => {
                  onSelect(doc);
                  onClose();
                }}
                className="w-full text-left p-3 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <FileText size={16} className="text-text-muted flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {doc.doc_type && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-100 text-text-muted">
                          {doc.doc_type}
                        </span>
                      )}
                      <span className="text-[11px] text-text-muted">
                        {formatFileSize(doc.size_bytes)}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {formatDate(doc.created_at)}
                      </span>
                    </div>
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
