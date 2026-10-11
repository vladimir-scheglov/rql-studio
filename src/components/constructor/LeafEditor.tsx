import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { SYSTEM_ATTRIBUTES } from '../../schema/system-attributes';
import type { LeafNode } from '../../constructor/types';
import { AttributeLeafEditor } from './AttributeLeafEditor';

const SYSTEM_IDS = new Set(SYSTEM_ATTRIBUTES.map(a => a.id));

interface Props {
    node: LeafNode;
    onChange: (n: LeafNode) => void;
}

export function LeafEditor({ node, onChange }: Props) {
    const store = useSchemaStore.getState();
    const context = useEditorStore(s => s.context);
    const entityFqid = 'entityFqid' in context ? context.entityFqid : '';
    const entity = entityFqid
        ? store.symbolTable?.entities.get(entityFqid)
        : undefined;

    const attributes = entity ? [...entity.attributes.values()] : [];
    const userAttributes = attributes.filter(a => !SYSTEM_IDS.has(a.id));
    const systemAttributes = attributes.filter(a => SYSTEM_IDS.has(a.id));

    const groups = [
        { label: 'Пользовательские', items: userAttributes },
        ...(systemAttributes.length > 0
            ? [{ label: 'Системные', items: systemAttributes }]
            : []),
    ];

    return (
        <AttributeLeafEditor
            node={node}
            attributes={attributes}
            attributeGroups={groups}
            attributePrefix="@doc."
            onChange={onChange}
        />
    );
}