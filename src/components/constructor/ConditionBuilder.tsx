import { useMemo, useState, useRef, useEffect } from 'react';
import { useConstructorStore } from '../../store/useConstructorStore';
import { useConstructorUiStore } from '../../store/useConstructorUiStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useSchemaStore } from '../../store/useSchemaStore';
import { serializeCondition } from '../../constructor/serialize';
import { importFromRql } from '../../constructor/import';
import { describeCondition } from '../../constructor/describe';
import { collectGroupIds } from '../../constructor/tree-utils';
import { parseRql } from '../../rql/parser';
import { GroupEditor } from './GroupEditor';
import {
    IconArrowDown,
    IconArrowUp,
    IconCheck, IconCopy, IconDownload, IconGrid, IconHelp, IconMore,
    IconSave,
    IconSearch,
    IconX,
} from '../icons';
import { useConstructorHotkeys } from './useConstructorHotkeys';
import { IconUndo, IconRedo } from '../icons';
import { validateTree, countIssues } from '../../constructor/validate';
import { ExportYamlModal } from './ExportYamlModal';
import { RuleTemplatesModal } from './RuleTemplatesModal';
import { emptyGroup, emptyLeaf } from '../../constructor/types';
import { useCurrentRuleStore } from '../../store/useCurrentRuleStore';
import { findFileForDomain } from '../../schema/find-domain-file';
import { replaceRuleInYaml } from '../../schema/replace-rule';
import { showToast } from '../Toast';
import { ContextBar } from './ContextBar';


export function ConditionBuilder() {
    const root = useConstructorStore(s => s.root);
    const setRoot = useConstructorStore(s => s.setRoot);
    const setRootWithUndo = useConstructorStore(s => s.setRootWithUndo);
    const undo = useConstructorStore(s => s.undo);
    const redo = useConstructorStore(s => s.redo);
    const canUndo = useConstructorStore(s => s.past.length > 0);
    const canRedo = useConstructorStore(s => s.future.length > 0);
    const reset = useConstructorStore(s => s.reset);
    const domains = useSchemaStore(s => s.domains);

    const collapseAll = useConstructorUiStore(s => s.collapseAll);
    const expandAll = useConstructorUiStore(s => s.expandAll);

    const setValue = useEditorStore(s => s.setValue);
    const setActiveTab = useEditorStore(s => s.setActiveTab);
    const editorRql = useEditorStore(s => s.value);
    const context = useEditorStore(s => s.context);

    const table = useSchemaStore(s => s.symbolTable);
    const activeDomainId = useSchemaStore(s => s.activeDomainId);

    const [showExplanation, setShowExplanation] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const setIssues = useConstructorUiStore(s => s.setIssues);
    const issues = useConstructorUiStore(s => s.issues);
    const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';
    const [showExport, setShowExport] = useState(false);

    const usageSearchAttribute = useConstructorUiStore(s => s.usageSearchAttribute);
    const usageResults = useConstructorUiStore(s => s.usageResults);
    const usageActiveIndex = useConstructorUiStore(s => s.usageActiveIndex);
    const cycleUsage = useConstructorUiStore(s => s.cycleUsage);
    const clearUsageSearch = useConstructorUiStore(s => s.clearUsageSearch);
    const selectNode = useConstructorUiStore(s => s.selectTreeNode);
    const [showTemplates, setShowTemplates] = useState(false);

    const activeUsage =
        usageActiveIndex >= 0 ? usageResults[usageActiveIndex] : null;

    const setCurrentRule = useCurrentRuleStore(s => s.setCurrentRule);
    const currentRuleIsUnconditional = useCurrentRuleStore(
        s => s.isUnconditional,
    );

    const rawFiles = useSchemaStore(s => s.rawFiles);
    const loadFiles = useSchemaStore(s => s.loadFiles);
    const currentRuleId = useCurrentRuleStore(s => s.currentRuleId);
    const currentEffect = useCurrentRuleStore(s => s.currentEffect);
    const isUnconditional = useCurrentRuleStore(s => s.isUnconditional);
    const clearCurrentRule = useCurrentRuleStore(s => s.clearCurrentRule);

    const canSaveToSchema = !!currentRuleId && !!activeDomainId && !!table;
    const loadTemplates = () => {
        if (!table || !activeDomainId || !entityFqid) {
            showToast('Выберите сущность, чтобы открыть шаблоны');
            return;
        }
        setShowTemplates(true);
        setMenuOpen(false);
    };
    const saveToSchema = () => {
        if (!currentRuleId || !activeDomainId || !table) return;

        // 1. Собираем condition из дерева
        const conditionText = serializeCondition(root, table);
        const condition = conditionText.trim() || 'true';

        // 2. Находим файл домена
        const file = findFileForDomain(activeDomainId, rawFiles);
        if (!file) {
            alert('Не удалось найти файл домена. Возможно, он не загружен через UI.');
            return;
        }

        // 3. Собираем новое правило — берём метаданные из исходного
        const domain = domains.find(d => d.id === activeDomainId);
        const existingRule = domain?.dataRules?.find(r => r.id === currentRuleId);
        if (!existingRule) {
            alert('Правило не найдено в схеме');
            return;
        }

        const newRule = {
            ...existingRule,
            condition,
        };

        // 4. Заменяем в YAML
        const { yaml, found } = replaceRuleInYaml(file.content, currentRuleId, newRule);
        if (!found) {
            alert('Не удалось найти правило в YAML-файле');
            return;
        }

        // 5. Обновляем rawFiles → пересборка схемы
        const next = rawFiles.map(f =>
            f.name === file.name ? { ...f, content: yaml } : f,
        );
        loadFiles(next);
        useSchemaStore.getState().setActiveDomain(activeDomainId);
        showToast('Правило сохранено в схему');
    };

    useEffect(() => {
        if (activeUsage) {
            setActiveTab('code');
        }
    }, [activeUsage, setActiveTab]);

    useEffect(() => {
        if (!table || !activeDomainId) {
            setIssues(new Map());
            return;
        }
        const map = validateTree(root, table, activeDomainId, entityFqid);
        setIssues(map);
    }, [root, table, activeDomainId, entityFqid, setIssues]);

    const issueStats = useMemo(() => countIssues(issues), [issues]);

    useConstructorHotkeys();

    // Закрываем меню при клике вне
    useEffect(() => {
        if (!menuOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [menuOpen]);

    const rql = useMemo(
        () => (table ? serializeCondition(root, table) : ''),
        [root, table],
    );

    const prefixedRql = useMemo(() => {
        const trimmed = rql.trim();
        if (!trimmed) return '';
        return trimmed.startsWith('!rql') ? trimmed : `!rql ${trimmed}`;
    }, [rql]);

    const canApply = prefixedRql.length > 0;

    const hasUnsavedChanges = useMemo(() => {
        if (!canApply) return false;
        return prefixedRql !== editorRql.trim();
    }, [canApply, prefixedRql, editorRql]);

    const explanation = useMemo(
        () =>
            table && activeDomainId
                ? describeCondition(root, table, activeDomainId, entityFqid)
                : '',
        [root, table, activeDomainId, entityFqid],
    );

    const apply = () => {
        if (!canApply) return;
        setValue(prefixedRql);
        setActiveTab('code');
    };

    const copy = async () => {
        if (!canApply) return;
        try {
            await navigator.clipboard.writeText(prefixedRql);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = prefixedRql;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setMenuOpen(false);
    };

    const importFromCode = () => {
        if (!table || !activeDomainId) {
            alert('Схема не загружена.');
            return;
        }

        const text = editorRql.trim();
        if (!text) {
            alert('В редакторе нет текста.');
            return;
        }

        const { ast, parseErrors } = parseRql(text);
        if (!ast || parseErrors.length > 0) {
            const msg = parseErrors.map((e: any) => e.message ?? String(e)).join('\n');
            alert('Не удалось разобрать RQL:\n' + msg);
            return;
        }

        const { root: imported, errors } = importFromRql(
            ast, table, activeDomainId, entityFqid,
        );

        if (!imported) {
            const isChain = errors.some(e => e.includes('цепочку связей'));
            if (isChain) {
                alert(
                    'Это правило содержит цепочку связей — конструктор не умеет их редактировать.\n\n' +
                    'Что можно сделать:\n' +
                    '• Открыть «Построитель пути» и пересобрать цепочку,\n' +
                    '• Или отредактировать RQL вручную в редакторе кода.',
                );
            } else {
                alert('Импорт не удался:\n\n' + errors.join('\n'));
            }
            return;
        }

        if (errors.length > 0) {
            const proceed = window.confirm(
                'Импорт выполнен с предупреждениями:\n\n' +
                errors.join('\n') +
                '\n\nПродолжить и заменить дерево?',
            );
            if (!proceed) return;
        }

        setRootWithUndo(imported);
    };

    const onCollapseAll = () => {
        const ids = collectGroupIds(root);
        collapseAll(ids);
        setMenuOpen(false);
    };

    const onExpandAll = () => {
        expandAll();
        setMenuOpen(false);
    };

    const onUndo = () => {
        undo();
        setMenuOpen(false);
    };

    const onReset = () => {
        if (!window.confirm('Очистить все условия?')) return;
        reset();
        setMenuOpen(false);
    };

    const onToggleExplanation = () => {
        setShowExplanation(s => !s);
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            {/* Context bar — над тулбаром */}
            <ContextBar />

            {/* Тулбар действий */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
                {/* Группа 1: главные действия */}
                <button
                    onClick={apply}
                    disabled={!canApply}
                    title={!canApply ? 'Добавьте хотя бы одно условие' : 'Подставить RQL в редактор кода'}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    <IconCheck className="w-3.5 h-3.5" />
                    Применить
                </button>

                {canSaveToSchema && (
                    <button
                        onClick={saveToSchema}
                        title="Сохранить правило обратно в YAML схемы"
                        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 whitespace-nowrap"
                    >
                        <IconSave className="w-3.5 h-3.5" />
                        Сохранить
                    </button>
                )}

                <div className="border-l border-gray-200 h-6 mx-1" />

                {/* Группа 2: работа с кодом */}
                <button
                    onClick={importFromCode}
                    title="Разобрать RQL из редактора и заполнить конструктор"
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                >
                    <IconDownload className="w-3.5 h-3.5" />
                    Импорт
                </button>

                <div className="inline-flex rounded border border-gray-300 overflow-hidden">
                    <button
                        onClick={undo}
                        disabled={!canUndo}
                        title="Отменить (Ctrl+Z)"
                        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed border-r border-gray-300"
                    >
                        <IconUndo />
                    </button>
                    <button
                        onClick={redo}
                        disabled={!canRedo}
                        title="Повторить (Ctrl+Shift+Z)"
                        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                        <IconRedo />
                    </button>
                </div>

                <button
                    onClick={onToggleExplanation}
                    disabled={!canApply}
                    title={!canApply ? 'Добавьте хотя бы одно условие' : 'Показать объяснение на русском'}
                    className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border whitespace-nowrap ${showExplanation
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        } disabled:text-gray-400 disabled:cursor-not-allowed`}
                >
                    <IconHelp className="w-3.5 h-3.5" />
                    Объяснить
                </button>

                {/* Меню «⋯» */}
                <div className="ml-auto relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(v => !v)}
                        title="Дополнительные действия"
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                        <IconMore className="w-4 h-4" />
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] bg-white border border-gray-200 rounded shadow-lg py-1">
                            <MenuButton
                                onClick={copy}
                                disabled={!canApply}
                                icon={<IconCopy className="w-3.5 h-3.5" />}
                            >
                                Копировать RQL
                            </MenuButton>

                            <MenuButton onClick={loadTemplates}>
                                Открыть шаблоны
                            </MenuButton>

                            <MenuButton onClick={() => setShowExport(true)} disabled={!canApply}>
                                Экспорт в YAML
                            </MenuButton>

                            <div className="my-1 border-t border-gray-100" />

                            <MenuButton onClick={onCollapseAll}>Свернуть всё</MenuButton>
                            <MenuButton onClick={onExpandAll}>Развернуть всё</MenuButton>

                            <div className="my-1 border-t border-gray-100" />

                            <MenuButton onClick={onReset} danger>
                                Очистить
                            </MenuButton>
                        </div>
                    )}
                </div>
            </div>

            {/* Рабочая область */}
            <div className="flex-1 overflow-auto p-4 bg-gray-50">
                {root.children.length === 0 && currentRuleIsUnconditional ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <div className="text-sm text-gray-500 mb-2">
                            Правило применяется ко всем объектам без условия
                        </div>
                        <div className="text-xs text-gray-400 max-w-sm">
                            Правило применяется безусловно. Добавьте условие ниже, если хотите
                            ограничить применение правила.
                        </div>
                        <button
                            onClick={() => {
                                // Добавляем пустой лиф, чтобы пользователь мог начать редактировать
                                setRoot({
                                    ...root,
                                    children: [...root.children, emptyLeaf()],
                                });
                            }}
                            className="mt-4 text-xs text-blue-600 hover:text-blue-800"
                        >
                            Добавить условие
                        </button>
                    </div>
                ) : (
                    <GroupEditor node={root} depth={0} onUpdate={setRoot} />
                )}
            </div>

            {/* Объяснение */}
            {showExplanation && (
                <div className="border-t border-gray-200 bg-amber-50 p-3 max-h-[200px] overflow-auto">
                    <div className="text-xs text-gray-500 mb-1">Объяснение</div>
                    <pre className="text-sm whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
                        {explanation || 'Пустое условие'}
                    </pre>
                </div>
            )}

            {/* Предпросмотр */}
            <div className="border-t border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-gray-500">Сгенерированный RQL</div>
                    {canApply && (
                        <div className="text-xs text-gray-400">
                            {prefixedRql.length} символов
                        </div>
                    )}
                </div>
                <pre className="text-xs whitespace-pre-wrap break-all bg-white p-2 rounded border border-gray-200 min-h-[40px] max-h-[160px] overflow-auto font-mono">
                    {prefixedRql || '—'}
                </pre>
            </div>
            {showExport && <ExportYamlModal onClose={() => setShowExport(false)} />}
            {showTemplates && <RuleTemplatesModal onClose={() => setShowTemplates(false)} />}
        </div>
    );
}

interface MenuButtonProps {
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    icon?: React.ReactNode;
    children: React.ReactNode;
    title?: string;
}

function MenuButton({ onClick, disabled, danger, icon, children, title }: MenuButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'
                }`}
        >
            {icon && <span className="text-gray-400">{icon}</span>}
            {children}
        </button>
    );
}