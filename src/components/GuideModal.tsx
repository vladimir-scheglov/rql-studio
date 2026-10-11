import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import guideText from '../docs/USER_GUIDE.md?raw';
import { IconX, IconSearch } from './icons';

interface Props {
    onClose: () => void;
}

export function GuideModal({ onClose }: Props) {
    const [query, setQuery] = useState('');

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Рендерим markdown → HTML
    const html = useMemo(() => {
        const renderer = new marked.Renderer();

        // Добавляем id к заголовкам для навигации
        renderer.heading = ({ text, depth }) => {
            const id = text
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s-]/gu, '')
                .trim()
                .replace(/\s+/g, '-');
            return `<h${depth} id="${id}">${text}</h${depth}>`;
        };

        const raw = marked.parse(guideText, {
            renderer,
            gfm: true,
            breaks: false,
            async: false,
        }) as string;

        return DOMPurify.sanitize(raw, {
            ADD_ATTR: ['id', 'target'],
            ALLOWED_TAGS: [
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'p', 'br', 'strong', 'em', 'del', 'code', 'pre',
                'ul', 'ol', 'li', 'blockquote', 'hr',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'a', 'span', 'div',
            ],
        });
    }, []);

    // Фильтрация по запросу — скроллим к первому совпадению
    const handleSearch = (value: string) => {
        setQuery(value);
        if (!value.trim()) return;

        const lower = value.toLowerCase();
        const headings = document.querySelectorAll<HTMLElement>('.guide-content h2, .guide-content h3');
        for (const h of headings) {
            if (h.textContent?.toLowerCase().includes(lower)) {
                h.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
            }
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-lg shadow-2xl w-[1000px] max-w-[95vw] h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-3 shrink-0">
                    <div className="flex-1">
                        <h2 className="font-medium text-gray-900">Руководство пользователя</h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Возможности, горячие клавиши, частые задачи
                        </div>
                    </div>

                    {/* Поиск */}
                    <div className="relative w-64">
                        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => handleSearch(e.target.value)}
                            placeholder="Найти раздел..."
                            className="w-full text-xs pl-8 pr-3 py-1.5 border border-gray-300 rounded focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        />
                    </div>

                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                        title="Закрыть"
                    >
                        <IconX />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    <div
                        className="guide-content max-w-3xl mx-auto px-8 py-6 prose prose-sm"
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                </div>
            </div>
        </div>,
        document.body,
    );
}