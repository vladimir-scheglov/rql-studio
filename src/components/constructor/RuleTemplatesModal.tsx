import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useConstructorStore } from '../../store/useConstructorStore';
import { useConstructorUiStore } from '../../store/useConstructorUiStore';
import {
    RULE_TEMPLATES,
    TEMPLATE_CATEGORIES,
    type RuleTemplate,
    type TemplateContext,
} from '../../constructor/rule-templates';
import { showToast } from '../Toast';
import { IconCheck, IconX } from '../icons';
import { resolveEntityFqid } from '../../schema/symbol-table';
import { serializeCondition } from '../../constructor/serialize';
import { buildDataRuleYaml } from '../../constructor/export-yaml';
import { useCurrentRuleStore } from '../../store/useCurrentRuleStore';

interface Props {
    onClose: () => void;
}

export function RuleTemplatesModal({ onClose }: Props) {
    const table = useSchemaStore(s => s.symbolTable);
    const domain = useSchemaStore(s => s.activeDomainId ?? '');
    const context = useEditorStore(s => s.context);
    const setRoot = useConstructorStore(s => s.setRoot);
    const setCurrentRule = useCurrentRuleStore(s => s.setCurrentRule);
    const setActiveTab = useEditorStore(s => s.setActiveTab);

    const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';

    const [selectedTemplate, setSelectedTemplate] = useState<RuleTemplate | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});

    const ctx: TemplateContext | null = useMemo(() => {
        if (!table || !domain || !entityFqid) return null;
        return { table, domain, entityFqid };
    }, [table, domain, entityFqid]);

    const entity = entityFqid && table
        ? table.entities.get(entityFqid)
        : undefined;

    const templates = useMemo(() => {
        return categoryFilter
            ? RULE_TEMPLATES.filter(t => t.category === categoryFilter)
            : RULE_TEMPLATES;
    }, [categoryFilter]);

    const openTemplate = (t: RuleTemplate) => {
        setSelectedTemplate(t);
        const init: Record<string, string> = {};
        for (const p of t.conditionParams) init[p.id] = p.defaultValue ?? '';
        for (const p of t.effectParams) init[p.id] = p.defaultValue ?? '';
        setValues(init);
    };

    const applyTemplate = () => {
        if (!selectedTemplate || !ctx || !entity) return;

        const allParams = [
            ...selectedTemplate.conditionParams,
            ...selectedTemplate.effectParams,
        ];
        const missing = allParams.find(p => !values[p.id]?.trim());
        if (missing) {
            showToast(`Заполните поле «${missing.label}»`);
            return;
        }

        const root = selectedTemplate.build(values, ctx);
        setRoot(root);
        setCurrentRule(null, selectedTemplate.defaultEffect);
        setActiveTab('builder');
        showToast(`Применён шаблон «${selectedTemplate.name}»`);
        onClose();
    };

    if (!table || !domain || !entityFqid) {
        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md">
                    <div className="text-sm text-gray-700 mb-4">
                        Выберите сущность в контексте, чтобы применять шаблоны.
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

    const linkagesForEntity = useMemo(() => {
        if (!table || !entityFqid) return [];
        const result: {
            fqid: string;
            id: string;
            name?: string;
            side: '1' | '2';
        }[] = [];

        for (const linkage of table.linkages.values()) {
            const side1Fqid = resolveEntityFqid(linkage.side1, linkage.domain, table);
            const side2Fqid = resolveEntityFqid(linkage.side2, linkage.domain, table);

            if (side1Fqid === entityFqid) {
                result.push({
                    fqid: linkage.fqid,
                    id: linkage.id,
                    name: linkage.name,
                    side: '1',
                });
            }
            if (side2Fqid === entityFqid && !linkage.undirected && side1Fqid !== side2Fqid) {
                result.push({
                    fqid: linkage.fqid,
                    id: linkage.id,
                    name: linkage.name,
                    side: '2',
                });
            }
        }
        return result;
    }, [table, entityFqid]);

    const previewRql = useMemo(() => {
        if (!selectedTemplate || !ctx) return '';
        try {
            const root = selectedTemplate.build(values, ctx);
            return serializeCondition(root, ctx.table);
        } catch {
            return '';
        }
    }, [selectedTemplate, ctx, values]);

    const previewYaml = useMemo(() => {
        if (!selectedTemplate || !ctx || !entity) return '';
        try {
            const root = selectedTemplate.build(values, ctx);
            const extras = selectedTemplate.effectExtras?.(values, ctx) ?? {};

            return buildDataRuleYaml(root, ctx.table, ctx.domain, ctx.entityFqid, {
                id: 'rule_' + selectedTemplate.id,
                name: selectedTemplate.name,
                effect: selectedTemplate.defaultEffect,
                attribute: values.target,
                message: values.message,
                help: values.help,
                constraint: extras.constraint,
                expression: extras.expression,
                value: extras.value,
            });
        } catch {
            return '';
        }
    }, [selectedTemplate, ctx, values, entity]);

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-[1100px] max-w-[95vw] max-h-[85vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <div>
                        <h2 className="font-medium text-gray-900">Библиотека правил</h2>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Сущность: <span className="font-mono">{entityFqid}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                {/* Body: две колонки */}
                <div className="flex-1 flex min-h-0">
                    {/* Список шаблонов */}
                    <div className="w-80 border-r border-gray-200 flex flex-col min-h-0">
                        <div className="p-2 border-b border-gray-100 flex flex-wrap gap-1 shrink-0">
                            <button
                                onClick={() => setCategoryFilter(null)}
                                className={`text-[11px] px-2 py-0.5 rounded ${!categoryFilter
                                    ? 'bg-gray-800 text-white'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                Все
                            </button>
                            {TEMPLATE_CATEGORIES.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setCategoryFilter(c.id)}
                                    className={`text-[11px] px-2 py-0.5 rounded ${categoryFilter === c.id
                                        ? 'bg-gray-800 text-white'
                                        : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>

                        <div className="overflow-auto flex-1">
                            {templates.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => openTemplate(t)}
                                    className={`w-full text-left px-3 py-2 border-b border-gray-100 transition-colors ${selectedTemplate?.id === t.id
                                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                                        : 'hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="text-xs font-medium text-gray-800">
                                        {t.name}
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                                        {t.description}
                                    </div>
                                    <div className="mt-1">
                                        <span className="text-[10px] px-1 rounded bg-gray-100 text-gray-500">
                                            {t.defaultEffect}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Форма параметров */}
                    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
                        {!selectedTemplate ? (
                            <div className="flex-1 flex items-center justify-center p-8 text-sm text-gray-400 text-center">
                                Выберите шаблон слева,
                                <br />
                                чтобы настроить параметры
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto p-5 space-y-4">
                                <div>
                                    <h3 className="font-medium text-gray-900">
                                        {selectedTemplate.name}
                                    </h3>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {selectedTemplate.description}
                                    </div>
                                    <div className="text-xs text-gray-600 mt-2">
                                        Эффект:{' '}
                                        <code className="text-purple-700">
                                            {selectedTemplate.defaultEffect}
                                        </code>
                                    </div>
                                </div>

                                {selectedTemplate && (
                                    <div className="flex-1 flex min-h-0">
                                        {/* Форма — узкая колонка */}
                                        <div className="w-80 shrink-0 overflow-auto p-4 space-y-5 border-r border-gray-200">
                                            <div>
                                                <h3 className="font-medium text-gray-900">
                                                    {selectedTemplate.name}
                                                </h3>
                                                <div className="text-xs text-gray-500 mt-0.5 leading-snug">
                                                    {selectedTemplate.description}
                                                </div>
                                            </div>

                                            {/* Условие */}
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">
                                                    Условие правила (RQL)
                                                </div>
                                                {selectedTemplate.conditionParams.length === 0 ? (
                                                    <div className="text-xs text-gray-400 italic">
                                                        Применяется ко всем объектам
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {selectedTemplate.conditionParams.map(p => (
                                                            <TemplateParamField
                                                                key={p.id}
                                                                param={p}
                                                                value={values[p.id] ?? ''}
                                                                onChange={v => setValues(prev => ({ ...prev, [p.id]: v }))}
                                                                attributes={entity ? [...entity.attributes.values()] : []}
                                                                linkages={linkagesForEntity}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Эффект */}
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">
                                                    Эффект правила (dataRules)
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="text-xs text-gray-600">
                                                        Тип эффекта:{' '}
                                                        <code className="text-purple-700 font-mono">
                                                            {selectedTemplate.defaultEffect}
                                                        </code>
                                                    </div>
                                                    {selectedTemplate.effectParams.length === 0 ? (
                                                        <div className="text-xs text-gray-400 italic">
                                                            Параметры не требуются
                                                        </div>
                                                    ) : (
                                                        selectedTemplate.effectParams.map(p => (
                                                            <TemplateParamField
                                                                key={p.id}
                                                                param={p}
                                                                value={values[p.id] ?? ''}
                                                                onChange={v => setValues(prev => ({ ...prev, [p.id]: v }))}
                                                                attributes={entity ? [...entity.attributes.values()] : []}
                                                                linkages={linkagesForEntity}
                                                            />
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Превью — растягивается, занимает всё доступное место */}
                                        <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
                                            <PreviewPane
                                                title="Условие (RQL)"
                                                content={previewRql ? `!rql ${previewRql}` : ''}
                                                emptyText="— пусто —"
                                                language="rql"
                                            />
                                            <PreviewPane
                                                title="Правило (YAML)"
                                                content={previewYaml}
                                                emptyText="— пусто —"
                                                language="yaml"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
                    <div className="text-xs text-gray-500">
                        {selectedTemplate
                            ? `Применить шаблон «${selectedTemplate.name}»`
                            : 'Выберите шаблон'}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={applyTemplate}
                            disabled={!selectedTemplate}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
                        >
                            <IconCheck className="w-3.5 h-3.5" />
                            Применить
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// --- Поле параметра ------------------------------------------------------

function TemplateParamField({
    param,
    value,
    onChange,
    attributes,
    linkages,
}: {
    param: any;
    value: string;
    onChange: (v: string) => void;
    attributes: any[];
    linkages: { fqid: string; id: string; name?: string; side: '1' | '2' }[];
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
                {param.label}
            </label>

            {param.kind === 'attribute' && (
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                >
                    <option value="">— выберите —</option>
                    {attributes
                        .filter(a => !param.attributeFilter || param.attributeFilter(a, null))
                        .map(a => (
                            <option key={a.id} value={a.id}>
                                {a.name ?? a.id} ({a.id})
                            </option>
                        ))}
                </select>
            )}

            {param.kind === 'text' && (
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={param.hint}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                />
            )}

            {param.kind === 'linkage' && (
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                >
                    <option value="">— выберите связь —</option>
                    {linkages.map(l => (
                        <option key={l.fqid + ':' + l.side} value={l.fqid}>
                            {l.name ?? l.id}
                        </option>
                    ))}
                </select>
            )}

            {param.hint && (
                <div className="text-[11px] text-gray-400 mt-0.5">{param.hint}</div>
            )}
        </div>
    );
}

function PreviewPane({
    title,
    content,
    emptyText,
    language,
}: {
    title: string;
    content: string;
    emptyText: string;
    language: 'rql' | 'yaml';
}) {
    return (
        <div className="flex-1 min-h-0 flex flex-col border-b border-gray-200 last:border-b-0">
            <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-gray-500 font-medium bg-gray-100 border-b border-gray-200 shrink-0 flex items-center justify-between">
                <span>{title}</span>
                <span className="text-gray-400 normal-case tracking-normal text-[10px]">
                    {language}
                </span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
                {content ? (
                    <pre className="p-4 text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-words text-gray-800 bg-white min-h-full">
                        {content}
                    </pre>
                ) : (
                    <div className="p-4 text-xs text-gray-400 italic bg-white min-h-full">
                        {emptyText}
                    </div>
                )}
            </div>
        </div>
    );
}