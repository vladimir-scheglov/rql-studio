import { useSchemaStore } from '../../store/useSchemaStore';
import { resolveDataType } from '../../schema/resolve-data-type';
import type { Attribute } from '../../schema/types';
import type { LeafValue } from '../../constructor/types';

interface Props {
    attribute: Attribute | undefined;
    value: LeafValue | null;
    values: LeafValue[];
    multiple: boolean;
    onChange: (v: LeafValue) => void;
    onChangeMultiple: (vs: LeafValue[]) => void;
}

export function ValueEditor({
    attribute,
    value,
    values,
    multiple,
    onChange,
    onChangeMultiple,
}: Props) {
    const store = useSchemaStore.getState();
    const table = store.symbolTable;
    const domain = store.activeDomainId ?? '';

    if (!attribute || !table) {
        return <span className="text-xs text-gray-400">Выберите атрибут</span>;
    }

    const resolved = resolveDataType(attribute.dataType, domain, table);

    // --- Enum / Workflow ---
    if (resolved.kind === 'Enum' || resolved.kind === 'Workflow') {
        const enumValues = resolved.values ?? [];

        if (multiple) {
            const currentIds = new Set(
                values
                    .map(v =>
                        v.kind === 'enum' ? v.valueId
                            : v.kind === 'workflow' ? v.statusId
                                : '',
                    )
                    .filter(Boolean),
            );

            return (
                <select
                    multiple
                    className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[200px]"
                    value={[...currentIds]}
                    onChange={e => {
                        const selected = Array.from(e.target.selectedOptions).map(o => o.value);
                        const next: LeafValue[] = selected.map(id =>
                            resolved.kind === 'Enum'
                                ? { kind: 'enum', enumId: attribute.dataType, valueId: id }
                                : { kind: 'workflow', workflowId: attribute.dataType, statusId: id },
                        );
                        onChangeMultiple(next);
                    }}
                >
                    {enumValues.map(v => (
                        <option key={v.id} value={v.id}>
                            {v.name ?? v.id}
                        </option>
                    ))}
                </select>
            );
        }

        const currentId =
            value?.kind === 'enum' ? value.valueId
                : value?.kind === 'workflow' ? value.statusId
                    : '';

        return (
            <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={currentId}
                onChange={e => {
                    if (!e.target.value) return;
                    if (resolved.kind === 'Enum') {
                        onChange({
                            kind: 'enum',
                            enumId: attribute.dataType,
                            valueId: e.target.value,
                        });
                    } else {
                        onChange({
                            kind: 'workflow',
                            workflowId: attribute.dataType,
                            statusId: e.target.value,
                        });
                    }
                }}
            >
                <option value="">— выберите —</option>
                {enumValues.map(v => (
                    <option key={v.id} value={v.id}>
                        {v.name ?? v.id}
                    </option>
                ))}
            </select>
        );
    }

    // --- Bool ---
    if (resolved.baseName === 'Bool') {
        const val = value?.kind === 'boolean' ? String(value.value) : '';
        return (
            <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={val}
                onChange={e => {
                    if (!e.target.value) return;
                    onChange({ kind: 'boolean', value: e.target.value === 'true' });
                }}
            >
                <option value="">— выберите —</option>
                <option value="true">True</option>
                <option value="false">False</option>
            </select>
        );
    }

    // --- Date / Time / Timestamp ---
    if (
        resolved.baseName === 'Date' ||
        resolved.baseName === 'Time' ||
        resolved.baseName === 'Timestamp'
    ) {
        const isSystem = value?.kind === 'system-date';
        const kind = isSystem ? value.which : 'literal';

        return (
            <div className="flex items-center gap-2">
                <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                    value={kind}
                    onChange={e => {
                        if (e.target.value === 'literal') {
                            onChange({ kind: 'string', value: '' });
                        } else {
                            onChange({ kind: 'system-date', which: e.target.value as any });
                        }
                    }}
                >
                    <option value="literal">Литерал</option>
                    <option value="CurrentDate">@CurrentDate</option>
                    <option value="CurrentTime">@CurrentTime</option>
                    <option value="CurrentTimestamp">@CurrentTimestamp</option>
                </select>
                {kind === 'literal' && (
                    <input
                        type="text"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        placeholder="2025-01-01"
                        value={value?.kind === 'string' ? value.value : ''}
                        onChange={e => onChange({ kind: 'string', value: e.target.value })}
                    />
                )}
            </div>
        );
    }

    // --- Reference ---
    if (resolved.baseName === 'Reference') {
        const isSystemUser = value?.kind === 'system-user';
        const kind = isSystemUser ? value.which : 'literal';

        return (
            <div className="flex items-center gap-2">
                <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                    value={kind}
                    onChange={e => {
                        if (e.target.value === 'literal') {
                            onChange({ kind: 'string', value: '' });
                        } else {
                            onChange({ kind: 'system-user', which: e.target.value as any });
                        }
                    }}
                >
                    <option value="literal">ID объекта</option>
                    <option value="id">@CurrentUser.id</option>
                    <option value="username">@CurrentUser.username</option>
                </select>
                {kind === 'literal' && (
                    <input
                        type="text"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        placeholder="UUID или значение"
                        value={value?.kind === 'string' ? value.value : ''}
                        onChange={e => onChange({ kind: 'string', value: e.target.value })}
                    />
                )}
            </div>
        );
    }

    // --- Number (Integer, Decimal, Float) ---
    if (
        resolved.baseName === 'Integer' ||
        resolved.baseName === 'Decimal' ||
        resolved.baseName === 'Float'
    ) {
        if (multiple) {
            return (
                <MultipleInputs
                    values={values}
                    kind="number"
                    onChangeMultiple={onChangeMultiple}
                />
            );
        }
        return (
            <input
                type="number"
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={value?.kind === 'number' ? value.value : ''}
                onChange={e => onChange({ kind: 'number', value: Number(e.target.value) })}
            />
        );
    }

    // --- Multiple Inputs для String / Uuid / прочих ---
    if (multiple) {
        return (
            <MultipleInputs
                values={values}
                kind="string"
                onChangeMultiple={onChangeMultiple}
            />
        );
    }

    // --- String по умолчанию ---
    return (
        <input
            type="text"
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            placeholder="Значение"
            value={value?.kind === 'string' ? value.value : ''}
            onChange={e => onChange({ kind: 'string', value: e.target.value })}
        />
    );
}

// --- Вспомогательный компонент для набора значений ---

interface MultipleInputsProps {
    values: LeafValue[];
    kind: 'string' | 'number';
    onChangeMultiple: (vs: LeafValue[]) => void;
}

function MultipleInputs({ values, kind, onChangeMultiple }: MultipleInputsProps) {
    // Если значений нет — показываем одно пустое поле,
    // чтобы пользователь мог сразу начать ввод.
    const items: LeafValue[] =
        values.length > 0 ? values : [{ kind, value: '' } as LeafValue];

    return (
        <div className="flex flex-col gap-1">
            {items.map((v, i) => (
                <div key={i} className="flex items-center gap-1">
                    <input
                        type={kind === 'number' ? 'number' : 'text'}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        value={
                            v.kind === 'string' ? v.value
                                : v.kind === 'number' ? String(v.value)
                                    : ''
                        }
                        onChange={e => {
                            const next = [...items];
                            next[i] =
                                kind === 'number'
                                    ? { kind: 'number', value: Number(e.target.value) }
                                    : { kind: 'string', value: e.target.value };
                            onChangeMultiple(next);
                        }}
                    />
                    {items.length > 1 && (
                        <button
                            onClick={() => onChangeMultiple(items.filter((_, j) => j !== i))}
                            className="text-gray-400 hover:text-red-600 px-1"
                            title="Удалить значение"
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            <button
                onClick={() => onChangeMultiple([...items, { kind, value: '' } as LeafValue])}
                className="text-xs text-blue-600 hover:text-blue-800 self-start"
            >
                + Добавить значение
            </button>
        </div>
    );
}