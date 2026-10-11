import { useMemo } from 'react';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { resolveEntityFqid } from '../../schema/symbol-table';
import type { ResolvedLinkage } from '../../schema/symbol-table';
import { generateFakeObject } from '../../simulator/generate';
import { showToast } from '../Toast';

interface Props {
    entityFqid: string;
}

export function LinkagesEditor({ entityFqid }: Props) {
    const table = useSchemaStore(s => s.symbolTable);
    const context = useEditorStore(s => s.context);
    const linkages = useSimulatorStore(s => s.linkages);
    const updateLinkageValue = useSimulatorStore(s => s.updateLinkageValue);
    const removeLinkage = useSimulatorStore(s => s.removeLinkage);
    const setLinkages = useSimulatorStore(s => s.setLinkages);

    const fillAll = () => {
        if (!table) return;
        const next: Record<string, Record<string, any>> = { ...linkages };
        let count = 0;

        for (const linkage of applicable) {
            const side1Fqid = resolveEntityFqid(linkage.side1, linkage.domain, table);
            const side2Fqid = resolveEntityFqid(linkage.side2, linkage.domain, table);
            const isSide1 = side1Fqid === entityFqid;
            const otherSideFqid = isSide1 ? side2Fqid : side1Fqid;

            const targetEntity = otherSideFqid ? table.entities.get(otherSideFqid) : undefined;
            if (targetEntity) {
                const entityAlias = `@e_${linkage.id}`;
                const existing = next[entityAlias] ?? {};
                const fake = generateFakeObject(targetEntity, table);
                next[entityAlias] = { ...fake, ...existing };
                count++;
            }
        }

        setLinkages(next);
        showToast(`Заполнено связей: ${count}`);
    };

    // Собираем все связи, где участвует наша сущность
    const applicable = useMemo<ResolvedLinkage[]>(() => {
        if (!table) return [];
        const result: ResolvedLinkage[] = [];
        for (const linkage of table.linkages.values()) {
            const s1 = resolveEntityFqid(linkage.side1, linkage.domain, table);
            const s2 = resolveEntityFqid(linkage.side2, linkage.domain, table);
            if (s1 === entityFqid || s2 === entityFqid) {
                result.push(linkage);
            }
        }
        return result;
    }, [table, entityFqid]);

    if (!table) return null;

    if (applicable.length === 0) {
        return (
            <div className="p-4 text-xs text-gray-400 italic text-center">
                У этой сущности нет связей
            </div>
        );
    }

    return (
        <div className="p-3 space-y-3">
            <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-gray-500 leading-relaxed">
                    Укажите значения связанных объектов...
                </div>
                <button
                    onClick={fillAll}
                    className="text-[10px] px-2 py-0.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
                    title="Заполнить все связи значениями по типу"
                >
                    Заполнить все
                </button>
            </div>
            
            <div className="text-[10px] text-gray-500 leading-relaxed">
                Укажите значения связанных объектов, чтобы правила со ссылками
                (<code className="text-blue-700">@e_X.attr</code>,{' '}
                <code className="text-blue-700">@link_X.attr</code>) работали корректно.
            </div>

            {applicable.map(linkage => (
                <LinkageCard
                    key={linkage.fqid}
                    linkage={linkage}
                    entityFqid={entityFqid}
                    values={linkages}
                    onUpdate={updateLinkageValue}
                    onRemove={removeLinkage}
                />
            ))}
        </div>
    );
}

// =========================================================================

function LinkageCard({
    linkage,
    entityFqid,
    values,
    onUpdate,
    onRemove,
}: {
    linkage: ResolvedLinkage;
    entityFqid: string;
    values: Record<string, Record<string, any>>;
    onUpdate: (alias: string, attrId: string, value: any) => void;
    onRemove: (alias: string) => void;
}) {
    const table = useSchemaStore(s => s.symbolTable);
    if (!table) return null;

    const side1Fqid = resolveEntityFqid(linkage.side1, linkage.domain, table);
    const side2Fqid = resolveEntityFqid(linkage.side2, linkage.domain, table);

    // Определяем, на какой стороне наша сущность
    const isSide1 = side1Fqid === entityFqid;
    const otherSideFqid = isSide1 ? side2Fqid : side1Fqid;

    // Псевдонимы, которые мы можем задавать
    const entityAlias = `@e_${linkage.id}`;
    const linkageAlias = `@link_${linkage.id}`;

    const entityValues = values[entityAlias] ?? {};
    const linkageValues = values[linkageAlias] ?? {};

    // Атрибуты связанной сущности
    const targetEntity = otherSideFqid ? table.entities.get(otherSideFqid) : undefined;
    const targetAttrs = targetEntity ? [...targetEntity.attributes.values()] : [];

    // Атрибуты связи (только пользовательские + системные, но без side1/side2)
    const linkageAttrs = (linkage.attributes ?? []).filter(
        a => !['side1', 'side2'].includes(a.id),
    );

    const hasAnyValue =
        Object.keys(entityValues).length > 0 ||
        Object.keys(linkageValues).length > 0;

    return (
        <div
            className={`border rounded-lg overflow-hidden ${hasAnyValue ? 'border-purple-300' : 'border-gray-200'
                }`}
        >
            {/* Заголовок */}
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-gray-800 truncate">
                        {linkage.name ?? linkage.id}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                        <span>
                            ты на стороне <strong>{isSide1 ? '1' : '2'}</strong>
                        </span>
                        {targetEntity && (
                            <>
                                <span>·</span>
                                <span>
                                    связанный:{' '}
                                    <strong className="text-gray-600">
                                        {targetEntity.entity.name ?? targetEntity.entity.id}
                                    </strong>
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {hasAnyValue && (
                    <button
                        onClick={() => {
                            onRemove(entityAlias);
                            onRemove(linkageAlias);
                        }}
                        className="text-[10px] text-gray-400 hover:text-red-600"
                        title="Очистить значения связи"
                    >
                        очистить
                    </button>
                )}
            </div>

            {/* Связанная сущность */}
            {targetAttrs.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-100">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1.5 flex items-center gap-1">
                        <span>Связанный объект</span>
                        <code className="text-blue-600 normal-case tracking-normal">
                            {entityAlias}
                        </code>
                    </div>
                    <div className="space-y-1">
                        {targetAttrs.slice(0, 6).map(attr => (
                            <LinkageAttributeRow
                                key={attr.id}
                                attr={attr}
                                value={entityValues[attr.id]}
                                onChange={v => onUpdate(entityAlias, attr.id, v)}
                            />
                        ))}
                        {targetAttrs.length > 6 && (
                            <div className="text-[10px] text-gray-400 italic">
                                и ещё {targetAttrs.length - 6}...
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Атрибуты связи */}
            {linkageAttrs.length > 0 && (
                <div className="px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1.5 flex items-center gap-1">
                        <span>Атрибуты связи</span>
                        <code className="text-blue-600 normal-case tracking-normal">
                            {linkageAlias}
                        </code>
                    </div>
                    <div className="space-y-1">
                        {linkageAttrs.map(attr => (
                            <LinkageAttributeRow
                                key={attr.id}
                                attr={attr}
                                value={linkageValues[attr.id]}
                                onChange={v => onUpdate(linkageAlias, attr.id, v)}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// =========================================================================

function LinkageAttributeRow({
    attr,
    value,
    onChange,
}: {
    attr: { id: string; name?: string; dataType: string };
    value: any;
    onChange: (v: any) => void;
}) {
    const isSet = value !== undefined && value !== null && value !== '';

    return (
        <div className="flex items-center gap-2">
            <label
                className={`text-[11px] flex-1 truncate ${isSet ? 'text-gray-800' : 'text-gray-500'
                    }`}
                title={attr.name ?? attr.id}
            >
                {attr.name ?? attr.id}
                <code className="text-[9px] text-gray-400 ml-1">{attr.id}</code>
            </label>
            <input
                type="text"
                value={value ?? ''}
                onChange={e => onChange(e.target.value || undefined)}
                placeholder="—"
                className={`text-[11px] px-2 py-0.5 border rounded w-32 focus:outline-none focus:border-blue-400 ${isSet ? 'border-purple-300 bg-white' : 'border-gray-200 bg-gray-50'
                    }`}
            />
        </div>
    );
}