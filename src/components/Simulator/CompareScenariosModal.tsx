import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useSimulatorScenariosStore } from '../../store/useSimulatorScenariosStore';
import { simulateRules } from '../../simulator/simulate';
import type { FieldState, SimulationResult } from '../../simulator/simulate';
import type { SimulationScenario } from '../../simulator/types';
import { showToast } from '../Toast';
import { IconX, IconDownload } from '../icons';

interface Props {
    onClose: () => void;
}

export function CompareScenariosModal({ onClose }: Props) {
    const domains = useSchemaStore(s => s.domains);
    const table = useSchemaStore(s => s.symbolTable);
    const domainId = useSchemaStore(s => s.activeDomainId ?? '');
    const context = useEditorStore(s => s.context);

    const scenarios = useSimulatorScenariosStore(s => s.scenarios);
    const activeId = useSimulatorScenariosStore(s => s.activeScenarioId);

    const [leftId, setLeftId] = useState<string>(() => {
        if (scenarios.length >= 2) return scenarios[0].id;
        return activeId ?? scenarios[0]?.id ?? '';
    });
    const [rightId, setRightId] = useState<string>(() => {
        if (scenarios.length >= 2) return scenarios[1].id;
        return activeId ?? scenarios[0]?.id ?? '';
    });
    const [onlyDiffs, setOnlyDiffs] = useState(true);

    const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';
    const entity = entityFqid && table ? table.entities.get(entityFqid) : undefined;
    const domain = domains.find(d => d.id === domainId);

    const left = scenarios.find(s => s.id === leftId) ?? null;
    const right = scenarios.find(s => s.id === rightId) ?? null;

    const leftResult = useMemo(
        () => runScenario(left, entity, table, domain),
        [left, entity, table, domain],
    );
    const rightResult = useMemo(
        () => runScenario(right, entity, table, domain),
        [right, entity, table, domain],
    );

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    if (!entity || !table || !domain) {
        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-lg shadow-xl p-6">
                    <div className="text-sm text-gray-700 mb-4">
                        Выберите сущность, чтобы сравнить сценарии
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

    if (scenarios.length < 2) {
        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md" onClick={e => e.stopPropagation()}>
                    <div className="text-sm text-gray-700 mb-4">
                        Для сравнения нужно как минимум два сохранённых сценария.
                        Сейчас их {scenarios.length}.
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

    const diffsCount = countDiffs(leftResult, rightResult, entity);
    const attributeIds = [...entity.attributes.keys()];

    const visibleAttrs = onlyDiffs
        ? attributeIds.filter(id => hasFieldDiff(leftResult?.fields[id], rightResult?.fields[id]))
        : attributeIds;

    const leftRules = new Set(leftResult?.rules.filter(r => r.applies).map(r => r.ruleId) ?? []);
    const rightRules = new Set(rightResult?.rules.filter(r => r.applies).map(r => r.ruleId) ?? []);
    const allRules = new Set([...leftRules, ...rightRules]);
    const rulesDiff = [...allRules].filter(id => leftRules.has(id) !== rightRules.has(id));

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-lg shadow-xl w-[1200px] max-w-[95vw] max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <div>
                        <h2 className="font-medium text-gray-900">Сравнение сценариев</h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Сущность: <code>{entityFqid}</code>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                {/* Селекторы сценариев */}
                <div className="grid grid-cols-2 gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50">
                    <div>
                        <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1">
                            Левый сценарий
                        </label>
                        <select
                            value={leftId}
                            onChange={e => setLeftId(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                        >
                            {scenarios.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1">
                            Правый сценарий
                        </label>
                        <select
                            value={rightId}
                            onChange={e => setRightId(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                        >
                            {scenarios.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Сводка */}
                <div className="px-5 py-2 border-b border-gray-200 flex items-center gap-4 text-xs">
                    <div className="text-gray-600">
                        Всего различий:{' '}
                        <span
                            className={`font-medium ${diffsCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                                }`}
                        >
                            {diffsCount}
                        </span>
                    </div>
                    {diffsCount === 0 && (
                        <span className="text-emerald-700">Сценарии дают одинаковый результат</span>
                    )}
                    <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
                        <input
                            type="checkbox"
                            checked={onlyDiffs}
                            onChange={e => setOnlyDiffs(e.target.checked)}
                            className="rounded border-gray-300"
                        />
                        <span className="text-gray-600">Только различия</span>
                    </label>
                </div>

                {/* Тело */}
                <div className="flex-1 overflow-auto">
                    {/* Различия в правилах */}
                    {rulesDiff.length > 0 && (
                        <div className="px-5 py-3 border-b border-gray-200">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                                Правила, которые сработали по-разному
                            </div>
                            <div className="space-y-1">
                                {rulesDiff.map(ruleId => {
                                    const inLeft = leftRules.has(ruleId);
                                    const inRight = rightRules.has(ruleId);
                                    return (
                                        <div
                                            key={ruleId}
                                            className="flex items-center gap-2 text-xs px-2 py-1 bg-amber-50 border border-amber-200 rounded"
                                        >
                                            <code className="font-mono text-[11px] text-gray-800">
                                                {ruleId}
                                            </code>
                                            <span className="ml-auto flex items-center gap-2 text-[10px]">
                                                <span className={inLeft ? 'text-emerald-700' : 'text-gray-400'}>
                                                    {inLeft ? '✓ в левом' : '✗ в левом'}
                                                </span>
                                                <span className={inRight ? 'text-emerald-700' : 'text-gray-400'}>
                                                    {inRight ? '✓ в правом' : '✗ в правом'}
                                                </span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Таблица полей */}
                    <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                            <tr>
                                <th className="text-left px-4 py-2 font-medium text-gray-600">
                                    Атрибут
                                </th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600">
                                    {left?.name ?? '—'}
                                </th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600">
                                    {right?.name ?? '—'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleAttrs.map(attrId => {
                                const attr = entity.attributes.get(attrId);
                                if (!attr) return null;

                                const leftState = leftResult?.fields[attrId];
                                const rightState = rightResult?.fields[attrId];
                                const diff = hasFieldDiff(leftState, rightState);

                                return (
                                    <tr
                                        key={attrId}
                                        className={`border-b border-gray-100 ${diff ? 'bg-amber-50/40' : ''
                                            }`}
                                    >
                                        <td className="px-4 py-2 align-top">
                                            <div className="text-gray-800 text-[11px]">
                                                {attr.name ?? attr.id}
                                                {diff && <span className="ml-2 text-amber-600">●</span>}
                                            </div>
                                            <code className="text-[10px] text-gray-400">
                                                {attr.id}
                                            </code>
                                        </td>
                                        <td className="px-4 py-2 align-top">
                                            <FieldCell state={leftState} />
                                        </td>
                                        <td className="px-4 py-2 align-top">
                                            <FieldCell state={rightState} />
                                        </td>
                                    </tr>
                                );
                            })}
                            {visibleAttrs.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-6 text-center text-xs text-gray-400">
                                        {onlyDiffs ? 'Различий нет' : 'Нет атрибутов'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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

function FieldCell({ state }: { state: FieldState | undefined }) {
    if (!state) return <span className="text-gray-300">—</span>;

    const badges: string[] = [];
    if (!state.visible) badges.push('скрыто');
    if (state.readonly) badges.push('readonly');
    if (state.required) badges.push('required');
    if (state.validationError) badges.push('ошибка');

    return (
        <div className="space-y-0.5">
            <div className="font-mono text-[11px] text-gray-700 truncate max-w-[200px]" title={String(state.value ?? '')}>
                {state.value === null || state.value === undefined
                    ? <span className="text-gray-400 italic">null</span>
                    : typeof state.value === 'object'
                        ? JSON.stringify(state.value)
                        : String(state.value)}
            </div>
            {badges.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                    {badges.map(b => (
                        <span
                            key={b}
                            className="text-[9px] px-1 rounded bg-gray-100 text-gray-600"
                        >
                            {b}
                        </span>
                    ))}
                </div>
            )}
            {state.validationError && (
                <div className="text-[9px] text-red-600">{state.validationError}</div>
            )}
        </div>
    );
}

// =========================================================================

function runScenario(
    scenario: SimulationScenario | null,
    entity: any,
    table: any,
    domain: any,
): SimulationResult | null {
    if (!scenario || !entity || !table || !domain) return null;

    let obj: Record<string, any>;
    try {
        obj = JSON.parse(scenario.objectJson || '{}');
    } catch {
        return null;
    }

    const rules = (domain.dataRules ?? []).filter((r: any) =>
        scenario.selectedRuleIds.includes(r.id),
    );

    return simulateRules({
        obj,
        rules,
        entity,
        table,
        domain,
        currentUser: { id: 'user-1', username: scenario.username, roles: scenario.roles },
        currentDate: new Date(scenario.currentDate),
        linkages: scenario.linkages ?? {},
    });
}

function hasFieldDiff(
    a: FieldState | undefined,
    b: FieldState | undefined,
): boolean {
    if (!a || !b) return true;
    return (
        a.visible !== b.visible ||
        a.readonly !== b.readonly ||
        a.required !== b.required ||
        a.validationError !== b.validationError ||
        JSON.stringify(a.value) !== JSON.stringify(b.value)
    );
}

function countDiffs(
    left: SimulationResult | null,
    right: SimulationResult | null,
    entity: any,
): number {
    if (!left || !right) return 0;
    let count = 0;
    for (const attrId of entity.attributes.keys()) {
        if (hasFieldDiff(left.fields[attrId], right.fields[attrId])) count++;
    }
    return count;
}