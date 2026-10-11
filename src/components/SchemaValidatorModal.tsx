import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSchemaStore } from '../store/useSchemaStore';
import { useSchemaUiStore } from '../store/useSchemaUiStore';
import { validateSchemas, type SchemaIssue, type IssueSeverity } from '../schema/validate-schema';
import { IconX, IconCheck, IconRefresh } from './icons';
import { buildValidationReportMarkdown } from '../report/validation-report';
import { IconDownload, IconCopy } from './icons';
import { showToast } from './Toast';

interface Props {
    onClose: () => void;
}

type Filter = IssueSeverity | 'all';

export function SchemaValidatorModal({ onClose }: Props) {
    const domains = useSchemaStore(s => s.domains);
    const focusOn = useSchemaUiStore(s => s.focusOn);
    const setExplorerMode = useSchemaUiStore(s => s.setExplorerMode);

    const [filter, setFilter] = useState<Filter>('all');
    const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});

    const result = useMemo(() => validateSchemas(domains), [domains]);

    const filtered = useMemo(
        () =>
            filter === 'all'
                ? result.issues
                : result.issues.filter(i => i.severity === filter),
        [result.issues, filter],
    );

    const grouped = useMemo(() => {
        const map = new Map<string, SchemaIssue[]>();
        for (const issue of filtered) {
            const list = map.get(issue.domainId) ?? [];
            list.push(issue);
            map.set(issue.domainId, list);
        }
        return [...map.entries()];
    }, [filtered]);

    const handleClick = (issue: SchemaIssue) => {
        if (issue.target.kind === 'entity') {
            focusOn({ kind: 'entity', fqid: issue.target.fqid });
            setExplorerMode('entities');
        } else if (issue.target.kind === 'linkage') {
            focusOn({ kind: 'linkage', fqid: issue.target.fqid });
            setExplorerMode('linkages');
        } else if (issue.target.kind === 'attribute') {
            // Открыть сущность в explorer
            const [entityFqid] = issue.target.fqid.split('.');
            focusOn({ kind: 'entity', fqid: entityFqid });
            setExplorerMode('entities');
        } else if (issue.target.kind === 'rule') {
            setExplorerMode('rules');
        } else if (issue.target.kind === 'dataType' || issue.target.kind === 'sequence') {
            setExplorerMode('entities');
        }
        onClose();
    };

    const copyReport = async () => {
        const domainNames = new Map(domains.map(d => [d.id, d.name]));
        const md = buildValidationReportMarkdown({ result, domainNames });
        try {
            await navigator.clipboard.writeText(md);
            showToast('Отчёт скопирован');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = md;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Отчёт скопирован');
        }
    };

    const downloadReport = () => {
        const domainNames = new Map(domains.map(d => [d.id, d.name]));
        const md = buildValidationReportMarkdown({ result, domainNames });
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `validation-report-${Date.now()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Отчёт сохранён');
    };

    const noIssues = result.issues.length === 0;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-[900px] max-w-[95vw] max-h-[85vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <div>
                        <h2 className="font-medium text-gray-900">Валидация схем</h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            {noIssues
                                ? 'Проблем не найдено'
                                : `Найдено ${result.stats.total} ${plural(result.stats.total, 'проблема', 'проблемы', 'проблем')
                                }`}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                {/* Фильтр */}
                <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-200 bg-gray-50">
                    <FilterButton
                        label={`Все (${result.stats.total})`}
                        active={filter === 'all'}
                        onClick={() => setFilter('all')}
                    />
                    <FilterButton
                        label={`⛔ Ошибки (${result.stats.errors})`}
                        active={filter === 'error'}
                        onClick={() => setFilter('error')}
                        disabled={result.stats.errors === 0}
                        color="red"
                    />
                    <FilterButton
                        label={`⚠ Предупреждения (${result.stats.warnings})`}
                        active={filter === 'warning'}
                        onClick={() => setFilter('warning')}
                        disabled={result.stats.warnings === 0}
                        color="amber"
                    />
                    <FilterButton
                        label={`ℹ Информация (${result.stats.infos})`}
                        active={filter === 'info'}
                        onClick={() => setFilter('info')}
                        disabled={result.stats.infos === 0}
                        color="blue"
                    />
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    {noIssues ? (
                        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                                <IconCheck className="w-6 h-6" />
                            </div>
                            <div className="text-sm font-medium text-gray-800">
                                Схемы валидны
                            </div>
                            <div className="text-xs text-gray-500 mt-1 max-w-sm">
                                Проблем в загруженных доменах не найдено.
                                Проверено сущностей: {domains.reduce((sum, d) => sum + (d.entities?.length ?? 0), 0)}
                            </div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-xs text-gray-400">
                            Нет проблем с выбранным уровнем
                        </div>
                    ) : (
                        <div>
                            {grouped.map(([domainId, issues]) => {
                                const isExpanded = expandedDomains[domainId] !== false;
                                const domain = domains.find(d => d.id === domainId);

                                return (
                                    <div key={domainId}>
                                        <button
                                            onClick={() =>
                                                setExpandedDomains(s => ({ ...s, [domainId]: !isExpanded }))
                                            }
                                            className="w-full flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-left sticky top-0 border-b border-gray-200 z-10"
                                        >
                                            <span className="text-gray-400 text-xs">
                                                {isExpanded ? '▾' : '▸'}
                                            </span>
                                            <span className="text-xs font-medium text-gray-800 flex-1">
                                                {domain?.name ?? domainId}
                                            </span>
                                            <span className="text-[10px] font-mono text-gray-500">
                                                {domainId}
                                            </span>
                                            <span className="text-[10px] text-gray-500 tabular-nums ml-2">
                                                {issues.length}
                                            </span>
                                        </button>

                                        {isExpanded && (
                                            <ul>
                                                {issues.map((issue, i) => (
                                                    <IssueItem
                                                        key={i}
                                                        issue={issue}
                                                        onClick={() => handleClick(issue)}
                                                    />
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
                    <div className="text-xs text-gray-500">
                        Проверено доменов: {domains.length}
                    </div>
                    <div className="flex items-center gap-2">
                        {!noIssues && (
                            <>
                                <button
                                    onClick={copyReport}
                                    className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                                    title="Скопировать отчёт в формате Markdown"
                                >
                                    Копировать отчёт
                                </button>
                                <button
                                    onClick={downloadReport}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                                    title="Скачать отчёт в формате Markdown"
                                >
                                    <IconDownload className="w-3.5 h-3.5" />
                                    Скачать .md
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// =========================================================================

function FilterButton({
    label,
    active,
    onClick,
    disabled,
    color,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
    color?: 'red' | 'amber' | 'blue';
}) {
    const activeClass = color
        ? {
            red: 'bg-red-100 text-red-800 border-red-300',
            amber: 'bg-amber-100 text-amber-800 border-amber-300',
            blue: 'bg-blue-100 text-blue-800 border-blue-300',
        }[color]
        : 'bg-gray-800 text-white border-gray-800';

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active
                    ? activeClass
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
        >
            {label}
        </button>
    );
}

function IssueItem({
    issue,
    onClick,
}: {
    issue: SchemaIssue;
    onClick: () => void;
}) {
    const styles = {
        error: {
            icon: '⛔',
            iconCls: 'text-red-500',
            bg: 'hover:bg-red-50',
        },
        warning: {
            icon: '⚠',
            iconCls: 'text-amber-500',
            bg: 'hover:bg-amber-50',
        },
        info: {
            icon: 'ℹ',
            iconCls: 'text-blue-500',
            bg: 'hover:bg-blue-50',
        },
    }[issue.severity];

    return (
        <li
            onClick={onClick}
            className={`px-4 py-2 border-b border-gray-100 cursor-pointer flex items-start gap-2 ${styles.bg}`}
        >
            <span className={`shrink-0 ${styles.iconCls}`}>{styles.icon}</span>
            <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-800">{issue.message}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    {issue.code}
                </div>
            </div>
            <span className="text-[10px] text-blue-500 shrink-0 opacity-0 group-hover:opacity-100">
                → открыть
            </span>
        </li>
    );
}

// =========================================================================

function plural(n: number, one: string, few: string, many: string): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
}