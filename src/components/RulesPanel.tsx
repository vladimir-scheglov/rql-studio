import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSchemaStore } from '../store/useSchemaStore';
import { useEditorStore } from '../store/useEditorStore';
import { useCurrentRuleStore } from '../store/useCurrentRuleStore';
import { parseDataRule } from '../constructor/import-rule';
import { showToast } from './Toast';
import { IconX, IconCheck, IconCopy, IconSearch, IconDownload, IconLayoutHorizontal } from './icons';
import type { DataRule, DomainSchema } from '../schema/types';
import type { DataRuleEffect } from '../constructor/export-yaml';
import { useConstructorStore } from '../store/useConstructorStore';
import { usePathBuilderStore } from '../store/usePathBuilderStore';

type EffectFilter = DataRuleEffect | 'all';

const EFFECTS: { id: EffectFilter; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'required', label: 'required' },
    { id: 'hidden', label: 'hidden' },
    { id: 'readonly', label: 'readonly' },
    { id: 'allowed', label: 'allowed' },
    { id: 'default', label: 'default' },
];

interface RuleRow {
    rule: DataRule;
    domainId: string;
    domainName: string;
    entityId: string;
    effect: string | null;
}

export function RulesPanel() {
    const domains = useSchemaStore(s => s.domains);
    const table = useSchemaStore(s => s.symbolTable);
    const setRoot = useConstructorStore(s => s.setRoot);
    const setCurrentRule = useCurrentRuleStore(s => s.setCurrentRule);
    const setActiveTab = useEditorStore(s => s.setActiveTab);
    const setContext = useEditorStore(s => s.setContext);
    const activeDomainId = useSchemaStore(s => s.activeDomainId);

    const [filter, setFilter] = useState('');
    const [effectFilter, setEffectFilter] = useState<EffectFilter>('all');
    const [showExport, setShowExport] = useState(false);
    const openBuilder = usePathBuilderStore(s => s.openBuilder);

    // Собираем все правила со всех доменов
    const allRules: RuleRow[] = useMemo(() => {
        const result: RuleRow[] = [];
        for (const domain of domains) {
            for (const rule of domain.dataRules ?? []) {
                result.push({
                    rule,
                    domainId: domain.id,
                    domainName: domain.name,
                    entityId: rule.entity ?? '',
                    effect: rule.rule?.effect ?? null,
                });
            }
        }
        return result;
    }, [domains]);

    const filtered = useMemo(() => {
        const needle = filter.toLowerCase().trim();
        return allRules.filter(r => {
            if (effectFilter !== 'all' && r.effect !== effectFilter) return false;
            if (!needle) return true;
            return (
                r.rule.id.toLowerCase().includes(needle) ||
                (r.rule.name ?? '').toLowerCase().includes(needle) ||
                r.entityId.toLowerCase().includes(needle) ||
                r.domainId.toLowerCase().includes(needle)
            );
        });
    }, [allRules, filter, effectFilter]);

    // Группировка по домену
    const grouped = useMemo(() => {
        const map = new Map<string, { domainName: string; rows: RuleRow[] }>();
        for (const r of filtered) {
            const entry = map.get(r.domainId) ?? { domainName: r.domainName, rows: [] };
            entry.rows.push(r);
            map.set(r.domainId, entry);
        }
        return [...map.entries()];
    }, [filtered]);

    const openRule = (row: RuleRow) => {
        if (!table) return;

        const { result, errors } = parseDataRule(
            row.rule,
            table,
            row.domainId,
            '',
        );

        if (!result) {
            alert('Не удалось открыть правило:\n\n' + errors.join('\n'));
            return;
        }

        setCurrentRule(result.ruleId, result.effect, result.isUnconditional);
        setRoot(result.root);
        setActiveTab('builder');
        if (row.entityId) {
            setContext({
                kind: 'condition',
                entityFqid: `${row.domainId}/${row.entityId}`,
            });
        }
        showToast('Правило открыто');
    };

    if (allRules.length === 0) {
        return (
            <div className="flex flex-col h-full min-h-0">
                <div className="p-2 border-b border-gray-100 shrink-0">
                    <input
                        type="text"
                        disabled
                        placeholder="Правил в схемах нет"
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-gray-50 text-gray-400"
                    />
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-xs text-gray-400 text-center leading-relaxed">
                        В загруженных схемах нет правил данных.
                        <br />
                        Добавьте блок <code className="text-gray-600">dataRules</code> в YAML.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Поиск */}
            <div className="p-2 border-b border-gray-100 shrink-0 space-y-1.5">
                <input
                    type="text"
                    placeholder="Поиск по ID, названию, сущности..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                />

                {/* Фильтр по эффекту */}
                <div className="flex flex-wrap gap-0.5">
                    {EFFECTS.map(e => (
                        <button
                            key={e.id}
                            onClick={() => setEffectFilter(e.id)}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${effectFilter === e.id
                                    ? 'bg-gray-800 text-white'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            {e.label}
                        </button>
                    ))}
                </div>

                {/* Сводка + экспорт */}
                <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] text-gray-400">
                        Найдено: {filtered.length} из {allRules.length}
                    </span>
                    <button
                        onClick={() => setShowExport(true)}
                        disabled={filtered.length === 0}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 hover:bg-gray-50 text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                        title="Экспортировать видимые правила в YAML"
                    >
                        Экспорт в YAML
                    </button>
                    <button
                        onClick={() => openBuilder()}
                        disabled={!table || !activeDomainId}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Построить правило по цепочке связей"
                    >
                        + Путь
                    </button>
                </div>
            </div>

            {/* Список */}
            <div className="overflow-auto flex-1 text-sm">
                {grouped.map(([domainId, { domainName, rows }]) => (
                    <div key={domainId}>
                        <div className="px-3 py-1 bg-gray-100 text-[11px] font-medium text-gray-700 sticky top-0 border-b border-gray-200 flex items-center justify-between">
                            <span className="truncate" title={domainId}>
                                {domainName}
                            </span>
                            <span className="text-[10px] text-gray-500 tabular-nums">
                                {rows.length}
                            </span>
                        </div>

                        <ul>
                            {rows.map(row => (
                                <RuleItem
                                    key={`${row.domainId}/${row.rule.id}`}
                                    row={row}
                                    onOpen={() => openRule(row)}
                                />
                            ))}
                        </ul>
                    </div>
                ))}

                {filtered.length === 0 && (
                    <div className="px-3 py-6 text-xs text-gray-400 text-center">
                        Ничего не найдено
                    </div>
                )}
            </div>

            {showExport && (
                <ExportRulesModal
                    rules={filtered}
                    onClose={() => setShowExport(false)}
                />
            )}
        </div>
    );
}

// =========================================================================
// Строка правила
// =========================================================================

function RuleItem({ row, onOpen }: { row: RuleRow; onOpen: () => void }) {
    const copyId = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(row.rule.id);
            showToast('Скопировано: ' + row.rule.id);
        } catch {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = row.rule.id;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Скопировано: ' + row.rule.id);
        }
    };

    return (
        <li
            onClick={onOpen}
            className="group/rule px-3 py-1.5 cursor-pointer hover:bg-blue-50 border-b border-gray-50 flex items-start gap-2"
        >
            <div className="flex-1 min-w-0">
                {/* ID + бейдж эффекта */}
                <div className="flex items-center gap-1.5">
                    <code
                        className="text-[11px] font-mono text-blue-800 truncate"
                        title={row.rule.id}
                    >
                        {row.rule.id}
                    </code>
                    {row.effect && <EffectBadge effect={row.effect} />}
                </div>

                {/* Название */}
                {row.rule.name && (
                    <div
                        className="text-[11px] text-gray-600 truncate mt-0.5"
                        title={row.rule.name}
                    >
                        {row.rule.name}
                    </div>
                )}

                {/* Сущность */}
                <div className="text-[10px] text-gray-400 truncate mt-0.5">
                    {row.entityId || '—'}
                </div>
            </div>

            {/* Кнопка копирования */}
            <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                <button
                    onClick={e => {
                        e.stopPropagation();
                        onOpen();
                    }}
                    title="Открыть в конструкторе"
                    className="opacity-0 group-hover/rule:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-100 transition-opacity"
                >
                    <IconLayoutHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={copyId}
                    title="Скопировать ID"
                    className="opacity-0 group-hover/rule:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-100 transition-opacity"
                >
                    <IconCopy className="w-3.5 h-3.5" />
                </button>
            </div>
        </li>
    );
}

function EffectBadge({ effect }: { effect: string }) {
    const styles: Record<string, string> = {
        required: 'bg-red-100 text-red-700',
        hidden: 'bg-gray-200 text-gray-700',
        readonly: 'bg-amber-100 text-amber-700',
        allowed: 'bg-purple-100 text-purple-700',
        default: 'bg-blue-100 text-blue-700',
    };
    const cls = styles[effect] ?? 'bg-gray-100 text-gray-600';
    return (
        <span
            className={`text-[9px] font-mono px-1 rounded ${cls} shrink-0`}
        >
            {effect}
        </span>
    );
}

// =========================================================================
// Модалка экспорта
// =========================================================================

function ExportRulesModal({
    rules,
    onClose,
}: {
    rules: RuleRow[];
    onClose: () => void;
}) {
    const table = useSchemaStore(s => s.symbolTable);

    const yaml = useMemo(() => {
        if (!table) return '';

        // Группируем по домену, чтобы получить корректный YAML
        const byDomain = new Map<string, RuleRow[]>();
        for (const r of rules) {
            const list = byDomain.get(r.domainId) ?? [];
            list.push(r);
            byDomain.set(r.domainId, list);
        }

        const parts: string[] = [];
        for (const [domainId, domainRules] of byDomain) {
            parts.push(`# ===== Domain: ${domainId} =====`);
            parts.push('dataRules:');
            for (const r of domainRules) {
                parts.push(renderRuleYaml(r));
            }
            parts.push('');
        }
        return parts.join('\n').trimEnd();
    }, [rules, table]);

    const downloadYaml = () => {
        const blob = new Blob([yaml], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dataRules-${Date.now()}.yaml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Файл сохранён');
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(yaml);
            showToast('YAML скопирован');
            onClose();
        } catch {
            const ta = document.createElement('textarea');
            ta.value = yaml;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('YAML скопирован');
            onClose();
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-[900px] max-w-[95vw] max-h-[85vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <div>
                        <h2 className="font-medium text-gray-900">
                            Экспорт правил в YAML
                        </h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Правил: {rules.length}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                <div className="flex-1 overflow-auto bg-gray-50">
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words text-gray-800 bg-white min-h-full">
                        {yaml}
                    </pre>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={copy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                        <IconCheck className="w-3.5 h-3.5" />
                        Скопировать
                    </button>
                    <button
                        onClick={downloadYaml}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                    >
                        <IconDownload className="w-3.5 h-3.5" />
                        Скачать .yaml
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// =========================================================================
// YAML для одного правила
// =========================================================================

function renderRuleYaml(row: RuleRow): string {
    const rule = row.rule;
    const lines: string[] = [];

    lines.push(`  - id: ${rule.id}`);
    if (rule.name) {
        lines.push(`    name: ${yamlStr(rule.name)}`);
    }
    if (rule.target) {
        lines.push(`    target: ${rule.target}`);
    }
    if (rule.entity) {
        lines.push(`    entity: ${rule.entity}`);
    }

    // condition
    const cond = extractConditionStr(rule.condition);
    if (cond === 'true' || cond === '' || cond === undefined) {
        lines.push(`    condition: 'true'`);
    } else if (cond.length <= 100 && !cond.includes('\n')) {
        lines.push(`    condition: !rql ${cond}`);
    } else {
        lines.push(`    condition: !rql |`);
        for (const l of cond.split('\n')) {
            lines.push(`      ${l}`);
        }
    }

    // message
    if (rule.message) {
        lines.push(`    message: ${yamlStr(rule.message)}`);
    }
    if (rule.help) {
        lines.push(`    help: ${yamlStr(rule.help)}`);
    }

    // rule
    const r = rule.rule;
    if (r) {
        lines.push(`    rule:`);
        if (r.effect) {
            lines.push(`      effect: ${r.effect}`);
        }
        if (r.attributes && r.attributes.length > 0) {
            lines.push(`      attributes:`);
            for (const a of r.attributes) {
                lines.push(`        - attribute: ${a.attribute}`);
                if (a.message) {
                    lines.push(`          message: ${yamlStr(a.message)}`);
                }
                if (a.help) {
                    lines.push(`          help: ${yamlStr(a.help)}`);
                }
            }
        }
    }

    return lines.join('\n');
}

function extractConditionStr(condition: unknown): string {
    if (condition === true) return 'true';
    if (typeof condition === 'string') {
        return condition.replace(/^!rql\s*/i, '').trim();
    }
    if (condition && typeof condition === 'object') {
        const c = condition as any;
        if (typeof c.value === 'string') return c.value.trim();
        if (c.value === true) return 'true';
    }
    return '';
}

function yamlStr(value: string): string {
    if (/[:#[\]{}|>&*!?'",%@`]/.test(value) || /^[\s-]/.test(value) || /\s$/.test(value)) {
        return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
}