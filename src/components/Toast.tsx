import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

let showToastFn: ((text: string) => void) | null = null;

/** Глобальный API для показа тостов */
export function showToast(text: string) {
    showToastFn?.(text);
}

/** Хост — рендерится один раз в App.tsx */
export function ToastHost() {
    const [text, setText] = useState<string | null>(null);

    useEffect(() => {
        showToastFn = (t) => {
            setText(t);
            const timer = window.setTimeout(() => setText(null), 1500);
            return () => window.clearTimeout(timer);
        };
        return () => {
            showToastFn = null;
        };
    }, []);

    if (!text) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                left: '50%',
                bottom: '32px',
                transform: 'translateX(-50%)',
                zIndex: 2000,
            }}
            className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs shadow-lg animate-fade-in"
        >
            {text}
        </div>,
        document.body,
    );
}