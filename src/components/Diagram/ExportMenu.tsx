import { useEffect, useRef, useState } from 'react';
import { IconDownload } from '../icons';

interface Props {
    onExport: (format: 'png' | 'svg') => void;
}

export function ExportMenu({ onExport }: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                title="Экспорт диаграммы"
            >
                <IconDownload className="w-3 h-3" />
                <span>Экспорт</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
                    stroke="currentColor" strokeWidth="1.4">
                    <path d="M2 3 L4 5 L6 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] bg-white border border-gray-200 rounded shadow-lg py-1">
                    <button
                        onClick={() => {
                            onExport('png');
                            setOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                        Скачать PNG
                    </button>
                    <button
                        onClick={() => {
                            onExport('svg');
                            setOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                        Скачать SVG
                    </button>
                </div>
            )}
        </div>
    );
}