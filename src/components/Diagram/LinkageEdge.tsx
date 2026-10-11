import {
    BaseEdge,
    EdgeLabelRenderer,
    getSmoothStepPath,
    type EdgeProps,
} from '@xyflow/react';

export interface LinkageEdgeData {
    label: string;
    type: '1_1' | '1_n' | 'n_n';
    undirected: boolean;
    linkageId: string;
    [key: string]: unknown;
}

export function LinkageEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
    style,
    selected,
}: EdgeProps) {
    const d = data as LinkageEdgeData | undefined;

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const typeLabel =
        d?.type === '1_1' ? '1:1'
            : d?.type === '1_n' ? '1:N'
                : d?.type === 'n_n' ? 'N:N'
                    : '';

    // Цвета по типу связи
    const colorByType = {
        '1_1': '#10b981',   // зелёный
        '1_n': '#3b82f6',   // синий
        'n_n': '#f59e0b',   // оранжевый
    } as const;

    const strokeColor = selected
        ? '#2563eb'
        : d?.type
            ? colorByType[d.type]
            : '#94a3b8';

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={d?.undirected ? undefined : markerEnd}
                style={{
                    ...style,
                    stroke: strokeColor,
                    strokeWidth: selected ? 2.5 : 1.8,
                }}
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                >
                    <div
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded bg-white border shadow-sm ${selected
                                ? 'border-blue-400 text-blue-700'
                                : 'border-gray-300 text-gray-600'
                            }`}
                        style={{ borderColor: selected ? undefined : strokeColor }}
                        title={d?.label}
                    >
                        {typeLabel}
                        {d?.undirected ? ' ↔' : ' →'}
                    </div>
                </div>
            </EdgeLabelRenderer>
        </>
    );
}