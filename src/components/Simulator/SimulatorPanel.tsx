import { useMemo, useState, useEffect, type JSX } from 'react';
import Editor from '@monaco-editor/react';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { generateFakeObject } from '../../simulator/generate';
import { simulateRules, type FieldState } from '../../simulator/simulate';
import { showToast } from '../Toast';
import { IconRefresh, IconCheck, IconSparkles } from '../icons';
import { StateBadges } from './StateBadge';
import { ValueHints } from './ValueHints';
import { LeftTabs } from './LeftTabs';
import { ScenarioBar } from './ScenarioBar';
import { useSimulatorScenariosStore } from '../../store/useSimulatorScenariosStore';
import { LinkagesEditor } from './LinkagesEditor';
import { CompareScenariosModal } from './CompareScenariosModal';
import { PlaybookModal } from './PlaybookModal';
import { useSimulatorPlaybooksStore } from '../../store/useSimulatorPlaybooksStore';
import { ScenarioDropdown } from './ScenarioDropdown';
import { ContextPopover } from './ContextPopover';
import { ActionsMenu } from './ActionsMenu';

export function SimulatorPanel() {
    const table = useSchemaStore(s => s.symbolTable);
    const domainId = useSchemaStore(s => s.activeDomainId ?? '');
    const domains = useSchemaStore(s => s.domains);
    const context = useEditorStore(s => s.context);

    const objectJson = useSimulatorStore(s => s.objectJson);
    const setObjectJson = useSimulatorStore(s => s.setObjectJson);
    const currentUser = useSimulatorStore(s => s.currentUser);
    const currentDate = useSimulatorStore(s => s.currentDate);
    const setCurrentUser = useSimulatorStore(s => s.setCurrentUser);
    const setCurrentDate = useSimulatorStore(s => s.setCurrentDate);
    const selectedRuleIds = useSimulatorStore(s => s.selectedRuleIds);
    const toggleRule = useSimulatorStore(s => s.toggleRule);
    const selectAllRules = useSimulatorStore(s => s.selectAllRules);
    const [showCompare, setShowCompare] = useState(false);
    const scenariosCount = useSimulatorScenariosStore(s => s.scenarios.length);
    const [showPlaybook, setShowPlaybook] = useState(false);

    const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';
    const entity = entityFqid && table ? table.entities.get(entityFqid) : undefined;
    const domain = domains.find(d => d.id === domainId);

    const [parseError, setParseError] = useState<string | null>(null);

    // Парсим JSON
    const obj = useMemo(() => {
        try {
            return JSON.parse(objectJson || '{}');
        } catch {
            return null;
        }
    }, [objectJson]);

    useEffect(() => {
        try {
            JSON.parse(objectJson || '{}');
            setParseError(null);
        } catch (e: any) {
            setParseError(e.message ?? 'Ошибка разбора JSON');
        }
    }, [objectJson]);

    // Список правил для сущности
    const applicableRules = useMemo(() => {
        if (!domain || !entity) return [];
        return (domain.dataRules ?? []).filter(r => {
            if (!r.entity) return true;
            const slash = r.entity.indexOf('/');
            const id = slash === -1 ? r.entity : r.entity.slice(slash + 1);
            return id === entity.entity.id;
        });
    }, [domain, entity]);

    const insertValue = (attrId: string, value: any) => {
        try {
            const obj = JSON.parse(objectJson || '{}');
            obj[attrId] = value;
            setObjectJson(JSON.stringify(obj, null, 2));
        } catch {
            // Если JSON невалидный — просто заменяем весь объект
            setObjectJson(JSON.stringify({ [attrId]: value }, null, 2));
        }
    };

    const getValue = (attrId: string): any => {
        try {
            const obj = JSON.parse(objectJson || '{}');
            return obj[attrId];
        } catch {
            return undefined;
        }
    };

    const leftTab = useSimulatorStore(s => s.leftTab);
    const setLeftTab = useSimulatorStore(s => s.setLeftTab);
    const hintsCollapsed = useSimulatorStore(s => s.hintsCollapsed);
    const toggleHints = useSimulatorStore(s => s.toggleHints);
    const clearRules = useSimulatorStore(s => s.clearRules);
    const linkages = useSimulatorStore(s => s.linkages);
    const linkagesSetCount = Object.values(linkages).filter(v => Object.keys(v).length > 0).length;

    // Автовыбор всех правил при первом открытии
    useEffect(() => {
        if (applicableRules.length > 0 && selectedRuleIds.length === 0) {
            selectAllRules(applicableRules.map(r => r.id));
        }
    }, [applicableRules, selectedRuleIds.length, selectAllRules]);

    // Симуляция
    const result = useMemo(() => {
        if (!obj || !entity || !table || !domain) return null;

        const rulesToRun = applicableRules.filter(r => selectedRuleIds.includes(r.id));

        return simulateRules({
            obj,
            rules: rulesToRun,
            entity,
            table,
            domain,
            currentUser,
            currentDate: new Date(currentDate),
            linkages,
        });
    }, [obj, entity, table, domain, applicableRules, selectedRuleIds, currentUser, currentDate, linkages]);

    const generateFake = () => {
        if (!entity || !table) return;
        const fake = generateFakeObject(entity, table);
        setObjectJson(JSON.stringify(fake, null, 2));
        showToast('Сгенерирован пример объекта');
    };

    const clearObject = () => {
        setObjectJson('{\n  \n}');
    };

    useEffect(() => {
        const scenarios = useSimulatorScenariosStore.getState().scenarios;
        const activeId = useSimulatorScenariosStore.getState().activeScenarioId;
        if (!activeId) return;
        const s = scenarios.find(x => x.id === activeId);
        if (!s) return;

        // Применяем только если JSON пустой — чтобы не затирать работу пользователя
        const obj = useSimulatorStore.getState().objectJson;
        if (obj === '{\n  \n}' || obj === '{}') {
            setObjectJson(s.objectJson);
            setCurrentUser({ username: s.username, roles: s.roles });
            setCurrentDate(s.currentDate);
            selectAllRules(s.selectedRuleIds);
        }
    }, []);

    if (!entity || !table || !domain) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Выберите сущность в шапке, чтобы открыть симулятор
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col h-full min-h-0">
                {/* Тулбар */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
                    <ScenarioDropdown />

                    <div className="border-l border-gray-200 h-5" />

                    <ContextPopover />

                    <ActionsMenu
                        onCompare={() => setShowCompare(true)}
                        onPlaybook={() => setShowPlaybook(true)}
                    />

                    <div className="ml-auto text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                        Правил: {applicableRules.length}
                        {selectedRuleIds.length > 0 && (
                            <span className="text-gray-400 ml-1">
                                (выбрано {selectedRuleIds.length})
                            </span>
                        )}
                    </div>
                </div>

                {/* Основное: две колонки */}
                <div className="flex-1 flex min-h-0">
                    {/* Левая: JSON + правила */}
                    <div className="w-96 border-r border-gray-200 flex flex-col min-h-0 shrink-0">
                        <LeftTabs
                            active={leftTab}
                            onChange={setLeftTab}
                            rulesCount={applicableRules.length}
                            selectedCount={selectedRuleIds.length}
                            linkagesSet={linkagesSetCount}
                        />

                        {leftTab === 'data' && (
                            <>
                                {/* JSON — как было */}
                                <div className="flex-1 min-h-[200px] flex flex-col">
                                    <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                                        JSON объекта
                                    </div>
                                    <div className="flex-1 min-h-0">
                                        <Editor
                                            height="100%"
                                            defaultLanguage="json"
                                            value={objectJson}
                                            onChange={v => setObjectJson(v ?? '{}')}
                                            options={{
                                                fontSize: 12,
                                                minimap: { enabled: false },
                                                lineNumbers: 'off',
                                                wordWrap: 'on',
                                                scrollBeyondLastLine: false,
                                                tabSize: 2,
                                            }}
                                        />
                                    </div>
                                </div>

                                {parseError && (
                                    <div className="px-3 py-1.5 bg-red-50 border-t border-red-200 text-[11px] text-red-700">
                                        ⛔ {parseError}
                                    </div>
                                )}

                                {/* Подсказки — как было */}
                                <div className="border-t border-gray-200 shrink-0">
                                    <button
                                        onClick={toggleHints}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-[10px] uppercase tracking-wide text-gray-500 font-medium transition-colors"
                                    >
                                        <span className="text-gray-400">{hintsCollapsed ? '▸' : '▾'}</span>
                                        Подсказки по значениям
                                    </button>
                                    {!hintsCollapsed && (
                                        <div className="h-56 overflow-auto bg-gray-50 border-t border-gray-100">
                                            <ValueHints
                                                entity={entity}
                                                table={table}
                                                domain={domainId}
                                                getValue={getValue}
                                                onInsert={insertValue}
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {leftTab === 'linkages' && (
                            <div className="flex-1 overflow-auto">
                                <LinkagesEditor entityFqid={entityFqid} />
                            </div>
                        )}

                        {leftTab === 'rules' && (
                            <>
                                {/* Заголовок с кнопками «Все» / «Ничего» */}
                                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                                    <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                                        Правила сущности
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => selectAllRules(applicableRules.map(r => r.id))}
                                            className="text-[10px] text-blue-600 hover:text-blue-800"
                                        >
                                            Все
                                        </button>
                                        <span className="text-gray-300">·</span>
                                        <button
                                            onClick={clearRules}
                                            className="text-[10px] text-blue-600 hover:text-blue-800"
                                        >
                                            Ничего
                                        </button>
                                    </div>
                                </div>

                                {/* Список правил */}
                                <div className="flex-1 overflow-auto">
                                    {applicableRules.length === 0 ? (
                                        <div className="p-4 text-xs text-gray-400 italic">
                                            У этой сущности нет правил данных
                                        </div>
                                    ) : (
                                        applicableRules.map(rule => {
                                            const checked = selectedRuleIds.includes(rule.id);
                                            const application = result?.rules.find(r => r.ruleId === rule.id);
                                            const applies = application?.applies === true;

                                            return (
                                                <div
                                                    key={rule.id}
                                                    className={`border-b border-gray-100 ${applies ? 'bg-emerald-50/40' : ''
                                                        }`}
                                                >
                                                    <label className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleRule(rule.id)}
                                                            className="mt-0.5"
                                                        />

                                                        <div className="flex-1 min-w-0">
                                                            {/* ID + бейдж эффекта + статус */}
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <code className="text-[10px] font-mono text-blue-800 truncate">
                                                                    {rule.id}
                                                                </code>
                                                                {rule.rule?.effect && (
                                                                    <span className="text-[9px] px-1 rounded bg-purple-100 text-purple-700">
                                                                        {rule.rule.effect}
                                                                    </span>
                                                                )}
                                                                {checked && application && (
                                                                    <span
                                                                        className={`text-[9px] px-1 rounded ${applies
                                                                            ? 'bg-emerald-100 text-emerald-700'
                                                                            : 'bg-gray-100 text-gray-500'
                                                                            }`}
                                                                    >
                                                                        {applies ? 'сработало' : 'не сработало'}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Название */}
                                                            {rule.name && (
                                                                <div className="text-[11px] text-gray-700 mt-0.5">
                                                                    {rule.name}
                                                                </div>
                                                            )}

                                                            {/* Описание условия и эффекта */}
                                                            {application?.conditionDescription && (
                                                                <div className="mt-1 space-y-0.5 text-[10px] leading-snug">
                                                                    <div className="flex gap-1">
                                                                        <span className="text-gray-400 shrink-0">Если:</span>
                                                                        <span
                                                                            className={
                                                                                applies
                                                                                    ? 'text-emerald-800 font-medium'
                                                                                    : 'text-gray-600'
                                                                            }
                                                                        >
                                                                            {application.conditionDescription}
                                                                        </span>
                                                                    </div>
                                                                    {application.effectDescription && (
                                                                        <div className="flex gap-1">
                                                                            <span className="text-gray-400 shrink-0">То:</span>
                                                                            <span className="text-gray-600">
                                                                                {application.effectDescription}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Ошибка парсинга условия */}
                                                            {application?.descriptionError && (
                                                                <div className="mt-1 text-[10px] text-red-600">
                                                                    ⛔ {application.descriptionError}
                                                                </div>
                                                            )}

                                                            {/* Сообщение правила */}
                                                            {applies && rule.message && (
                                                                <div className="mt-1 text-[10px] text-amber-700 italic">
                                                                    Сообщение: {rule.message}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </label>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Правая: результат */}
                    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
                        <div className="flex-1 overflow-auto">
                            {!result ? (
                                <div className="p-6 text-xs text-gray-400 text-center">
                                    Введите корректный JSON объекта
                                </div>
                            ) : (
                                <>
                                    {/* Конфликты */}
                                    {result.conflicts.length > 0 && (
                                        <div className="bg-red-50 border-b border-red-200 p-3">
                                            <div className="text-[11px] font-medium text-red-800 mb-1">
                                                Конфликты ({result.conflicts.length})
                                            </div>
                                            {result.conflicts.map((c, i) => (
                                                <div key={i} className="text-xs text-red-700">
                                                    ⛔ Атрибут <code>{c.attributeId}</code>: {c.description}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Поля */}
                                    <div className="p-3">
                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                                            Состояние атрибутов
                                        </div>
                                        <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-sm bg-red-400"></span>
                                                Обязательное
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-sm bg-amber-400"></span>
                                                Только чтение
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-sm bg-gray-300"></span>
                                                Скрыто
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-sm bg-purple-500"></span>
                                                Конфликт
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-sm bg-red-600"></span>
                                                Ошибка
                                            </span>
                                        </div>
                                        <div className="bg-white rounded border border-gray-200 overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50 border-b border-gray-200">
                                                    <tr>
                                                        <th className="w-1 p-0"></th>
                                                        <th className="text-left px-3 py-2 font-medium text-[11px] uppercase tracking-wide text-gray-500">
                                                            Атрибут
                                                        </th>
                                                        <th className="text-left px-3 py-2 font-medium text-[11px] uppercase tracking-wide text-gray-500">
                                                            Значение
                                                        </th>
                                                        <th className="text-left px-3 py-2 font-medium text-[11px] uppercase tracking-wide text-gray-500">
                                                            Состояние
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortFieldsForDisplay(
                                                        [...entity.attributes.values()].map(attr => ({
                                                            attr,
                                                            state: result.fields[attr.id],
                                                            rules: result.rules.filter(
                                                                r => r.applies && r.attributes.includes(attr.id),
                                                            ),
                                                        })),
                                                    ).map(({ attr, state, rules }) => {
                                                        if (!state) return null;
                                                        const accent = rowAccent(state);

                                                        return (
                                                            <tr
                                                                key={attr.id}
                                                                className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition-colors"
                                                            >
                                                                {/* Полоса слева */}
                                                                <td className="w-1 p-0 relative">
                                                                    <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
                                                                </td>

                                                                {/* Атрибут */}
                                                                <td className="px-3 py-2">
                                                                    <div
                                                                        className={`text-xs font-medium ${state.visible ? 'text-gray-900' : 'text-gray-400 line-through'
                                                                            }`}
                                                                    >
                                                                        {attr.name ?? attr.id}
                                                                        {state.required && (
                                                                            <span className="text-red-500 ml-1">*</span>
                                                                        )}
                                                                    </div>
                                                                    <code className="text-[10px] text-gray-400">{attr.id}</code>
                                                                </td>

                                                                {/* Значение */}
                                                                <td className="px-3 py-2 align-top">
                                                                    {renderValue(state)}
                                                                    {state.validationError && (
                                                                        <div className="text-[10px] text-red-600 mt-1 flex items-start gap-1">
                                                                            <span>⛔</span>
                                                                            <span>{state.validationError}</span>
                                                                        </div>
                                                                    )}
                                                                    {state.defaultValue !== undefined && (
                                                                        <div className="text-[10px] text-blue-600 mt-0.5 italic">
                                                                            значение по умолчанию
                                                                        </div>
                                                                    )}
                                                                </td>

                                                                {/* Состояние */}
                                                                <td className="px-3 py-2 align-top">
                                                                    <StateBadges state={state} />
                                                                    {rules.length > 0 && (
                                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                                            {rules.map(r => (
                                                                                <div
                                                                                    key={r.ruleId}
                                                                                    title={
                                                                                        (r.conditionDescription ? `Если: ${r.conditionDescription}\n` : '') +
                                                                                        (r.effectDescription ?? '') +
                                                                                        (r.message ? `\n\n${r.message}` : '')
                                                                                    }
                                                                                    className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-100 cursor-help leading-tight"
                                                                                >
                                                                                    <div className="font-medium">{effectVerbShort(r.effect)}</div>
                                                                                    <div className="text-[8px] text-purple-600 opacity-70 truncate">
                                                                                        {r.ruleId}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Правила */}
                                    <div className="p-3 pt-0">
                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-2">
                                            Применённые правила
                                        </div>
                                        <div className="space-y-1">
                                            {result.rules.map(r => (
                                                <div
                                                    key={r.ruleId}
                                                    className={`rounded border px-3 py-2 text-xs ${r.applies
                                                        ? 'bg-emerald-50 border-emerald-200'
                                                        : 'bg-white border-gray-200'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span>{r.applies ? '✓' : '✗'}</span>
                                                        <code className="font-mono text-[11px] text-gray-800">
                                                            {r.ruleId}
                                                        </code>
                                                        {r.effect && (
                                                            <span className="text-[10px] px-1 rounded bg-purple-100 text-purple-700">
                                                                {r.effect}
                                                            </span>
                                                        )}
                                                        {r.applies && r.attributes.length > 0 && (
                                                            <span className="text-[10px] text-gray-500">
                                                                → {r.attributes.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {r.reason && !r.applies && (
                                                        <div className="text-[10px] text-gray-500 mt-1 ml-5">
                                                            {r.reason}
                                                        </div>
                                                    )}
                                                    {r.message && r.applies && (
                                                        <div className="text-[10px] text-gray-500 mt-1 ml-5">
                                                            {r.message}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {result.rules.length === 0 && (
                                                <div className="text-xs text-gray-400 italic">
                                                    Не выбрано ни одного правила
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {showCompare && <CompareScenariosModal onClose={() => setShowCompare(false)} />}
            {showPlaybook && <PlaybookModal onClose={() => setShowPlaybook(false)} />}
        </>
    );
}

// =========================================================================

function renderValue(state: FieldState): JSX.Element {
    const v = state.value;
    if (v === null || v === undefined) {
        return <span className="text-gray-400 italic">null</span>;
    }
    if (typeof v === 'boolean') {
        return <span>{v ? 'true' : 'false'}</span>;
    }
    if (Array.isArray(v)) {
        return (
            <span className="font-mono text-[11px]">
                [{v.length} {v.length === 1 ? 'элемент' : 'элементов'}]
            </span>
        );
    }
    return (
        <span className="font-mono text-[11px] text-gray-700 truncate" title={String(v)}>
            {String(v)}
        </span>
    );
}

function rowAccent(state: FieldState): string {
    if (state.validationError) return 'bg-red-500';
    if (!state.visible && state.required) return 'bg-purple-500';
    if (state.required) return 'bg-red-400';
    if (!state.visible) return 'bg-gray-300';
    if (state.readonly) return 'bg-amber-400';
    return 'bg-transparent';
}

/**
 * Сортировка строк таблицы: сначала проблемные (ошибки, required,
 * скрытые), потом обычные. Внутри группы — по алфавиту.
 */
function sortFieldsForDisplay<
    T extends { attr: { id: string; name?: string }; state: FieldState | undefined },
>(rows: T[]): T[] {
    const weight = (state: FieldState | undefined): number => {
        if (!state) return 99;
        if (state.validationError) return 0;
        if (!state.visible && state.required) return 1;
        if (state.required) return 2;
        if (!state.visible) return 3;
        if (state.readonly) return 4;
        return 5;
    };

    return [...rows].sort((a, b) => {
        const wa = weight(a.state);
        const wb = weight(b.state);
        if (wa !== wb) return wa - wb;
        const nameA = (a.attr.name ?? a.attr.id).toLowerCase();
        const nameB = (b.attr.name ?? b.attr.id).toLowerCase();
        return nameA.localeCompare(nameB);
    });
}

function effectVerbShort(effect: string | null | undefined): string {
    switch (effect) {
        case 'required': return 'обязательное';
        case 'hidden': return 'скрыто';
        case 'readonly': return 'только чтение';
        case 'default': return 'по умолчанию';
        case 'allowed': return 'ограничено';
        default: return '—';
    }
}