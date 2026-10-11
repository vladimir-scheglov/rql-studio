import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { usePathBuilderStore } from '../../store/usePathBuilderStore';
import { useConstructorStore } from '../../store/useConstructorStore';
import { getAvailableTransitions } from '../../path-builder/transitions';
import { buildPathRql } from '../../path-builder/build-rql';
import { buildPathYaml } from '../../path-builder/build-yaml';
import type {
    PathModel,
    PathStep,
    AvailableTransition,
} from '../../path-builder/types';
import type {
    ConditionNode,
    GroupNode,
    PathNode,
} from '../../constructor/types';
import type { DataRuleEffect } from '../../constructor/export-yaml';
import { showToast } from '../Toast';
import {
    IconX,
    IconCopy,
    IconDownload,
    IconPlus,
    IconCheck,
} from '../icons';

interface Props {
    onClose: () => void;
}

export function PathBuilderModal({ onClose }: Props) {
    // =========================================================================
    // 1. Все подписки на store — сначала
    // =========================================================================

    const domains = useSchemaStore(s => s.domains);
    const table = useSchemaStore(s => s.symbolTable);
    const activeDomainId = useSchemaStore(s => s.activeDomainId ?? '');
    const context = useEditorStore(s => s.context);

    const initialEntityFqid = usePathBuilderStore(s => s.startEntityFqid)
        ?? ('entityFqid' in context ? context.entityFqid ?? '' : '');

    const editingNodeIdRaw = usePathBuilderStore(s => s.editingNodeId);

    // Проверяем, что узел с таким id реально есть в дереве.
    // Если нет — значит, мы в режиме создания, а не редактирования.
    const editingNodeId = useMemo(() => {
        if (!editingNodeIdRaw) return null;
        const node = findPathNode(
            useConstructorStore.getState().root,
            editingNodeIdRaw,
        );
        return node ? editingNodeIdRaw : null;
    }, [editingNodeIdRaw]);

    // =========================================================================
    // 2. Состояние
    // =========================================================================

    const [startEntityFqid, setStartEntityFqid] = useState(() => {
        if (editingNodeId) {
            const node = findPathNode(
                useConstructorStore.getState().root,
                editingNodeId,
            );
            return node?.path.startEntityFqid ?? '';
        }
        return initialEntityFqid;
    });

    const [steps, setSteps] = useState<PathStep[]>(() => {
        if (editingNodeId) {
            const node = findPathNode(
                useConstructorStore.getState().root,
                editingNodeId,
            );
            return node?.path.steps ?? [];
        }
        return [];
    });

    const [effect, setEffect] = useState<DataRuleEffect>('allowed');
    const [ruleId, setRuleId] = useState(
        () => `dr_${Date.now().toString(36).slice(-6)}`,
    );
    const [ruleName, setRuleName] = useState('');
    const [message, setMessage] = useState('Выбрано недопустимое значение');
    const [condition, setCondition] = useState('');
    const [activeTab, setActiveTab] = useState<'rql' | 'yaml'>('rql');

    // =========================================================================
    // 3. Производные значения
    // =========================================================================

    const allEntities = useMemo(() => {
        if (!table) return [];
        return [...table.entities.values()].sort((a, b) =>
            (a.entity.name ?? a.entity.id).localeCompare(b.entity.name ?? b.entity.id),
        );
    }, [table]);

    const currentEntityFqid =
        steps.length > 0 ? steps[steps.length - 1].toEntityFqid : startEntityFqid;

    const currentEntity =
        currentEntityFqid && table ? table.entities.get(currentEntityFqid) : undefined;

    const transitions = useMemo(() => {
        if (!currentEntityFqid || !table) return [];
        return getAvailableTransitions(currentEntityFqid, table);
    }, [currentEntityFqid, table]);

    const path: PathModel = { startEntityFqid, steps };

    const rqlResult = useMemo(() => {
        if (!table || !activeDomainId || steps.length === 0) {
            return { rql: '', error: undefined };
        }
        return buildPathRql(path, table, activeDomainId);
    }, [path, table, activeDomainId, steps.length]);

    const yamlResult = useMemo(() => {
        if (!table || !activeDomainId || !currentEntityFqid) {
            return { yaml: '', error: undefined };
        }
        const entityId = startEntityFqid.split('/')[1] ?? startEntityFqid;
        return buildPathYaml(path, table, activeDomainId, {
            id: ruleId,
            name: ruleName || undefined,
            entityId,
            effect,
            message: message || undefined,
            condition: condition || undefined,
        });
    }, [
        path,
        table,
        activeDomainId,
        ruleId,
        ruleName,
        effect,
        message,
        condition,
        startEntityFqid,
        currentEntityFqid,
    ]);

    // =========================================================================
    // 4. Эффекты
    // =========================================================================

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // =========================================================================
    // 5. Обработчики
    // =========================================================================

    const changeStart = (fqid: string) => {
        if (editingNodeId && steps.length > 0) {
            const confirmed = window.confirm(
                'Смена стартовой сущности сбросит все шаги пути. Продолжить?',
            );
            if (!confirmed) return;
        }
        setStartEntityFqid(fqid);
        setSteps([]);
    };

    const addStep = (transition: AvailableTransition) => {
        if (!currentEntityFqid) return;
        const newStep = makeStep(transition, currentEntityFqid);
        if (newStep) setSteps(prev => [...prev, newStep]);
    };

    const removeStepFrom = (index: number) => {
        setSteps(prev => prev.slice(0, index));
    };

    const changeStepAt = (index: number, transition: AvailableTransition) => {
        const before = steps.slice(0, index);
        const fromEntityFqid =
            index === 0 ? startEntityFqid : before[before.length - 1].toEntityFqid;
        const newStep = makeStep(transition, fromEntityFqid);
        if (newStep) setSteps([...before, newStep]);
    };

    const copyYaml = async () => {
        if (!yamlResult.yaml) return;
        try {
            await navigator.clipboard.writeText(yamlResult.yaml);
            showToast('YAML скопирован');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = yamlResult.yaml;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('YAML скопирован');
        }
    };

    const downloadYaml = () => {
        if (!yamlResult.yaml) return;
        const blob = new Blob([yamlResult.yaml], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ruleId}.yaml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Файл сохранён');
    };

    const applyRql = () => {
        if (!rqlResult.rql) return;
        useEditorStore.getState().setValue(`!rql ${rqlResult.rql}`);
        useEditorStore.getState().setActiveTab('code');
        showToast('RQL вставлен в редактор');
        onClose();
    };

    const applyToNode = () => {
        if (!editingNodeId || !table || !activeDomainId) return;

        const { rql, error } = buildPathRql(path, table, activeDomainId);
        if (error) {
            showToast('Не удалось сгенерировать RQL: ' + error);
            return;
        }

        const root = useConstructorStore.getState().root;
        const updated = updatePathNode(root, editingNodeId, {
            path,
            cachedRql: rql,
        });

        useConstructorStore.getState().setRoot(updated);
        showToast('Путь сохранён в конструктор');
        onClose();
    };

    // =========================================================================
    // 6. Рендер: fallback
    // =========================================================================

    if (!table || !activeDomainId) {
        return createPortal(
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={onClose}
            >
                <div
                    className="bg-white rounded-lg shadow-xl p-6 max-w-md"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="text-sm text-gray-700 mb-4">
                        Загрузите схему, чтобы построить путь.
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

    const targetEntity = currentEntityFqid
        ? table.entities.get(currentEntityFqid)
        : null;

    // =========================================================================
    // 7. Рендер
    // =========================================================================

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-[1180px] max-w-[95vw] h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 shrink-0">
                    <div>
                        <h2 className="font-medium text-gray-900">
                            {editingNodeId ? 'Редактирование пути связей' : 'Построитель пути связей'}
                        </h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Кликами соберите цепочку переходов — RQL сгенерируется автоматически
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                <div className="flex-1 flex min-h-0">
                    {/* Левая колонка */}
                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                        {/* Стартовая сущность */}
                        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
                            <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1">
                                Правило для сущности
                            </label>
                            <select
                                value={startEntityFqid}
                                onChange={e => changeStart(e.target.value)}
                                className="w-full max-w-md text-xs px-2 py-1.5 border border-gray-300 rounded focus:border-blue-400 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="">— выберите —</option>
                                {allEntities.map(e => (
                                    <option key={e.fqid} value={e.fqid}>
                                        {e.entity.name ?? e.entity.id} ({e.fqid})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Путь */}
                        <div className="flex-1 overflow-auto px-5 py-4">
                            {!startEntityFqid ? (
                                <div className="text-center text-sm text-gray-400 py-12">
                                    Выберите стартовую сущность
                                </div>
                            ) : (
                                <>
                                    {/* Крошки пути */}
                                    <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
                                        <Chip label={shortName(startEntityFqid, table)} tone="start" />
                                        {steps.map((step, i) => (
                                            <div key={step.id} className="flex items-center gap-2">
                                                <span className="text-gray-300">→</span>
                                                <button
                                                    onClick={() => removeStepFrom(i)}
                                                    title="Обрезать путь до этого шага"
                                                    className="group/chip"
                                                >
                                                    <Chip
                                                        label={stepLabel(step, table)}
                                                        tone="step"
                                                    />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Доступные переходы */}
                                    {currentEntity && (
                                        <div>
                                            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                                                Переходы из «
                                                {currentEntity.entity.name ?? currentEntity.entity.id}»
                                            </div>

                                            {transitions.length === 0 ? (
                                                <div className="text-xs text-gray-400 italic">
                                                    Нет доступных переходов. Это конечная сущность пути.
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    {transitions.map((t, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => addStep(t)}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs bg-white border border-gray-200 rounded hover:border-blue-300 hover:bg-blue-50 transition-colors group/trans"
                                                        >
                                                            <span
                                                                className={`w-4 h-4 flex items-center justify-center rounded text-[10px] shrink-0 ${t.kind === 'linkage'
                                                                        ? 'bg-purple-100 text-purple-700'
                                                                        : 'bg-blue-100 text-blue-700'
                                                                    }`}
                                                            >
                                                                {t.kind === 'linkage' ? '🔗' : '→'}
                                                            </span>
                                                            <span className="flex-1 truncate text-gray-700">
                                                                {t.label}
                                                            </span>
                                                            <IconPlus className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover/trans:opacity-100" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Редактирование шагов */}
                                    {steps.length > 0 && (
                                        <div className="mt-6 pt-4 border-t border-gray-100">
                                            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                                                Шаги (можно изменить переход на каждом)
                                            </div>
                                            <div className="space-y-2">
                                                {steps.map((step, i) => (
                                                    <StepRow
                                                        key={step.id}
                                                        step={step}
                                                        index={i}
                                                        fromEntityFqid={
                                                            i === 0 ? startEntityFqid : steps[i - 1].toEntityFqid
                                                        }
                                                        table={table}
                                                        onChange={transition => changeStepAt(i, transition)}
                                                        onRemove={() => removeStepFrom(i)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Параметры YAML — только когда не редактируем узел */}
                        {!editingNodeId && (
                            <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 shrink-0">
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="block text-[10px] text-gray-500 mb-1">
                                            ID правила
                                        </span>
                                        <input
                                            type="text"
                                            value={ruleId}
                                            onChange={e => setRuleId(e.target.value)}
                                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="block text-[10px] text-gray-500 mb-1">
                                            Название
                                        </span>
                                        <input
                                            type="text"
                                            value={ruleName}
                                            onChange={e => setRuleName(e.target.value)}
                                            placeholder="Например: Доступные элементы шкалы"
                                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="block text-[10px] text-gray-500 mb-1">
                                            Эффект
                                        </span>
                                        <select
                                            value={effect}
                                            onChange={e => setEffect(e.target.value as DataRuleEffect)}
                                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                                        >
                                            <option value="allowed">allowed</option>
                                            <option value="required">required</option>
                                            <option value="hidden">hidden</option>
                                            <option value="readonly">readonly</option>
                                            <option value="default">default</option>
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="block text-[10px] text-gray-500 mb-1">
                                            Сообщение
                                        </span>
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={e => setMessage(e.target.value)}
                                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="block col-span-2">
                                        <span className="block text-[10px] text-gray-500 mb-1">
                                            Дополнительное условие (опционально)
                                        </span>
                                        <input
                                            type="text"
                                            value={condition}
                                            onChange={e => setCondition(e.target.value)}
                                            placeholder="Например: entityId = 'RequirementValues'"
                                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                                        />
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Правая колонка — превью */}
                    <div className="w-[520px] border-l border-gray-200 flex flex-col min-h-0 bg-gray-50 shrink-0">
                        <div className="flex border-b border-gray-200 bg-white shrink-0">
                            <button
                                onClick={() => setActiveTab('rql')}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'rql'
                                        ? 'text-gray-900 border-b-2 border-blue-500 -mb-px'
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                RQL
                            </button>
                            <button
                                onClick={() => setActiveTab('yaml')}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'yaml'
                                        ? 'text-gray-900 border-b-2 border-blue-500 -mb-px'
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                YAML
                            </button>
                        </div>

                        {(rqlResult.error || yamlResult.error) && (
                            <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
                                ⛔ {rqlResult.error ?? yamlResult.error}
                            </div>
                        )}

                        <div className="flex-1 min-h-0">
                            {activeTab === 'rql' ? (
                                rqlResult.rql ? (
                                    <Editor
                                        height="100%"
                                        defaultLanguage="rql"
                                        value={`!rql ${rqlResult.rql}`}
                                        options={{
                                            readOnly: true,
                                            fontSize: 12,
                                            minimap: { enabled: false },
                                            lineNumbers: 'off',
                                            wordWrap: 'on',
                                            scrollBeyondLastLine: false,
                                            tabSize: 2,
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-xs text-gray-400 p-8 text-center">
                                        Добавьте хотя бы один шаг, чтобы увидеть RQL
                                    </div>
                                )
                            ) : yamlResult.yaml ? (
                                <Editor
                                    height="100%"
                                    defaultLanguage="yaml"
                                    value={yamlResult.yaml}
                                    options={{
                                        readOnly: true,
                                        fontSize: 12,
                                        minimap: { enabled: false },
                                        lineNumbers: 'off',
                                        wordWrap: 'on',
                                        scrollBeyondLastLine: false,
                                        tabSize: 2,
                                    }}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs text-gray-400 p-8 text-center">
                                    YAML сгенерируется, когда путь будет полностью построен
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 shrink-0">
                    <div className="text-xs text-gray-500">
                        Шагов: {steps.length} · Сущностей в пути: {steps.length + 1}
                        {editingNodeId && (
                            <span className="ml-2 text-purple-700">
                                · редактируется узел в конструкторе
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={copyYaml}
                            disabled={!yamlResult.yaml}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                            <IconCopy className="w-3.5 h-3.5" />
                            Копировать YAML
                        </button>
                        <button
                            onClick={downloadYaml}
                            disabled={!yamlResult.yaml}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                            <IconDownload className="w-3.5 h-3.5" />
                            Скачать .yaml
                        </button>
                        {editingNodeId ? (
                            <button
                                onClick={applyToNode}
                                disabled={!rqlResult.rql}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                <IconCheck className="w-3.5 h-3.5" />
                                Сохранить в конструктор
                            </button>
                        ) : (
                            <button
                                onClick={applyRql}
                                disabled={!rqlResult.rql}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                <IconCheck className="w-3.5 h-3.5" />
                                Вставить RQL в редактор
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// =========================================================================
// Вспомогательные компоненты
// =========================================================================

function Chip({ label, tone }: { label: string; tone: 'start' | 'step' }) {
    const cls =
        tone === 'start'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : 'bg-white text-gray-700 border-gray-300 group-hover/chip:border-red-300 group-hover/chip:text-red-700';
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}
        >
            {label}
        </span>
    );
}

function StepRow({
    step,
    index,
    fromEntityFqid,
    table,
    onChange,
    onRemove,
}: {
    step: PathStep;
    index: number;
    fromEntityFqid: string;
    table: any;
    onChange: (t: AvailableTransition) => void;
    onRemove: () => void;
}) {
    const transitions = useMemo(
        () => getAvailableTransitions(fromEntityFqid, table),
        [fromEntityFqid, table],
    );

    const currentValue =
        step.kind === 'linkage'
            ? `linkage:${step.linkageFqid}:${step.fromSide}`
            : `reference:${step.attributeId}`;

    return (
        <div className="flex items-center gap-2">
            <span className="w-5 text-[10px] text-gray-400 tabular-nums text-right">
                {index + 1}.
            </span>
            <select
                value={currentValue}
                onChange={e => {
                    const value = e.target.value;
                    const t = transitions.find(x => {
                        const key =
                            x.kind === 'linkage'
                                ? `linkage:${x.linkage?.fqid}:${x.fromSide}`
                                : `reference:${x.attribute?.id}`;
                        return key === value;
                    });
                    if (t) onChange(t);
                }}
                className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
            >
                {transitions.map((t, i) => {
                    const key =
                        t.kind === 'linkage'
                            ? `linkage:${t.linkage?.fqid}:${t.fromSide}`
                            : `reference:${t.attribute?.id}`;
                    return (
                        <option key={i} value={key}>
                            {t.label}
                        </option>
                    );
                })}
            </select>
            <button
                onClick={onRemove}
                className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Удалить шаг и все следующие"
            >
                <IconX className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// =========================================================================
// Утилиты
// =========================================================================

function makeStep(
    transition: AvailableTransition,
    fromEntityFqid: string,
): PathStep | null {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

    if (transition.kind === 'linkage' && transition.linkage && transition.fromSide) {
        return {
            id,
            kind: 'linkage',
            linkageFqid: transition.linkage.fqid,
            fromSide: transition.fromSide,
            fromEntityFqid,
            toEntityFqid: transition.targetEntityFqid,
        };
    }

    if (transition.kind === 'reference' && transition.attribute) {
        return {
            id,
            kind: 'reference',
            attributeId: transition.attribute.id,
            fromEntityFqid,
            toEntityFqid: transition.targetEntityFqid,
        };
    }

    return null;
}

function shortName(fqid: string, table: any): string {
    const entity = table?.entities.get(fqid);
    return entity?.entity.name ?? entity?.entity.id ?? fqid;
}

function stepLabel(step: PathStep, table: any): string {
    if (step.kind === 'linkage') {
        const linkage = table?.linkages.get(step.linkageFqid);
        return linkage?.name ?? linkage?.id ?? step.linkageFqid;
    }
    return `через ${step.attributeId}`;
}

function findPathNode(root: ConditionNode, id: string): PathNode | null {
    if (root.kind === 'path' && root.id === id) return root;
    if (root.kind === 'group') {
        for (const child of root.children) {
            const found = findPathNode(child, id);
            if (found) return found;
        }
    }
    return null;
}

function updatePathNode(
    root: ConditionNode,
    nodeId: string,
    patch: Partial<PathNode>,
): GroupNode {
    function walk(node: ConditionNode): ConditionNode {
        if (node.kind === 'path' && node.id === nodeId) {
            return { ...node, ...patch };
        }
        if (node.kind === 'group') {
            return { ...node, children: node.children.map(walk) };
        }
        return node;
    }
    return walk(root) as GroupNode;
}