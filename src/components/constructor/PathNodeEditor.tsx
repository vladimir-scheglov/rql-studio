import { useState } from 'react';
import { useSchemaStore } from '../../store/useSchemaStore';
import { usePathBuilderStore } from '../../store/usePathBuilderStore';
import type { PathNode } from '../../constructor/types';
import { IconLayoutHorizontal } from '../icons';

interface Props {
    node: PathNode;
    onChange: (n: PathNode) => void;
}

export function PathNodeEditor({ node, onChange }: Props) {
    const [expanded, setExpanded] = useState(false);

    const table = useSchemaStore(s => s.symbolTable);
    const openForNode = usePathBuilderStore(s => s.openForNode);

    const startEntity = node.path.startEntityFqid
        ? table?.entities.get(node.path.startEntityFqid)
        : undefined;
    const startName = startEntity?.entity.name ?? startEntity?.entity.id ?? '—';

    const targetEntityFqid =
        node.path.steps.length > 0
            ? node.path.steps[node.path.steps.length - 1].toEntityFqid
            : '';
    const targetEntity = targetEntityFqid
        ? table?.entities.get(targetEntityFqid)
        : undefined;
    const targetName = targetEntity?.entity.name ?? targetEntity?.entity.id ?? '—';

    const isEmpty = node.path.steps.length === 0;

    return (
        <div className="bg-white border border-purple-200 rounded px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
                <span className="text-xs text-purple-700 font-medium">
                    Цепочка связей:
                </span>

                <span className="text-xs text-gray-700">
                    {startName}
                    {!isEmpty && (
                        <>
                            {' '}
                            <span className="text-gray-400">→</span>{' '}
                            {targetName}
                        </>
                    )}
                </span>

                <span className="text-[10px] text-gray-400">
                    ({node.path.steps.length} {pluralSteps(node.path.steps.length)})
                </span>

                <button
                    onClick={() => openForNode(node.id, node.path)}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
                    title="Открыть в построителе путей"
                >
                    <IconLayoutHorizontal className="w-3 h-3" />
                    Изменить
                </button>
            </div>

            {isEmpty && (
                <div className="text-[11px] text-gray-400 italic">
                    Путь пуст. Нажмите «Изменить», чтобы выбрать сущности и шаги.
                </div>
            )}

            {!isEmpty && node.cachedRql && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="w-full flex items-start gap-2 text-left text-[10px] font-mono text-gray-500 bg-gray-50 rounded px-2 py-1 hover:bg-gray-100 transition-colors"
                    title={expanded ? 'Свернуть RQL' : 'Показать полный RQL'}
                >
                    <span className="text-gray-400 shrink-0 mt-0.5">
                        {expanded ? '▾' : '▸'}
                    </span>
                    {expanded ? (
                        <pre className="flex-1 whitespace-pre-wrap break-words text-gray-700 leading-snug max-h-40 overflow-auto">
                            {node.cachedRql}
                        </pre>
                    ) : (
                        <span className="flex-1 truncate">
                            {node.cachedRql.split('\n')[0]}…
                        </span>
                    )}
                </button>
            )}
        </div>
    );
}

function pluralSteps(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'шаг';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'шага';
    return 'шагов';
}