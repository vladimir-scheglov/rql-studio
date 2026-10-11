import { Handle, Position, type NodeProps } from '@xyflow/react';
import { IconGrid } from '../icons';

export interface EntityNodeData {
    label: string;
    fqid: string;
    domainId: string;
    attributesCount: number;
    isActive: boolean;
    [key: string]: unknown; // React Flow требует index signature
}

export function EntityNode({ data, selected }: NodeProps) {
    const d = data as EntityNodeData;

    return (
        <div
            className={`rounded-lg border-2 bg-white shadow-sm transition-all min-w-[200px] max-w-[240px] ${selected
                    ? 'border-blue-500 shadow-md'
                    : d.isActive
                        ? 'border-blue-300'
                        : 'border-gray-300 hover:border-gray-400'
                }`}
        >
            {/* Handles для рёбер со всех сторон */}
            <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-1.5 !h-1.5 !border-0" />
            <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-1.5 !h-1.5 !border-0" />
            <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-1.5 !h-1.5 !border-0" id="top-target" />
            <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-1.5 !h-1.5 !border-0" id="bottom-source" />

            <div className="px-3 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <IconGrid className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <div className="text-sm font-medium text-gray-900 truncate" title={d.label}>
                        {d.label}
                    </div>
                </div>
                <div className="text-[10px] font-mono text-gray-400 truncate" title={d.fqid}>
                    {d.fqid}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                    Атрибутов: {d.attributesCount}
                </div>
            </div>
        </div>
    );
}