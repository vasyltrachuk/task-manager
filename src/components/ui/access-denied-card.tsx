import type { ReactNode } from 'react';

interface AccessDeniedCardProps {
    message: string;
    action?: ReactNode;
    title?: string;
}

export default function AccessDeniedCard({
    message,
    action,
    title = 'Немає доступу',
}: AccessDeniedCardProps) {
    return (
        <div className="p-8">
            <div className="card p-6 max-w-xl">
                <h1 className="text-xl font-bold text-text-primary mb-2">{title}</h1>
                <p className="text-sm text-text-muted">{message}</p>
                {action ? <div className="mt-4">{action}</div> : null}
            </div>
        </div>
    );
}
