import type { NodeProps } from '@xyflow/react';

export interface DomainGroupData {
    label: string;
    domainId: string;
    [key: string]: unknown;
}

export function DomainGroupNode({ data }: NodeProps) {
    const d = data as DomainGroupData;
    return (
        <div className="w-full h-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/30 relative">
            <div className="absolute top-0 left-0 px-3 py-1 bg-gray-200 rounded-tl-xl rounded-br-lg text-[11px] font-medium text-gray-700">
                {d.label}
            </div>
        </div>
    );
}