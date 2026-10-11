import { useMemo } from 'react';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import {
    resolveEntityFqid,
    resolveLinkageFqid,
} from '../../schema/symbol-table';
import type { Attribute } from '../../schema/types';
import type { LinkageNode, LeafNode } from '../../constructor/types';
import { emptyLeaf } from '../../constructor/types';
import { AttributeLeafEditor } from './AttributeLeafEditor';
import { COMMON_SYSTEM_ATTRIBUTE_IDS } from '../../schema/system-attributes';

interface Props {
    node: LinkageNode;
    onChange: (n: LinkageNode) => void;
}

interface AvailableLinkage {
    fqid: string;
    shortId: string;
    label: string;
    targetFqid: string;
    side: '1' | '2';
}

export function LinkageEditor({ node, onChange }: Props) {
    const store = useSchemaStore.getState();
    const table = store.symbolTable;
    const editorCtx = useEditorStore(s => s.context);
    const entityFqid = 'entityFqid' in editorCtx ? editorCtx.entityFqid : '';

    const availableLinkages = useMemo<AvailableLinkage[]>(() => {
        if (!table || !entityFqid) return [];
        const result: AvailableLinkage[] = [];

        for (const lk of table.linkages.values()) {
            const side1Fqid = resolveEntityFqid(lk.side1, lk.domain, table);
            const side2Fqid = resolveEntityFqid(lk.side2, lk.domain, table);

            const side1Match = side1Fqid === entityFqid;
            const side2Match = side2Fqid === entityFqid;

            if (side1Match && side2Fqid) {
                result.push({
                    fqid: lk.fqid,
                    shortId: lk.id,
                    label: lk.name ?? lk.id,
                    targetFqid: side2Fqid,
                    side: '1',
                });
            }

            if (side2Match && !side1Match && !lk.undirected && side1Fqid) {
                result.push({
                    fqid: lk.fqid,
                    shortId: lk.id,
                    label: lk.name ?? lk.id,
                    targetFqid: side1Fqid,
                    side: '2',
                });
            }
        }
        return result;
    }, [table, entityFqid]);

    const selected = availableLinkages.find(l => l.fqid === node.linkageFqid);

    const updateLinkage = (fqid: string) => {
        const lk = availableLinkages.find(l => l.fqid === fqid);
        onChange({
            ...node,
            linkageFqid: fqid,
            side: lk?.side ?? '1',
            targetEntityFqid: lk?.targetFqid ?? '',
            mode: 'exists',
            nested: null,
        });
    };

    const needsNested =
        node.mode === 'linkage-attribute' || node.mode === 'entity-attribute';

    return (
        <div className="bg-white border border-purple-200 rounded px-3 py-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-purple-700 font-medium">Связь:</span>

                <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[180px]"
                    value={node.linkageFqid}
                    onChange={e => updateLinkage(e.target.value)}
                >
                    <option value="">— выберите —</option>
                    {availableLinkages.map(l => (
                        <option key={l.fqid + ':' + l.side} value={l.fqid}>
                            {l.label}
                        </option>
                    ))}
                </select>

                <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                    value={node.mode}
                    onChange={e => {
                        const mode = e.target.value as LinkageNode['mode'];
                        let nested = node.nested;
                        if (
                            (mode === 'linkage-attribute' || mode === 'entity-attribute') &&
                            !nested
                        ) {
                            nested = emptyLeaf();
                        }
                        if (mode === 'exists' || mode === 'not-exists') {
                            nested = null;
                        }
                        onChange({ ...node, mode, nested });
                    }}
                >
                    <option value="exists">есть связь</option>
                    <option value="not-exists">нет связи</option>
                    <option value="linkage-attribute">атрибут связи</option>
                    <option value="entity-attribute">атрибут связанного объекта</option>
                </select>
            </div>

            {!selected && node.linkageFqid && (
                <div className="text-xs text-red-600">
                    Связь не найдена для текущей сущности
                </div>
            )}

            {needsNested && selected && table && (
                <NestedLeafEditor
                    linkageNode={node}
                    onChange={onChange}
                />
            )}
        </div>
    );
}

/**
 * Редактор условия на атрибут связи или связанной сущности.
 * Показывает правильный набор атрибутов в зависимости от режима.
 */
function NestedLeafEditor({
    linkageNode,
    onChange,
}: {
    linkageNode: LinkageNode;
    onChange: (n: LinkageNode) => void;
}) {
    const store = useSchemaStore.getState();
    const table = store.symbolTable;
    if (!table) return null;

    const linkage = table.linkages.get(linkageNode.linkageFqid);
    if (!linkage) return null;

    let attributes: Attribute[] = [];

    if (linkageNode.mode === 'linkage-attribute') {
        attributes = linkage.attributes ?? [];
    } else {
        const targetEntity = table.entities.get(linkageNode.targetEntityFqid);
        if (targetEntity) {
            attributes = [...targetEntity.attributes.values()];
        }
    }

    const nested = linkageNode.nested ?? emptyLeaf();

    const prefix =
        linkageNode.mode === 'linkage-attribute'
            ? `@link_${linkage.id}.`
            : `@e_${linkage.id}.`;

    return (
        <div className="pl-4 border-l-2 border-purple-300">
            <div className="text-xs text-gray-500 mb-1">
                {linkageNode.mode === 'linkage-attribute'
                    ? 'Условие на атрибут связи'
                    : 'Условие на атрибут связанного объекта'}
            </div>

            {attributes.length === 0 ? (
                <div className="text-xs text-gray-400">
                    У выбранного объекта нет атрибутов
                </div>
            ) : (
                <AttributeLeafEditor
                    node={nested}
                    attributes={attributes}
                    attributePrefix={prefix}
                    onChange={next => onChange({ ...linkageNode, nested: next })}
                />
            )}
        </div>
    );
}