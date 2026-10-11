import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { useSchemaStore } from '../../store/useSchemaStore';
import {
    buildDomainReportMarkdown,
    wrapMarkdownAsHtml,
    type ReportOptions,
} from '../../report/domain-report';
import { showToast } from '../Toast';
import { IconCheck, IconDownload, IconX } from '../icons';

interface Props {
    onClose: () => void;
}

export function DomainReportModal({ onClose }: Props) {
    const domains = useSchemaStore(s => s.domains);
    const table = useSchemaStore(s => s.symbolTable);
    const activeDomainId = useSchemaStore(s => s.activeDomainId);
    const [viewMode, setViewMode] = useState<'source' | 'preview'>('source');
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const [domainId, setDomainId] = useState<string>(
        activeDomainId ?? domains[0]?.id ?? '',
    );
    const [format, setFormat] = useState<'markdown' | 'html'>('markdown');
    const [options, setOptions] = useState<ReportOptions>({
        includeOverview: true,
        includeEntities: true,
        includeLinkages: true,
        includeRules: true,
        includeDiagram: true,
    });

    // Закрытие по Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const domain = domains.find(d => d.id === domainId);

    const markdown = useMemo(() => {
        if (!domain || !table) return '';
        try {
            return buildDomainReportMarkdown(domain, table, {
                ...options,
                allDomains: domains,   // ← добавь это
            });
        } catch (e) {
            console.error('[report] error:', e);
            return '# Ошибка генерации отчёта\n\n' + String(e);
        }
    }, [domain, table, options, domains]);

    const html = useMemo(
        () => wrapMarkdownAsHtml(markdown, `Отчёт: ${domain?.name ?? domainId}`),
        [markdown, domain, domainId],
    );

    const previewText = format === 'markdown' ? markdown : html;

    const download = () => {
        if (!domain) return;

        const content = format === 'markdown' ? markdown : html;
        const ext = format === 'markdown' ? 'md' : 'html';
        const mime = format === 'markdown' ? 'text/markdown' : 'text/html';

        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${domain.id}-report.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Отчёт сохранён в ${ext.toUpperCase()}`);
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(previewText);
            showToast('Скопировано');
        } catch {
            // ignore
        }
    };

    const openHtml = () => {
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(html);
        win.document.close();
    };

    if (!domain || !table) {
        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md">
                    <div className="text-sm text-gray-700 mb-4">
                        Схема не загружена. Загрузите домен, чтобы создать отчёт.
                    </div>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
                    >
                        Понятно
                    </button>
                </div>
            </div>,
            document.body,
        );
    }

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex flex-col bg-white"
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 shrink-0">
                <div>
                    <h2 className="font-medium text-gray-900">
                        Отчёт по домену
                    </h2>
                    <div className="text-xs text-gray-500 mt-0.5">
                        Сгенерированный документ с описанием сущностей, связей и правил
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                    <IconX />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex min-h-0">
                {/* Настройки */}
                <div className="w-72 border-r border-gray-200 overflow-auto p-4 space-y-4 shrink-0">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Домен
                        </label>
                        <select
                            value={domainId}
                            onChange={e => setDomainId(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        >
                            {domains.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name} ({d.id})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Формат
                        </label>
                        <div className="inline-flex rounded border border-gray-300 overflow-hidden">
                            <button
                                onClick={() => setFormat('markdown')}
                                className={`px-3 py-1 text-xs ${format === 'markdown'
                                        ? 'bg-gray-800 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                Markdown
                            </button>
                            <button
                                onClick={() => setFormat('html')}
                                className={`px-3 py-1 text-xs border-l border-gray-300 ${format === 'html'
                                        ? 'bg-gray-800 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                HTML
                            </button>
                        </div>
                        <div className="border-t border-gray-200 pt-3">
                            <div className="text-xs font-medium text-gray-700 mb-2">
                                Отображение
                            </div>
                            <div className="inline-flex rounded border border-gray-300 overflow-hidden">
                                <button
                                    onClick={() => setViewMode('source')}
                                    className={`px-3 py-1 text-xs ${viewMode === 'source'
                                            ? 'bg-gray-800 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Исходник
                                </button>
                                <button
                                    onClick={() => setViewMode('preview')}
                                    className={`px-3 py-1 text-xs border-l border-gray-300 ${viewMode === 'preview'
                                            ? 'bg-gray-800 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Превью
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 pt-3">
                        <div className="text-xs font-medium text-gray-700 mb-2">
                            Включить в отчёт
                        </div>
                        <div className="space-y-1.5">
                            <Checkbox
                                label="Оглавление"
                                checked={!!options.includeToc}
                                onChange={v => setOptions(o => ({ ...o, includeToc: v }))}
                            />
                            <Checkbox
                                label="Табличные типы"
                                checked={!!options.includeTables}
                                onChange={v => setOptions(o => ({ ...o, includeTables: v }))}
                            />
                            <Checkbox
                                label="Обзор домена"
                                checked={!!options.includeOverview}
                                onChange={v => setOptions(o => ({ ...o, includeOverview: v }))}
                            />
                            <Checkbox
                                label="Сущности и атрибуты"
                                checked={!!options.includeEntities}
                                onChange={v => setOptions(o => ({ ...o, includeEntities: v }))}
                            />
                            <Checkbox
                                label="Workflow"
                                checked={!!options.includeWorkflows}
                                onChange={v => setOptions(o => ({ ...o, includeWorkflows: v }))}
                            />
                            <Checkbox
                                label="Связи"
                                checked={!!options.includeLinkages}
                                onChange={v => setOptions(o => ({ ...o, includeLinkages: v }))}
                            />
                            <Checkbox
                                label="Действия"
                                checked={!!options.includeActions}
                                onChange={v => setOptions(o => ({ ...o, includeActions: v }))}
                            />
                            <Checkbox
                                label="Меню"
                                checked={!!options.includeMenus}
                                onChange={v => setOptions(o => ({ ...o, includeMenus: v }))}
                            />
                            <Checkbox
                                label="Кросс-доменные ссылки"
                                checked={!!options.includeCrossRefs}
                                onChange={v => setOptions(o => ({ ...o, includeCrossRefs: v }))}
                            />
                            <Checkbox
                                label="Правила данных"
                                checked={!!options.includeRules}
                                onChange={v => setOptions(o => ({ ...o, includeRules: v }))}
                            />
                            <Checkbox
                                label="Диаграмма связей"
                                checked={!!options.includeDiagram}
                                onChange={v => setOptions(o => ({ ...o, includeDiagram: v }))}
                            />
                        </div>
                    </div>

                    <div className="border-t border-gray-200 pt-3">
                        <div className="text-[11px] text-gray-500 leading-relaxed">
                            Размер: <span className="tabular-nums">{previewText.length} симв.</span>
                            <br />
                            Формат: <code>{format}</code>
                        </div>
                    </div>
                </div>

                {/* Превью */}
                <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
                    <div className="flex-1 min-h-0 relative">
                        {viewMode === 'source' ? (
                            <Editor
                                height="100%"
                                language={format === 'markdown' ? 'markdown' : 'html'}
                                value={previewText}
                                options={{
                                    readOnly: true,
                                    fontSize: 13,
                                    minimap: { enabled: false },
                                    lineNumbers: 'off',
                                    wordWrap: 'on',
                                    scrollBeyondLastLine: false,
                                    renderLineHighlight: 'none',
                                }}
                            />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                title="Report preview"
                                className="w-full h-full border-0 bg-white"
                                srcDoc={html}
                                sandbox="allow-same-origin"
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 shrink-0">
                <div className="text-xs text-gray-500">
                    {format === 'html' ? (
                        <button
                            onClick={openHtml}
                            className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
                        >
                            Открыть в новой вкладке
                        </button>
                    ) : (
                        <span>Файл можно сохранить и добавить в git</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copy}
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                    >
                        Копировать
                    </button>
                    <button
                        onClick={download}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                        <IconDownload className="w-3.5 h-3.5" />
                        Скачать {format === 'markdown' ? '.md' : '.html'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function Checkbox({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {label}
        </label>
    );
}