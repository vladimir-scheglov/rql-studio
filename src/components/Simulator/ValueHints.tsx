import { useMemo, useState } from 'react';
import type { ResolvedEntity, SymbolTable, ResolvedAttribute } from '../../schema/symbol-table';
import { resolveDataType } from '../../schema/resolve-data-type';

interface Props {
    entity: ResolvedEntity;
    table: SymbolTable;
    domain: string;
    /** Текущее значение из JSON по атрибуту */
    getValue: (attrId: string) => any;
    /** Вставить значение в JSON */
    onInsert: (attrId: string, value: any) => void;
}

export function ValueHints({ entity, table, domain, getValue, onInsert }: Props) {
    const [filter, setFilter] = useState('');

    const rows = useMemo(() => {
        const result: {
            attr: ResolvedAttribute;
            options: ValueOption[];
            hint: string;
        }[] = [];

        for (const attr of entity.attributes.values()) {
            const resolved = resolveDataType(attr.dataType, domain, table);
            const options: ValueOption[] = [];
            let hint = '';

            if (resolved.kind === 'Enum' || resolved.kind === 'Workflow') {
                for (const v of resolved.values ?? []) {
                    options.push({
                        label: v.name ?? v.id,
                        value: v.id,
                    });
                }
                hint = `${options.length} значений`;
            } else if (resolved.baseName === 'Bool') {
                options.push({ label: 'true', value: true });
                options.push({ label: 'false', value: false });
                hint = 'логическое значение';
            } else if (resolved.baseName === 'Timestamp' || resolved.baseName === 'Date' || resolved.baseName === 'Time') {
                options.push({
                    label: 'Сейчас',
                    value: resolved.baseName === 'Date'
                        ? new Date().toISOString().slice(0, 10)
                        : resolved.baseName === 'Time'
                            ? new Date().toISOString().slice(11, 19)
                            : new Date().toISOString(),
                });
                hint = 'дата/время';
            } else if (resolved.baseName === 'Array') {
                hint = 'массив';
            } else if (resolved.baseName === 'Reference') {
                hint = 'ID объекта';
            }

            if (options.length === 0 && !hint) continue;

            // Фильтр по имени/ID атрибута
            if (filter) {
                const needle = filter.toLowerCase();
                if (!attr.id.toLowerCase().includes(needle) &&
                    !(attr.name ?? '').toLowerCase().includes(needle)) {
                    continue;
                }
            }

            result.push({ attr, options, hint });
        }

        return result;
    }, [entity, table, domain, filter]);

    if (rows.length === 0) return null;

    return (
        <div className="border-t border-gray-200 bg-gray-50 max-h-64 overflow-auto">
            <div className="sticky top-0 bg-gray-100 border-b border-gray-200 px-3 py-1.5 flex items-center gap-2 z-10">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                    Подсказки по значениям
                </span>
                <input
                    type="text"
                    placeholder="Фильтр..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="ml-auto text-[11px] px-2 py-0.5 border border-gray-300 rounded w-32 focus:border-blue-400 focus:outline-none"
                />
            </div>

            <div className="p-2 space-y-2">
                {rows.map(({ attr, options, hint }) => {
                    const current = getValue(attr.id);
                    return (
                        <div key={attr.id} className="bg-white rounded border border-gray-200 p-2">
                            <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-[11px] font-medium text-gray-800">
                                    {attr.name ?? attr.id}
                                </span>
                                <code className="text-[10px] text-gray-400">{attr.id}</code>
                                {current !== undefined && current !== null && (
                                    <span className="ml-auto text-[10px] text-blue-600">
                                        текущее: {formatCurrent(current)}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                                {options.map(o => (
                                    <button
                                        key={String(o.value)}
                                        onClick={() => onInsert(attr.id, o.value)}
                                        title={`Вставить в JSON: ${JSON.stringify(o.value)}`}
                                        className="text-[10px] px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors"
                                    >
                                        {o.label}
                                    </button>
                                ))}

                                {options.length === 0 && hint && (
                                    <span className="text-[10px] text-gray-400 italic">
                                        {hint}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

interface ValueOption {
    label: string;
    value: any;
}

function formatCurrent(v: any): string {
    if (typeof v === 'string') return `«${v.length > 20 ? v.slice(0, 20) + '…' : v}»`;
    if (typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `[${v.length}]`;
    return String(v);
}