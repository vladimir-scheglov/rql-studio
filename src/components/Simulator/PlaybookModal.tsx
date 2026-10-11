import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { useSimulatorPlaybooksStore } from '../../store/useSimulatorPlaybooksStore';
import { simulateRules } from '../../simulator/simulate';
import { StateBadges } from './StateBadge';
import { showToast } from '../Toast';
import { IconX, IconPlus, IconCheck, IconDownload } from '../icons';
import type { PlaybookStep } from '../../simulator/playbook-types';
import type { ResolvedEntity, SymbolTable } from '../../schema/symbol-table';
import type { DomainSchema } from '../../schema/types';
import { buildPlaybookMarkdown, collectStepDiffs, slugify } from '../../simulator/playbook-export';

interface Props {
    onClose: () => void;
}

export function PlaybookModal({ onClose }: Props) {
    const domains = useSchemaStore(s => s.domains);
    const table = useSchemaStore(s => s.symbolTable);
    const domainId = useSchemaStore(s => s.activeDomainId ?? '');
    const context = useEditorStore(s => s.context);

    const objectJson = useSimulatorStore(s => s.objectJson);
    const currentUser = useSimulatorStore(s => s.currentUser);
    const currentDate = useSimulatorStore(s => s.currentDate);
    const selectedRuleIds = useSimulatorStore(s => s.selectedRuleIds);
    const linkages = useSimulatorStore(s => s.linkages);

    const playbooks = useSimulatorPlaybooksStore(s => s.playbooks);
    const activeId = useSimulatorPlaybooksStore(s => s.activePlaybookId);
    const activeStepIndex = useSimulatorPlaybooksStore(s => s.activeStepIndex);
    const createPlaybook = useSimulatorPlaybooksStore(s => s.createPlaybook);
    const updatePlaybook = useSimulatorPlaybooksStore(s => s.updatePlaybook);
    const deletePlaybook = useSimulatorPlaybooksStore(s => s.deletePlaybook);
    const setActive = useSimulatorPlaybooksStore(s => s.setActive);
    const setActiveStep = useSimulatorPlaybooksStore(s => s.setActiveStep);
    const addStep = useSimulatorPlaybooksStore(s => s.addStep);
    const updateStep = useSimulatorPlaybooksStore(s => s.updateStep);
    const removeStep = useSimulatorPlaybooksStore(s => s.removeStep);

    const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';
    const entity = entityFqid && table ? table.entities.get(entityFqid) : undefined;
    const domain = domains.find(d => d.id === domainId);

    const active = playbooks.find(p => p.id === activeId) ?? null;
    const activeStep = active && active.steps[activeStepIndex] ? active.steps[activeStepIndex] : null;
    const moveStep = useSimulatorPlaybooksStore(s => s.moveStep);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Результат симуляции для активного шага
    const result = useMemo(() => {
        if (!activeStep || !entity || !table || !domain) return null;

        let obj: Record<string, any>;
        try {
            obj = JSON.parse(activeStep.objectJson || '{}');
        } catch {
            return null;
        }

        const rules = (domain.dataRules ?? []).filter(r =>
            activeStep.selectedRuleIds.includes(r.id),
        );

        return simulateRules({
            obj,
            rules,
            entity,
            table,
            domain,
            currentUser: { id: 'user-1', username: activeStep.username, roles: activeStep.roles },
            currentDate: new Date(activeStep.currentDate),
            linkages: activeStep.linkages ?? {},
        });
    }, [activeStep, entity, table, domain]);

    const createNew = () => {
        if (!entityFqid) {
            showToast('Выберите сущность');
            return;
        }
        const name = window.prompt('Название плейбука:', 'Жизненный цикл');
        if (!name) return;

        // Стартовый шаг — из текущего состояния
        const initialStep = makeStep('Шаг 1', objectJson, currentUser, currentDate, selectedRuleIds, linkages);

        createPlaybook({
            name,
            entityFqid,
            steps: [initialStep],
        });
        showToast('Плейбук создан');
    };

    const addStepFromCurrent = () => {
        if (!active) return;
        const stepName = window.prompt(
            'Название шага:',
            `Шаг ${active.steps.length + 1}`,
        );
        if (!stepName) return;

        const step = makeStep(
            stepName,
            objectJson,
            currentUser,
            currentDate,
            selectedRuleIds,
            linkages,
        );
        addStep(active.id, step);
        setActiveStep(active.steps.length);
        showToast('Шаг добавлен');
    };

    const overwriteStep = () => {
        if (!active || !activeStep) return;
        updateStep(active.id, activeStep.id, {
            objectJson,
            username: currentUser.username,
            roles: currentUser.roles,
            currentDate,
            selectedRuleIds: [...selectedRuleIds],
            linkages,
        });
        showToast('Шаг обновлён');
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-lg shadow-xl w-[1200px] max-w-[95vw] max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <div>
                        <h2 className="font-medium text-gray-900">Плейбуки симуляции</h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Цепочка состояний объекта: создан → в работе → закрыт
                        </div>
                    </div>
                    {active && (
                        <button
                            onClick={() => {
                                if (!entity || !table || !domain) return;
                                const md = buildPlaybookMarkdown({
                                    playbook: active,
                                    entity,
                                    table,
                                    domain,
                                });
                                const blob = new Blob([md], { type: 'text/markdown' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${slugify(active.name)}.playbook.md`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                showToast('Документ сохранён');
                            }}
                            disabled={!entity || !table || !domain}
                            className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                            title="Скачать плейбук как Markdown-документ"
                        >
                            <IconDownload className="w-3 h-3" />
                            Скачать .md
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                <div className="flex-1 flex min-h-0">
                    {/* Левая колонка: список плейбуков и шаги */}
                    <div className="w-72 border-r border-gray-200 flex flex-col min-h-0">
                        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                            <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                                Плейбуки
                            </span>
                            <button
                                onClick={createNew}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                            >
                                <IconPlus className="w-3 h-3" />
                                Новый
                            </button>
                        </div>

                        <div className="overflow-auto shrink-0 max-h-40">
                            {playbooks.length === 0 ? (
                                <div className="p-4 text-[11px] text-gray-400 italic text-center">
                                    нет плейбуков
                                </div>
                            ) : (
                                playbooks.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setActive(p.id)}
                                        className={`w-full text-left px-3 py-1.5 text-[11px] border-b border-gray-50 transition-colors ${activeId === p.id
                                            ? 'bg-blue-50 text-blue-900 font-medium'
                                            : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="truncate">{p.name}</div>
                                        <div className="text-[9px] text-gray-400">
                                            {p.steps.length} {p.steps.length === 1 ? 'шаг' : 'шагов'}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {active && (
                            <>
                                <div className="px-3 py-2 border-y border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                                    <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                                        Шаги
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={addStepFromCurrent}
                                            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-700 hover:bg-white"
                                            title="Добавить шаг из текущего состояния"
                                        >
                                            + Шаг
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`Удалить плейбук «${active.name}»?`)) {
                                                    deletePlaybook(active.id);
                                                }
                                            }}
                                            className="text-[10px] px-1.5 py-0.5 rounded text-red-600 hover:bg-red-50"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-auto flex-1">
                                    {active.steps.map((step, i) => (
                                        <button
                                            key={step.id}
                                            onClick={() => setActiveStep(i)}
                                            className={`w-full text-left px-3 py-2 border-b border-gray-50 transition-colors flex items-start gap-2 ${activeStepIndex === i
                                                ? 'bg-amber-50 border-l-2 border-l-amber-500'
                                                : 'hover:bg-gray-50'
                                                }`}
                                        >
                                            <span className="text-[10px] text-gray-400 mt-0.5 shrink-0">
                                                {i + 1}.
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] text-gray-800 truncate">
                                                    {step.name}
                                                </div>
                                                <div className="text-[9px] text-gray-400 truncate">
                                                    {step.username} · {formatDateShort(step.currentDate)}
                                                </div>
                                            </div>
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Удалить шаг «${step.name}»?`)) {
                                                        removeStep(active.id, step.id);
                                                        if (activeStepIndex >= active.steps.length - 1) {
                                                            setActiveStep(Math.max(0, active.steps.length - 2));
                                                        }
                                                    }
                                                }}
                                                className="text-gray-300 hover:text-red-600 text-xs shrink-0"
                                                title="Удалить шаг"
                                            >
                                                ×
                                            </button>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Правая колонка: результат выбранного шага */}
                    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
                        {!activeStep ? (
                            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-8 text-center">
                                {active
                                    ? 'Выберите шаг слева или добавьте новый'
                                    : 'Создайте плейбук или выберите существующий'}
                            </div>
                        ) : (
                            <>
                                <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
                                    {/* Навигация по шагам */}
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                            onClick={() => active && moveStep(active.id, -1)}
                                            disabled={activeStepIndex === 0}
                                            className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed"
                                            title="Предыдущий шаг"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                <path d="M7.5 3 L4.5 6 L7.5 9" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                        <span className="text-[10px] text-gray-400 tabular-nums w-8 text-center">
                                            {activeStepIndex + 1} / {active?.steps.length ?? 0}
                                        </span>
                                        <button
                                            onClick={() => active && moveStep(active.id, 1)}
                                            disabled={!active || activeStepIndex >= active.steps.length - 1}
                                            className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed"
                                            title="Следующий шаг"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                <path d="M4.5 3 L7.5 6 L4.5 9" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-gray-800 truncate">
                                            {activeStep.name}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                            {activeStep.username} · {formatDateFull(activeStep.currentDate)}
                                        </div>
                                    </div>

                                    <button
                                        onClick={overwriteStep}
                                        className="text-[10px] px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 shrink-0"
                                        title="Перезаписать шаг текущим состоянием"
                                    >
                                        Обновить
                                    </button>
                                </div>
                                {active && activeStepIndex > 0 && (
                                    <StepDiffBanner
                                        current={activeStep}
                                        previous={active.steps[activeStepIndex - 1]}
                                        entity={entity}
                                        table={table}
                                        domain={domain}
                                    />
                                )}

                                <div className="flex-1 overflow-auto">
                                    {!result ? (
                                        <div className="p-6 text-xs text-gray-400 text-center">
                                            Не удалось выполнить симуляцию
                                        </div>
                                    ) : (
                                        <>
                                            <div className="p-3">
                                                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                                                    Состояние полей
                                                </div>
                                                <div className="bg-white rounded border border-gray-200 overflow-hidden">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-gray-50 border-b border-gray-200">
                                                            <tr>
                                                                <th className="text-left px-3 py-1.5 font-medium text-gray-600 text-[10px]">
                                                                    Атрибут
                                                                </th>
                                                                <th className="text-left px-3 py-1.5 font-medium text-gray-600 text-[10px]">
                                                                    Значение
                                                                </th>
                                                                <th className="text-left px-3 py-1.5 font-medium text-gray-600 text-[10px]">
                                                                    Состояние
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {entity && [...entity.attributes.values()].map(attr => {
                                                                const state = result.fields[attr.id];
                                                                if (!state) return null;
                                                                return (
                                                                    <tr key={attr.id} className="border-b border-gray-100 last:border-0">
                                                                        <td className="px-3 py-1.5">
                                                                            <div className="text-[11px] text-gray-800">
                                                                                {attr.name ?? attr.id}
                                                                            </div>
                                                                            <code className="text-[9px] text-gray-400">
                                                                                {attr.id}
                                                                            </code>
                                                                        </td>
                                                                        <td className="px-3 py-1.5">
                                                                            <div className="font-mono text-[10px] text-gray-700 truncate max-w-[160px]">
                                                                                {state.value === null || state.value === undefined
                                                                                    ? <span className="italic text-gray-400">null</span>
                                                                                    : typeof state.value === 'object'
                                                                                        ? JSON.stringify(state.value)
                                                                                        : String(state.value)}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-3 py-1.5">
                                                                            <StateBadges state={state} />
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            <div className="p-3 pt-0">
                                                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                                                    Сработавшие правила
                                                </div>
                                                <div className="space-y-1">
                                                    {result.rules.filter(r => r.applies).map(r => (
                                                        <div
                                                            key={r.ruleId}
                                                            className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-[10px]"
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-emerald-700">✓</span>
                                                                <code className="font-mono text-gray-800">
                                                                    {r.ruleId}
                                                                </code>
                                                                {r.effect && (
                                                                    <span className="text-[9px] px-1 rounded bg-purple-100 text-purple-700">
                                                                        {r.effect}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {r.conditionDescription && (
                                                                <div className="text-gray-600 ml-4 mt-0.5">
                                                                    Если: {r.conditionDescription}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {result.rules.filter(r => r.applies).length === 0 && (
                                                        <div className="text-[11px] text-gray-400 italic">
                                                            Правила не сработали
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// =========================================================================

function makeStep(
    name: string,
    objectJson: string,
    user: { username: string; roles: string[] },
    date: string,
    ruleIds: string[],
    linkages: Record<string, Record<string, any>>,
): PlaybookStep {
    return {
        id: `s_${Date.now().toString(36)}`,
        name,
        objectJson,
        username: user.username,
        roles: user.roles,
        currentDate: date,
        selectedRuleIds: [...ruleIds],
        linkages: { ...linkages },
    };
}

function formatDateShort(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    } catch {
        return iso;
    }
}

function formatDateFull(iso: string): string {
    try {
        return new Date(iso).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function StepDiffBanner({
    current,
    previous,
    entity,
    table,
    domain,
}: {
    current: PlaybookStep;
    previous: PlaybookStep;
    entity: ResolvedEntity | undefined;
    table: SymbolTable | null;
    domain: DomainSchema | undefined;
}) {
    const [expanded, setExpanded] = useState(false);

    const diffs = useMemo(() => {
        if (!entity || !table || !domain) return [];
        return collectStepDiffs(previous, current, entity, table, domain);
    }, [current, previous, entity, table, domain]);

    if (diffs.length === 0) {
        return (
            <div className="px-4 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] text-gray-500">
                Изменений от шага «{previous.name}» нет
            </div>
        );
    }

    // Показываем первые 2, остальные за "показать все"
    const visible = expanded ? diffs : diffs.slice(0, 2);
    const hasMore = diffs.length > 2 && !expanded;

    return (
        <div className="bg-blue-50 border-b border-blue-200">
            <button
                onClick={() => setExpanded(s => !s)}
                className="w-full flex items-center gap-2 px-4 py-1.5 text-left"
            >
                <span className="text-[10px] uppercase tracking-wide text-blue-700 font-medium">
                    Изменения от «{previous.name}» ({diffs.length})
                </span>
                <span className="text-blue-600 text-[10px] ml-auto">
                    {expanded ? 'свернуть' : 'подробнее'}
                </span>
            </button>
            <div className="px-4 pb-2 space-y-0.5">
                {visible.map((d, i) => (
                    <div key={i} className="text-[11px] text-blue-900 leading-snug">
                        • {d}
                    </div>
                ))}
                {hasMore && (
                    <div className="text-[10px] text-blue-600 italic">
                        и ещё {diffs.length - 2}...
                    </div>
                )}
            </div>
        </div>
    );
}

