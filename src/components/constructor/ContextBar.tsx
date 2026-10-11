import { useCurrentRuleStore } from '../../store/useCurrentRuleStore';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useConstructorStore } from '../../store/useConstructorStore';
import { useEditorStore } from '../../store/useEditorStore';
import { serializeCondition } from '../../constructor/serialize';
import { useMemo } from 'react';

export function ContextBar() {
    const currentRuleId = useCurrentRuleStore(s => s.currentRuleId);
    const activeDomainId = useSchemaStore(s => s.activeDomainId);
    const table = useSchemaStore(s => s.symbolTable);
    const root = useConstructorStore(s => s.root);
    const editorRql = useEditorStore(s => s.value);

    const hasUnsavedChanges = useMemo(() => {
        if (!table || !currentRuleId) return false;
        const rql = serializeCondition(root, table).trim();
        const prefixed = rql.startsWith('!rql') ? rql : `!rql ${rql}`;
        const currentEditor = editorRql.trim();
        return prefixed !== currentEditor && prefixed !== '!rql';
    }, [table, root, editorRql, currentRuleId]);

    const nothingToShow = !currentRuleId && !activeDomainId;
    if (nothingToShow) return null;

    return (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 shrink-0">
            {currentRuleId ? (
                <>
                    <span className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-emerald-600">
                            <path d="M2 1.5 H8 L10 3.5 V10.5 H2 Z" strokeLinejoin="round" />
                            <path d="M4 1.5 V4.5 H8 V1.5" strokeLinejoin="round" />
                        </svg>
                        <span>Правило:</span>
                        <code className="font-mono text-emerald-700">{currentRuleId}</code>
                    </span>
                    <span className="text-gray-300">·</span>
                </>
            ) : null}

            {activeDomainId ? (
                <>
                    <span>Домен:</span>
                    <code className="font-mono">{activeDomainId}</code>
                </>
            ) : null}

            <div className="ml-auto flex items-center gap-1.5">
                {hasUnsavedChanges ? (
                    <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="text-amber-600">Не сохранено</span>
                    </>
                ) : currentRuleId ? (
                    <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-emerald-600">Синхронизировано</span>
                    </>
                ) : null}
            </div>
        </div>
    );
}