'use client';

import { KanbanSquare, List } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewMode = 'board' | 'list';

type ViewModeToggleProps = {
    value: ViewMode;
    onChange: (mode: ViewMode) => void;
    className?: string;
};

export default function ViewModeToggle({ value, onChange, className }: ViewModeToggleProps) {
    return (
        <div
            className={cn(
                'flex items-center bg-white border border-surface-200 rounded-lg overflow-hidden',
                className
            )}
        >
            <button
                onClick={() => onChange('board')}
                aria-pressed={value === 'board'}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                    value === 'board' ? 'bg-brand-600 text-white' : 'text-text-secondary hover:bg-surface-50'
                )}
            >
                <KanbanSquare size={14} />
                Дошка
            </button>
            <button
                onClick={() => onChange('list')}
                aria-pressed={value === 'list'}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                    value === 'list' ? 'bg-brand-600 text-white' : 'text-text-secondary hover:bg-surface-50'
                )}
            >
                <List size={14} />
                Список
            </button>
        </div>
    );
}
