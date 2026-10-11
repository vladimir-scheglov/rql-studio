import { SYSTEM_LINKAGE_ATTRIBUTES } from '../schema/system-attributes';
import type { ResolvedLinkage } from '../schema/symbol-table';
import { useSchemaStore } from '../store/useSchemaStore';

interface Props {
    linkage: ResolvedLinkage;
    compact?: boolean;
}

export function LinkageTooltip({ linkage, compact = false }: Props) {
    const symbolTable = useSchemaStore(s => s.symbolTable);

    const side1Name = resolveEntityLabel(symbolTable, linkage, linkage.side1);
    const side2Name = resolveEntityLabel(symbolTable, linkage, linkage.side2);
    const typeLabel =
        linkage.type === '1_1' ? '1-1'
            : linkage.type === '1_n' ? '1-N'
                : 'N-N';
    const dir = linkage.undirected ? 'ненаправленная' : 'направленная';

    const attrs = [
        ...(linkage.attributes ?? []),
        ...SYSTEM_LINKAGE_ATTRIBUTES,
    ];

    return (
        <div
            className={
                compact
                    ? 'w-72 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl p-3 space-y-2'
                    : 'space-y-4'
            }
        >
            <div className="space-y-0.5">
                <div
                    className={
                        compact
                            ? 'font-mono text-[11px] text-purple-300 break-all'
                            : 'font-mono text-xs text-purple-700 break-all'
                    }
                >
                    {linkage.id}
                </div>
                {linkage.name && linkage.name !== linkage.id && (
                    <div
                        className={
                            compact
                                ? 'text-gray-200 text-sm leading-tight'
                                : 'text-gray-900 text-sm font-medium'
                        }
                    >
                        {linkage.name}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 text-[11px]">
                <span className={compact ? 'text-gray-400' : 'text-gray-500'}>Тип</span>
                <span className={compact ? 'text-blue-300' : 'text-gray-800'}>
                    {typeLabel}, {dir}
                </span>
            </div>

            <div
                className={
                    compact
                        ? 'border-t border-gray-700 pt-2 space-y-1 text-[11px]'
                        : 'border-t border-gray-200 pt-2 space-y-1 text-[11px]'
                }
            >
                <div className={compact ? 'text-gray-500' : 'text-gray-400 uppercase text-[10px] tracking-wide'}>
                    Направление
                </div>
                <div className={compact ? 'text-gray-300' : 'text-gray-700'}>
                    {side1Name}
                    <span className="mx-1 text-gray-500">{linkage.undirected ? '↔' : '→'}</span>
                    {side2Name}
                </div>
            </div>

            {linkage.description && (
                <div
                    className={
                        compact
                            ? 'border-t border-gray-700 pt-2 text-[11px] text-gray-300 leading-snug'
                            : 'text-xs text-gray-600 leading-snug'
                    }
                >
                    {linkage.description}
                </div>
            )}

            {attrs.length > 0 && (
                <div
                    className={
                        compact
                            ? 'border-t border-gray-700 pt-2 space-y-1'
                            : 'border-t border-gray-200 pt-2 space-y-1'
                    }
                >
                    <div
                        className={
                            compact
                                ? 'text-[10px] uppercase tracking-wide text-gray-500'
                                : 'text-xs uppercase tracking-wide text-gray-400'
                        }
                    >
                        Атрибуты связи ({attrs.length})
                    </div>
                    {attrs.slice(0, compact ? 6 : attrs.length).map(a => (
                        <div
                            key={a.id}
                            className={
                                compact
                                    ? 'flex items-center justify-between gap-2 text-[11px]'
                                    : 'flex items-center justify-between gap-2 text-[11px] py-0.5'
                            }
                        >
                            <span className={compact ? 'text-gray-300' : 'text-gray-700'}>
                                {a.name ?? a.id}
                            </span>
                            <span
                                className={
                                    compact
                                        ? 'font-mono text-gray-500 text-[10px]'
                                        : 'font-mono text-gray-400 text-[10px]'
                                }
                            >
                                {a.dataType}
                            </span>
                        </div>
                    ))}
                    {compact && attrs.length > 6 && (
                        <div className="text-[10px] text-gray-500 italic">
                            и ещё {attrs.length - 6}...
                        </div>
                    )}
                </div>
            )}

            {compact && (
                <div className="border-t border-gray-700 pt-2 text-[10px] text-gray-500 leading-snug">
                    В RQL: <code className="text-purple-300">@link_{linkage.id}</code>
                    <br />
                    Ctrl+клик — скопировать ID
                </div>
            )}
        </div>
    );
}

function resolveEntityLabel(
    table: ReturnType<typeof useSchemaStore.getState>['symbolTable'],
    linkage: ResolvedLinkage,
    side: string,
): string {
    if (!table) return side;
    const fqid = side.includes('/') ? side : `${linkage.domain}/${side}`;
    const entity = table.entities.get(fqid);
    return entity?.entity.name ?? side;
}