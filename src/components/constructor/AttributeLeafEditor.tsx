import type { Attribute } from '../../schema/types';
import type { LeafNode, LeafOperator } from '../../constructor/types';
import { useSchemaStore } from '../../store/useSchemaStore';
import { resolveDataType } from '../../schema/resolve-data-type';
import { operatorsForAttribute } from '../../constructor/operators';
import { ValueEditor } from './ValueEditor';

interface Props {
    node: LeafNode;
    /** Полный список атрибутов, доступных для выбора */
    attributes: Attribute[];
    /** Опционально: как сгруппировать в селекте */
    attributeGroups?: { label: string; items: Attribute[] }[];
    /** Префикс для отображения RQL — пока не используется в UI, задел на будущее */
    attributePrefix: string;
    onChange: (n: LeafNode) => void;
    onRemove?: () => void;
}

export function AttributeLeafEditor({
    node,
    attributes,
    attributeGroups,
    attributePrefix,
    onChange,
    onRemove,
}: Props) {
    const store = useSchemaStore.getState();
    const table = store.symbolTable;
    const domain = store.activeDomainId ?? '';

    const selectedAttr = node.attribute
        ? attributes.find(a => a.id === node.attribute)
        : undefined;

    const operators = selectedAttr && table
        ? operatorsForAttribute(selectedAttr, domain, table)
        : (['=', '!=', 'LIKE'] as LeafOperator[]);

    const groups = attributeGroups ?? [{ label: '', items: attributes }];

    // Определяем «эффективный» атрибут для редактора значения.
    // Для HAS атрибут имеет тип Array, а редактируем мы значение элемента,
    // поэтому нужен псевдо-атрибут с типом item.dataType.
    const valueAttribute: Attribute | undefined = (() => {
        if (!selectedAttr) return undefined;
        if (node.operator !== 'HAS') return selectedAttr;

        const item = selectedAttr.item;
        if (!item) return selectedAttr;

        return {
            ...selectedAttr,
            dataType: item.dataType,
            entity: item.entity,
            item: undefined,
        };
    })();

    const renderValue = () => {
        // IS NULL / IS NOT NULL — значения нет
        if (node.operator === 'IS NULL' || node.operator === 'IS NOT NULL') {
            return null;
        }

        // HAS — значение элемента массива
        if (node.operator === 'HAS') {
            return (
                <ValueEditor
                    attribute={valueAttribute}
                    value={node.value}
                    values={[]}
                    multiple={false}
                    onChange={v => onChange({ ...node, value: v })}
                    onChangeMultiple={() => { }}
                />
            );
        }

        // BETWEEN x AND y — два значения
        if (node.operator === 'BETWEEN') {
            return (
                <div className="flex items-center gap-2">
                    <ValueEditor
                        attribute={selectedAttr}
                        value={node.values[0] ?? null}
                        values={[]}
                        multiple={false}
                        onChange={v =>
                            onChange({
                                ...node,
                                values: [v, node.values[1] ?? (null as any)],
                            })
                        }
                        onChangeMultiple={() => { }}
                    />
                    <span className="text-gray-400 text-sm">и</span>
                    <ValueEditor
                        attribute={selectedAttr}
                        value={node.values[1] ?? null}
                        values={[]}
                        multiple={false}
                        onChange={v =>
                            onChange({
                                ...node,
                                values: [node.values[0] ?? (null as any), v],
                            })
                        }
                        onChangeMultiple={() => { }}
                    />
                </div>
            );
        }

        // IN — множественный выбор; всё остальное — одно значение
        return (
            <ValueEditor
                attribute={selectedAttr}
                value={node.value}
                values={node.values}
                multiple={node.operator === 'IN'}
                onChange={v => onChange({ ...node, value: v })}
                onChangeMultiple={vs => onChange({ ...node, values: vs })}
            />
        );
    };

    return (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded px-2 py-1.5 flex-wrap">
            {/* Селект атрибута */}
            <select
                className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[160px]"
                value={node.attribute}
                onChange={e =>
                    onChange({ ...node, attribute: e.target.value, value: null, values: [] })
                }
            >
                <option value="">— атрибут —</option>
                {groups.map((g, i) =>
                    g.label ? (
                        <optgroup key={i} label={g.label}>
                            {g.items.map(a => (
                                <option key={a.id} value={a.id}>
                                    {a.name ?? a.id}
                                </option>
                            ))}
                        </optgroup>
                    ) : (
                        g.items.map(a => (
                            <option key={a.id} value={a.id}>
                                {a.name ?? a.id}
                            </option>
                        ))
                    ),
                )}
            </select>

            {/* Селект оператора */}
            <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={node.operator}
                onChange={e =>
                    onChange({
                        ...node,
                        operator: e.target.value as LeafOperator,
                        value: null,
                        values: [],
                    })
                }
            >
                {operators.map(op => (
                    <option key={op} value={op}>
                        {op}
                    </option>
                ))}
            </select>

            {/* Редактор значения */}
            {renderValue()}

            {/* Кнопка удаления */}
            {onRemove && (
                <button
                    onClick={onRemove}
                    className="ml-auto text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                    title="Удалить условие"
                >
                    ×
                </button>
            )}
        </div>
    );
}