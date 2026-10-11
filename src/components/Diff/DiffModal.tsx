import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSchemaStore } from '../../store/useSchemaStore';
import { parseSchemaFiles } from '../../schema/parse';
import { diffSchemas, type SchemaDiff, type ChangeStatus } from '../../schema/diff';
import { IconX, IconCheck } from '../icons';
import { showToast } from '../Toast';

interface Props {
    onClose: () => void;
}

export function DiffModal({ onClose }: Props) {
    const rawFiles = useSchemaStore(s => s.rawFiles);
    const loadedDomains = useSchemaStore(s => s.domains);

    // Источники: либо из загруженных файлов, либо загруженный пользователем
    const [baseSource, setBaseSource] = useState<string>('');
    const [targetSource, setTargetSource] = useState<string>('');
    const [baseCustom, setBaseCustom] = useState<{ name: string; content: string } | null>(null);
    const [targetCustom, setTargetCustom] = useState<{ name: string; content: string } | null>(null);
    const [filter, setFilter] = useState<'all' | ChangeStatus>('all');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Загружаем схему из источника
    const getDomain = (
        source: string,
        custom: { name: string; content: string } | null,
    ) => {
        if (source === '__custom__' && custom) {
            const { domains } = parseSchemaFiles([custom]);
            return domains[0] ?? null;
        }
        if (!source) return null;
        // Ищем по имени файла
        const file = rawFiles.find(f => f.name === source);
        if (!file) return null;
        const { domains } = parseSchemaFiles([file]);
        return domains[0] ?? null;
    };

    const baseDomain = useMemo(
        () => getDomain(baseSource, baseCustom),
        [baseSource, baseCustom, rawFiles],
    );
    const targetDomain = useMemo(
        () => getDomain(targetSource, targetCustom),
        [targetSource, targetCustom, rawFiles],
    );

    const diff: SchemaDiff | null = useMemo(() => {
        if (!baseDomain || !targetDomain) return null;
        return diffSchemas(baseDomain, targetDomain);
    }, [baseDomain, targetDomain]);

    if (!diff) {
        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
                <div className="bg-white rounded-lg shadow-xl w-[720px] max-w-[95vw] p-6" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-medium text-gray-900">Сравнение версий схем</h2>
                        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                            <IconX />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <SourceSelector
                            label="Базовая версия"
                            value={baseSource}
                            onChange={setBaseSource}
                            rawFiles={rawFiles}
                            custom={baseCustom}
                            onCustom={setBaseCustom}
                        />
                        <SourceSelector
                            label="Новая версия"
                            value={targetSource}
                            onChange={setTargetSource}
                            rawFiles={rawFiles}
                            custom={targetCustom}
                            onCustom={setTargetCustom}
                        />
                    </div>
                    <div className="mt-4 text-xs text-gray-500">
                        Выберите два источника. Это могут быть загруженные файлы или новые YAML-файлы.
                    </div>
                </div>
            </div>,
            document.body,
        );
    }

    const noChanges = diff.summary.total.total === 0;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-lg shadow-xl w-[1100px] max-w-[95vw] max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <div>
                        <h2 className="font-medium text-gray-900">Diff версий схемы</h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            <code>{diff.baseId}</code> v{diff.baseVersion}
                            {' → '}
                            <code>{diff.targetId}</code> v{diff.targetVersion}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                {/* Селекторы */}
                <div className="grid grid-cols-2 gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50">
                    <SourceSelector
                        label="Базовая версия"
                        value={baseSource}
                        onChange={setBaseSource}
                        rawFiles={rawFiles}
                        custom={baseCustom}
                        onCustom={setBaseCustom}
                    />
                    <SourceSelector
                        label="Новая версия"
                        value={targetSource}
                        onChange={setTargetSource}
                        rawFiles={rawFiles}
                        custom={targetCustom}
                        onCustom={setTargetCustom}
                    />
                </div>

                {/* Сводка и фильтры */}
                {!noChanges && (
                    <div className="px-5 py-2 border-b border-gray-200 flex items-center gap-3 text-xs">
                        <span className="text-emerald-700">+{diff.summary.total.added} добавлено</span>
                        <span className="text-red-700">−{diff.summary.total.removed} удалено</span>
                        <span className="text-amber-700">~{diff.summary.total.modified} изменено</span>

                        <div className="flex items-center gap-1 ml-4">
                            <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>Все</FilterBtn>
                            <FilterBtn active={filter === 'added'} onClick={() => setFilter('added')} color="green">Добавленные</FilterBtn>
                            <FilterBtn active={filter === 'removed'} onClick={() => setFilter('removed')} color="red">Удалённые</FilterBtn>
                            <FilterBtn active={filter === 'modified'} onClick={() => setFilter('modified')} color="amber">Изменённые</FilterBtn>
                        </div>
                    </div>
                )}

                {/* Тело */}
                <div className="flex-1 overflow-auto">
                    {noChanges ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                                <IconCheck className="w-6 h-6" />
                            </div>
                            <div className="text-sm font-medium text-gray-800">Схемы идентичны</div>
                            <div className="text-xs text-gray-500 mt-1">
                                Между выбранными версиями нет различий
                            </div>
                        </div>
                    ) : (
                        <div className="p-5 space-y-4">
                            <Section title="Сущности" sectionKey="entities" summary={diff.summary.entities} filter={filter}>
                                {diff.entities
                                    .filter(e => filter === 'all' || e.status === filter)
                                    .map(e => (
                                        <EntityDiffRow
                                            key={e.id}
                                            diff={e}
                                            filter={filter}
                                            expanded={!!expanded['entity:' + e.id]}
                                            onToggle={() => setExpanded(s => ({ ...s, ['entity:' + e.id]: !s['entity:' + e.id] }))}
                                        />
                                    ))}
                            </Section>

                            <Section title="Связи" sectionKey="linkages" summary={diff.summary.linkages} filter={filter}>
                                {diff.linkages
                                    .filter(e => filter === 'all' || e.status === filter)
                                    .map(l => <SimpleDiffRow key={l.id} diff={l} label="Связь" />)}
                            </Section>

                            <Section title="Правила данных" sectionKey="rules" summary={diff.summary.rules} filter={filter}>
                                {diff.rules
                                    .filter(e => filter === 'all' || e.status === filter)
                                    .map(r => <SimpleDiffRow key={r.id} diff={r} label="Правило" />)}
                            </Section>

                            <Section title="Перечисления и workflow" sectionKey="dataTypes" summary={diff.summary.dataTypes} filter={filter}>
                                {diff.dataTypes
                                    .filter(e => filter === 'all' || e.status === filter)
                                    .map(d => <SimpleDiffRow key={d.id} diff={d} label="Тип" />)}
                            </Section>

                            <Section title="Последовательности" sectionKey="sequences" summary={diff.summary.sequences} filter={filter}>
                                {diff.sequences
                                    .filter(e => filter === 'all' || e.status === filter)
                                    .map(s => <SimpleDiffRow key={s.id} diff={s} label="Последовательность" />)}
                            </Section>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// =========================================================================

function SourceSelector({
    label,
    value,
    onChange,
    rawFiles,
    custom,
    onCustom,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    rawFiles: { name: string; content: string }[];
    custom: { name: string; content: string } | null;
    onCustom: (c: { name: string; content: string } | null) => void;
}) {
    const fileInputRef = useState<HTMLInputElement | null>(null);

    return (
        <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <select
                    value={value}
                    onChange={e => {
                        if (e.target.value === '__upload__') {
                            // Триггерим input файла
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.yaml,.yml';
                            input.onchange = async () => {
                                const file = input.files?.[0];
                                if (!file) return;
                                const content = await file.text();
                                onCustom({ name: file.name, content });
                                onChange('__custom__');
                            };
                            input.click();
                        } else {
                            onChange(e.target.value);
                        }
                    }}
                    className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                >
                    <option value="">— выберите —</option>
                    {rawFiles.map(f => (
                        <option key={f.name} value={f.name}>{f.name}</option>
                    ))}
                    {custom && (
                        <option value="__custom__">📄 {custom.name}</option>
                    )}
                    <option value="__upload__">+ Загрузить файл...</option>
                </select>
            </div>
            {value === '__custom__' && custom && (
                <div className="text-[10px] text-gray-500 mt-1 truncate">
                    Загружен: {custom.name}
                </div>
            )}
        </div>
    );
}

function FilterBtn({
    active,
    onClick,
    color,
    children,
}: {
    active: boolean;
    onClick: () => void;
    color?: 'green' | 'red' | 'amber';
    children: React.ReactNode;
}) {
    const colorCls = color
        ? {
            green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
            red: 'bg-red-100 text-red-800 border-red-300',
            amber: 'bg-amber-100 text-amber-800 border-amber-300',
        }[color]
        : 'bg-gray-800 text-white border-gray-800';

    return (
        <button
            onClick={onClick}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${active ? colorCls : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
        >
            {children}
        </button>
    );
}

function Section({
    title,
    summary,
    filter,
    children,
}: {
    title: string;
    sectionKey: string;
    summary: { total: number };
    filter: string;
    children: React.ReactNode;
}) {
    if (summary.total === 0) return null;

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                    {title}
                </h3>
                <span className="text-[10px] text-gray-400">({summary.total})</span>
            </div>
            <div className="bg-white rounded border border-gray-200 overflow-hidden">
                {children}
            </div>
        </div>
    );
}

function EntityDiffRow({
    diff,
    filter,
    expanded,
    onToggle,
}: {
    diff: any;
    filter: string;
    expanded: boolean;
    onToggle: () => void;
}) {
    const attrDiffs = diff.attributes.filter(
        (a: any) => filter === 'all' || a.status === filter,
    );
    const hasAttrs = attrDiffs.length > 0;

    return (
        <div className="border-b border-gray-100 last:border-0">
            <div
                onClick={hasAttrs ? onToggle : undefined}
                className={`flex items-center gap-2 px-3 py-2 ${hasAttrs ? 'cursor-pointer hover:bg-gray-50' : ''
                    }`}
            >
                {hasAttrs ? (
                    <span className="text-gray-400 text-xs w-3">{expanded ? '▾' : '▸'}</span>
                ) : (
                    <span className="w-3" />
                )}
                <StatusBadge status={diff.status} />
                <span className="text-xs text-gray-800 flex-1">
                    {diff.target?.name ?? diff.base?.name ?? diff.id}
                </span>
                <code className="text-[10px] text-gray-400">{diff.id}</code>
                {hasAttrs && (
                    <span className="text-[10px] text-gray-400">
                        {attrDiffs.length} атрибут(ов)
                    </span>
                )}
            </div>

            {expanded && hasAttrs && (
                <div className="pl-8 pb-2 space-y-1 bg-gray-50/50">
                    {attrDiffs.map((a: any) => (
                        <div key={a.id} className="flex items-center gap-2 py-1 text-[11px]">
                            <StatusBadge status={a.status} small />
                            <span className="text-gray-700">{a.target?.name ?? a.base?.name ?? a.id}</span>
                            <code className="text-[10px] text-gray-400">{a.id}</code>
                            {a.status === 'modified' && a.changedFields.length > 0 && (
                                <span className="text-[10px] text-amber-700 ml-2">
                                    {a.changedFields.map((f: any) => f.field).join(', ')}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SimpleDiffRow({ diff, label }: { diff: any; label: string }) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
            <StatusBadge status={diff.status} />
            <span className="text-xs text-gray-800 flex-1">
                {diff.target?.name ?? diff.base?.name ?? diff.id}
            </span>
            <code className="text-[10px] text-gray-400">{diff.id}</code>
            {diff.status === 'modified' && diff.changedFields.length > 0 && (
                <span className="text-[10px] text-amber-700">
                    {diff.changedFields.map((f: any) => f.field).join(', ')}
                </span>
            )}
        </div>
    );
}

function StatusBadge({ status, small }: { status: ChangeStatus; small?: boolean }) {
    const cls = small ? 'text-[9px] w-3 h-3' : 'text-[10px] w-4 h-4';
    const color: Record<ChangeStatus, string> = {
        added: 'bg-emerald-100 text-emerald-700',
        removed: 'bg-red-100 text-red-700',
        modified: 'bg-amber-100 text-amber-700',
        unchanged: 'bg-gray-100 text-gray-500',
    };
    const symbol: Record<ChangeStatus, string> = {
        added: '+',
        removed: '−',
        modified: '~',
        unchanged: '·',
    };
    return (
        <span className={`inline-flex items-center justify-center font-medium rounded ${cls} ${color[status]}`}>
            {symbol[status]}
        </span>
    );
}