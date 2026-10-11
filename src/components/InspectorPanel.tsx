import { useMemo } from 'react';
import { useConstructorStore } from '../store/useConstructorStore';
import { useConstructorUiStore, type CodeToken } from '../store/useConstructorUiStore';
import { useEditorStore } from '../store/useEditorStore';
import { useSchemaStore } from '../store/useSchemaStore';
import { SYSTEM_LINKAGE_ATTRIBUTES } from '../schema/system-attributes';
import type {
    ConditionNode, LeafNode, LinkageNode, GroupNode, LeafValue,
} from '../constructor/types';
import { RQL_FUNCTIONS } from '../rql/functions';
import { scanAliases } from '../rql/completion/scan-aliases';
import { SYSTEM_ALIAS_DESCRIPTIONS } from '../rql/parser/hover';
import { resolveEntityFqid, type ResolvedEntity, type ResolvedLinkage } from '../schema/symbol-table';
import { useSchemaUiStore, type FocusTarget } from '../store/useSchemaUiStore';
import { IconTarget } from './icons';
import { AttributeTooltip } from './AttributeTooltip';
import { LinkageTooltip } from './LinkageTooltip';

export function InspectorPanel() {
    const root = useConstructorStore(s => s.root);
    const selection = useConstructorUiStore(s => s.selection);
    const table = useSchemaStore(s => s.symbolTable);
    const domain = useSchemaStore(s => s.activeDomainId ?? '');
    const context = useEditorStore(s => s.context);
    const issues = useConstructorUiStore(s => s.issues);

    const selectedNodeId =
        selection?.kind === 'tree-node' ? selection.id : null;

    const nodeIssues = selectedNodeId
        ? issues.get(selectedNodeId) ?? []
        : [];

    // Случай 1: выделен узел дерева
    const treeNode = useMemo(() => {
        if (selection?.kind !== 'tree-node') return null;
        return findNode(root, selection.id);
    }, [root, selection]);

    if (!table) {
        return <div className="p-4 text-sm text-gray-500">Загрузите схему.</div>;
    }

    if (selection?.kind === 'tree-node' && treeNode) {
        const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';

        return (
            <div className="h-full flex flex-col">
                <IssuesBlock nodeId={treeNode.id} />

                <div className="flex-1 overflow-auto">
                    {treeNode.kind === 'leaf' && (
                        <LeafInspector node={treeNode} entityFqid={entityFqid} />
                    )}
                    {treeNode.kind === 'linkage' && (
                        <LinkageInspector node={treeNode} />
                    )}
                    {treeNode.kind === 'group' && (
                        <GroupInspector node={treeNode} />
                    )}
                </div>
            </div>
        );
    }

    if (selection?.kind === 'code-token') {
        return <CodeTokenInspector token={selection.token} />;
    }

    if (selection?.kind === 'linkage') {
        const linkage = table.linkages.get(selection.fqid);
        if (!linkage) {
            return (
                <div className="p-4 text-sm text-gray-500">
                    Связь не найдена: <code>{selection.fqid}</code>
                </div>
            );
        }
        return (
            <div className="p-4 space-y-4">
                <Section title="Связь">
                    <LinkageTooltip linkage={linkage} />
                </Section>
            </div>
        );
    }

    return <SchemaSummary />;
}

// --- Поиск узла по id ----------------------------------------------------

function findNode(node: ConditionNode, id: string): ConditionNode | null {
    if (node.id === id) return node;
    if (node.kind === 'group') {
        for (const child of node.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
    }
    if (node.kind === 'linkage' && node.nested) {
        return findNode(node.nested, id);
    }
    return null;
}

// --- Leaf ---------------------------------------------------------------

function LeafInspector({ node, entityFqid }: { node: LeafNode; entityFqid: string }) {
    const table = useSchemaStore(s => s.symbolTable);
    if (!table) return null;

    const entity = entityFqid ? table.entities.get(entityFqid) : undefined;
    const attr = entity?.attributes.get(node.attribute);

    return (
        <div className="p-4 space-y-4">
            <Section title="Атрибут">
                {attr ? (
                    <AttributeTooltip attr={attr} entityFqid={entityFqid} />
                ) : (
                    <div className="text-gray-500 text-xs">
                        Атрибут <code>{node.attribute || '—'}</code> не найден
                    </div>
                )}
            </Section>

            <Section title="Условие">
                <Field label="Оператор" value={node.operator} mono />
                {node.value && <Field label="Значение" value={describeLeafValueShort(node.value)} mono />}
                {node.values.length > 0 && (
                    <Field label="Значения" value={node.values.map(describeLeafValueShort).join(', ')} mono />
                )}
            </Section>
        </div>
    );
}

// --- Linkage ------------------------------------------------------------

function LinkageInspector({ node }: { node: LinkageNode }) {
    const table = useSchemaStore(s => s.symbolTable);
    if (!table) return null;

    const linkage = table.linkages.get(node.linkageFqid);
    if (!linkage) {
        return (
            <div className="p-4 text-sm text-gray-500">
                Связь не найдена: <code>{node.linkageFqid}</code>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            <Section title="Связь">
                <LinkageTooltip linkage={linkage} />
            </Section>

            <Section title="Текущий объект">
                <Field label="На стороне" value={String(node.side)} mono />
                <Field label="Режим" value={describeMode(node.mode)} />
            </Section>
        </div>
    );
}

// --- Group --------------------------------------------------------------

function GroupInspector({ node }: { node: GroupNode }) {
    const opLabel =
        node.operator === 'AND' ? 'И (все условия)'
            : node.operator === 'OR' ? 'ИЛИ (хотя бы одно)'
                : 'НЕ';

    return (
        <div className="p-4 text-sm space-y-4">
            <Section title="Группа условий">
                <Field label="Логика" value={opLabel} />
                <Field label="Элементов" value={String(node.children.length)} />
                <Field label="ID" value={node.id} mono />
            </Section>
        </div>
    );
}

// --- Сводка схемы --------------------------------------------------------

function SchemaSummary() {
    const table = useSchemaStore(s => s.symbolTable);
    const domains = useSchemaStore(s => s.domains);

    if (!table) return null;

    return (
        <div className="p-4 text-sm space-y-4">
            <Section title="Схема">
                <Field label="Доменов" value={String(domains.length)} />
                <Field label="Сущностей" value={String(table.entities.size)} />
                <Field label="Связей" value={String(table.linkages.size)} />
                <Field label="Перечислений" value={String(table.enums.size)} />
                <Field label="Workflow" value={String(table.workflows.size)} />
            </Section>

            <div className="text-xs text-gray-500 leading-relaxed">
                Выберите условие, связь или группу в конструкторе, чтобы увидеть
                подробную информацию.
            </div>
        </div>
    );
}

// --- Утилиты ------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                {title}
            </div>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between gap-2">
            <span className="text-gray-500">{label}</span>
            <span className={mono ? 'font-mono text-xs' : ''}>{value}</span>
        </div>
    );
}

function describeMode(mode: LinkageNode['mode']): string {
    switch (mode) {
        case 'exists': return 'связь существует';
        case 'not-exists': return 'связи нет';
        case 'linkage-attribute': return 'условие на атрибут связи';
        case 'entity-attribute': return 'условие на атрибут связанной сущности';
    }
}

function describeLeafValueShort(v: LeafValue): string {
    switch (v.kind) {
        case 'string': return v.value;
        case 'number': return String(v.value);
        case 'boolean': return v.value ? 'да' : 'нет';
        case 'enum': return `@${v.enumId}.${v.valueId}`;
        case 'workflow': return `@${v.workflowId}.${v.statusId}`;
        case 'system-date': return `@${v.which}`;
        case 'system-user': return `@CurrentUser.${v.which}`;
        case 'attribute': return `@doc.${v.attribute}`;
    }
}

function resolveEntityName(ref: string, domain: string): string {
    if (ref.includes('/')) return ref;
    return `${domain}/${ref}`;
}

function CodeTokenInspector({ token }: { token: CodeToken }) {
    const table = useSchemaStore(s => s.symbolTable);
    const domain = useSchemaStore(s => s.activeDomainId ?? '');
    const context = useEditorStore(s => s.context);
    const editorValue = useEditorStore(s => s.value);

    if (!table) return null;

    // Функция
    if (token.functionName) {
        const fn = RQL_FUNCTIONS.find(
            f => f.name.toUpperCase() === token.functionName!.toUpperCase(),
        );
        if (!fn) {
            return (
                <div className="p-4 text-sm text-gray-500">
                    Неизвестная функция: <code>{token.functionName}</code>
                </div>
            );
        }
        return (
            <div className="p-4 text-sm space-y-4">
                <Section title="Функция">
                    <div className="space-y-1">
                        <div className="font-mono text-xs text-blue-700">
                            {fn.signature}
                        </div>
                        <div className="text-gray-700">{fn.description}</div>
                        {fn.example && (
                            <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-200 mt-2 whitespace-pre-wrap">
                                {fn.example}
                            </pre>
                        )}
                    </div>
                </Section>
                <Section title="Категория">
                    <Field label="Тип" value={fn.category} mono />
                </Section>
            </div>
        );
    }

    if (token.alias && token.attribute) {
        // 2.1. @doc.attr — атрибут текущей сущности
        if (token.alias === '@doc') {
            const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';
            const entity = entityFqid ? table.entities.get(entityFqid) : undefined;
            const attr = entity?.attributes.get(token.attribute);

            if (attr) {
                return (
                    <div className="p-4 space-y-4">
                        <Section title="Атрибут текущей сущности">
                            <AttributeTooltip attr={attr} entityFqid={entityFqid} />
                        </Section>
                    </div>
                );
            }
            return (
                <div className="p-4 text-sm text-gray-500">
                    Атрибут <code>{token.attribute}</code> не найден
                </div>
            );
        }

        // 2.2. @e_X.attr, @link_X.attr, @Ioc.attr — через scanAliases
        const aliases = scanAliases(editorValue, table, domain);
        const declared = aliases.find(a => a.alias === token.alias);
        if (declared?.kind === 'entity' && declared.entityFqid) {
            const entity = table.entities.get(declared.entityFqid);
            if (entity) {
                return (
                    <div className="p-4 space-y-4">
                        <Section title="Атрибут связанной сущности">
                            <EntityAttrInfo entity={entity} attrId={token.attribute} />
                        </Section>
                    </div>
                );
            }
        }
        if (declared?.kind === 'linkage' && declared.linkageFqid) {
            const linkage = table.linkages.get(declared.linkageFqid);
            if (linkage) {
                return (
                    <div className="p-4 space-y-4">
                        <Section title="Атрибут связи">
                            <LinkageAttrInfo linkage={linkage} attrId={token.attribute} />
                        </Section>
                    </div>
                );
            }
        }

        // 2.3. @enumX.Y — значение перечисления
        const localFqid = `${domain}/${token.alias.slice(1)}`;
        const enumValues =
            table.enums.get(localFqid) ?? table.enums.get(token.alias.slice(1));
        if (enumValues) {
            const v = enumValues.find(x => x.id === token.attribute);
            if (v) {
                return (
                    <div className="p-4 space-y-4">
                        <Section title="Значение перечисления">
                            <Field label="ID" value={v.id} mono />
                            <Field label="Название" value={v.name ?? v.id} />
                            <Field label="Перечисление" value={token.alias.slice(1)} mono />
                        </Section>
                    </div>
                );
            }
        }
    }

    // Псевдоним
    if (token.alias) {
        // Системный
        const sysDesc = SYSTEM_ALIAS_DESCRIPTIONS[token.alias];
        if (sysDesc) {
            return (
                <div className="p-4 text-sm space-y-4">
                    <Section title="Системный псевдоним">
                        <div className="font-mono text-xs text-blue-700">{token.alias}</div>
                        <div className="text-gray-700 mt-1">{sysDesc}</div>
                    </Section>
                </div>
            );
        }

        // Объявленный в FROM/JOIN
        const aliases = scanAliases(editorValue, table, domain);
        const declared = aliases.find(a => a.alias === token.alias);
        if (declared) {
            if (declared.kind === 'linkage' && declared.linkageFqid) {
                const linkage = table.linkages.get(declared.linkageFqid);
                if (linkage) {
                    return (
                        <div className="p-4 text-sm space-y-4">
                            <Section title="Псевдоним связи">
                                <div className="font-mono text-xs text-blue-700">
                                    {token.alias}
                                </div>
                            </Section>
                            <Section title="Связь">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="font-medium text-gray-800">
                                        {linkage.name ?? linkage.id}
                                    </div>
                                    <ShowInTreeButton
                                        target={{ kind: 'linkage', fqid: linkage.fqid }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Field label="ID" value={linkage.id} mono />
                                    <Field label="Сторона 1" value={linkage.side1} mono />
                                    <Field label="Сторона 2" value={linkage.side2} mono />
                                    <Field
                                        label="Тип"
                                        value={
                                            linkage.type === '1_1' ? '1-1'
                                                : linkage.type === '1_n' ? '1-N'
                                                    : 'N-N'
                                        }
                                    />
                                </div>
                            </Section>
                            {token.attribute && (
                                <Section title="Атрибут">
                                    <LinkageAttrInfo linkage={linkage} attrId={token.attribute} />
                                </Section>
                            )}
                        </div>
                    );
                }
            }
            if (declared.kind === 'entity' && declared.entityFqid) {
                const entity = table.entities.get(declared.entityFqid);
                return (
                    <div className="p-4 text-sm space-y-4">
                        <Section title="Псевдоним сущности">
                            <div className="font-mono text-xs text-blue-700">
                                {token.alias}
                            </div>
                        </Section>
                        <Section title="Сущность">
                            <div className="flex items-center justify-between mb-1">
                                <div className="font-medium text-gray-800">
                                    {entity?.entity.name ?? declared.entityFqid}
                                </div>
                                <ShowInTreeButton
                                    target={{ kind: 'entity', fqid: declared.entityFqid }}
                                />
                            </div>
                            <div className="space-y-1">
                                <Field label="FQID" value={declared.entityFqid} mono />
                                <Field
                                    label="Атрибутов"
                                    value={String(entity?.attributes.size ?? 0)}
                                />
                            </div>
                        </Section>
                        {token.attribute && entity && (
                            <Section title="Атрибут">
                                <EntityAttrInfo entity={entity} attrId={token.attribute} />
                            </Section>
                        )}
                    </div>
                );
            }
        }

        // @enum / @workflow / @IncUrgency.value
        const localFqid = `${domain}/${token.alias.slice(1)}`;
        const enumValues =
            table.enums.get(localFqid) ?? table.enums.get(token.alias.slice(1));
        if (enumValues) {
            return (
                <div className="p-4 text-sm space-y-4">
                    <Section title="Перечисление">
                        <Field label="ID" value={token.alias.slice(1)} mono />
                        <Field label="Значений" value={String(enumValues.length)} />
                    </Section>
                    {token.attribute && (
                        <Section title="Значение">
                            {(() => {
                                const v = enumValues.find(x => x.id === token.attribute);
                                if (!v) return <div className="text-gray-500">Не найдено</div>;
                                return (
                                    <>
                                        <Field label="ID" value={v.id} mono />
                                        <Field label="Название" value={v.name ?? v.id} />
                                    </>
                                );
                            })()}
                        </Section>
                    )}
                </div>
            );
        }
    }

    return (
        <div className="p-4 text-sm text-gray-500">
            Не удалось распознать элемент
        </div>
    );
}

function LinkageAttrInfo({
    linkage,
    attrId,
}: {
    linkage: ResolvedLinkage;
    attrId: string;
}) {
    // Сначала ищем в собственных атрибутах связи
    const own = linkage.attributes?.find(a => a.id === attrId);
    // Потом — в системных
    const sys = SYSTEM_LINKAGE_ATTRIBUTES.find(a => a.id === attrId);
    const attr = own ?? sys;

    if (!attr) {
        return (
            <div className="text-gray-500 text-xs">
                Атрибут <code>{attrId}</code> не найден у связи
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <Field label="Имя" value={attr.name ?? attr.id} />
            <Field label="ID" value={attr.id} mono />
            <Field label="Тип" value={attr.dataType} mono />
            {sys && (
                <div className="text-xs text-gray-500 italic mt-1">
                    Системный атрибут связи
                </div>
            )}
            {attr.description && (
                <div className="text-xs text-gray-600 mt-1">
                    {attr.description}
                </div>
            )}
        </div>
    );
}

function EntityAttrInfo({
    entity,
    attrId,
}: {
    entity: ResolvedEntity;
    attrId: string;
}) {
    const attr = entity.attributes.get(attrId);

    if (!attr) {
        return (
            <div className="text-gray-500 text-xs">
                Атрибут <code>{attrId}</code> не найден у сущности
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between mb-1">
                <div className="font-medium text-gray-800">
                    {attr.name ?? attr.id}
                </div>
                <ShowInTreeButton
                    target={{ kind: 'entity', fqid: entity.fqid }}
                />
            </div>
            <Field label="ID" value={attr.id} mono />
            <Field label="Тип" value={attr.dataType} mono />
            {attr.inheritedFrom && (
                <div className="text-xs text-gray-500 italic mt-1">
                    Унаследован от <code>{attr.inheritedFrom}</code>
                </div>
            )}
            {attr.description && (
                <div className="text-xs text-gray-600 mt-1">
                    {attr.description}
                </div>
            )}
            {attr.constraints && attr.constraints.length > 0 && (
                <div className="mt-2">
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                        Ограничения
                    </div>
                    <ul className="space-y-1 text-xs">
                        {attr.constraints.map((c, i) => (
                            <li key={i} className="text-gray-700">
                                <code className="text-blue-700">{c.kind}</code>
                                {c.min !== undefined && ` min=${c.min}`}
                                {c.max !== undefined && ` max=${c.max}`}
                                {c.regexp && <code className="ml-1">{c.regexp}</code>}
                                {c.message && (
                                    <div className="text-gray-500 mt-0.5">{c.message}</div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function ShowInTreeButton({ target }: { target: FocusTarget }) {
    const focusOn = useSchemaUiStore(s => s.focusOn);
    if (!target || (target.kind === 'entity' && !target.fqid)) return null;
    if (target.kind === 'linkage' && !target.fqid) return null;
    return (
        <button
            onClick={() => focusOn(target)}
            title="Показать в дереве схемы"
            className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-50 px-1.5 py-0.5 rounded"
        >
            <IconTarget className="w-3 h-3" />
            Показать в дереве
        </button>
    );
}

function IssuesBlock({ nodeId }: { nodeId: string }) {
    const issues = useConstructorUiStore(s => s.issues);
    const list = issues.get(nodeId) ?? [];

    if (list.length === 0) return null;

    return (
        <div className="border-b border-gray-200 bg-gray-50 p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
                Проблемы
            </div>

            {list.map((issue, i) => (
                <div
                    key={i}
                    className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 border ${issue.severity === 'error'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                        }`}
                >
                    <span className="shrink-0">
                        {issue.severity === 'error' ? '⛔' : '⚠'}
                    </span>
                    <span className="flex-1 leading-snug">{issue.message}</span>
                </div>
            ))}
        </div>
    );
}