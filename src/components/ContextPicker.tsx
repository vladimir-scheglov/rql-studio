import { useSchemaStore } from '../store/useSchemaStore';
import { useEditorStore } from '../store/useEditorStore';

export function ContextPicker() {
    const symbolTable = useSchemaStore(s => s.symbolTable);
    const context = useEditorStore(s => s.context);
    const setContext = useEditorStore(s => s.setContext);

    if (!symbolTable) return null;

    const allEntities = [...symbolTable.entities.values()];

    return (
        <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
                <span className="text-gray-600">Сущность:</span>
                <select
                    className="border border-gray-300 rounded px-2 py-1"
                    value={'entityFqid' in context ? context.entityFqid : ''}
                    onChange={e => setContext({ kind: 'free', entityFqid: e.target.value })}
                >
                    <option value="">— не выбрано —</option>
                    {allEntities.map(e => (
                        <option key={e.fqid} value={e.fqid}>
                            {e.domain}/{e.entity.id}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex items-center gap-2">
                <span className="text-gray-600">Контекст:</span>
                <select
                    className="border border-gray-300 rounded px-2 py-1"
                    value={context.kind}
                    onChange={e => {
                        const kind = e.target.value as typeof context.kind;
                        if (kind === 'condition' && 'entityFqid' in context) {
                            setContext({ kind: 'condition', entityFqid: context.entityFqid! });
                        } else if (kind === 'free') {
                            setContext({ kind: 'free', entityFqid: 'entityFqid' in context ? context.entityFqid : undefined });
                        }
                    }}
                >
                    <option value="free">Свободный запрос</option>
                    <option value="condition">condition (dataRules)</option>
                    <option value="constraint">constraint (dataRules)</option>
                    <option value="expression">expression (dataRules)</option>
                    <option value="policy">Политика доступа</option>
                </select>
            </label>
        </div>
    );
}