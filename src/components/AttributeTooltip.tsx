import type { Attribute, Constraint, DomainSchema } from '../schema/types';
import { SYSTEM_ATTRIBUTES } from '../schema/system-attributes';
import type { ResolvedAttribute } from '../schema/symbol-table';
import { useSchemaStore } from '../store/useSchemaStore';

const SYSTEM_IDS = new Set(SYSTEM_ATTRIBUTES.map(a => a.id));

interface Props {
    attr: ResolvedAttribute;
    /** FQID сущности, которой принадлежит атрибут */
    entityFqid?: string;
    /** Компактный режим для тултипа, полный — для инспектора */
    compact?: boolean;
}

export function AttributeTooltip({ attr, entityFqid, compact = false }: Props) {
    const isSystem = SYSTEM_IDS.has(attr.id);
    const flags = collectFlags(attr);
    const dataRules = useApplicableDataRules(attr, entityFqid);

    return (
        <div
            className={
                compact
                    ? 'w-72 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl p-3 space-y-2'
                    : 'space-y-4'
            }
        >
            <Header attr={attr} isSystem={isSystem} compact={compact} />
            <TypeBlock attr={attr} compact={compact} />
            {attr.inheritedFrom && (
                <InheritedBlock attr={attr} compact={compact} />
            )}
            {flags.length > 0 && <FlagsBlock flags={flags} compact={compact} />}
            {attr.description && (
                <DescriptionBlock text={attr.description} compact={compact} />
            )}
            {dataRules.length > 0 && (
                <DataRulesBlock rules={dataRules} compact={compact} />
            )}
            {compact && (
                <div className="border-t border-gray-700 pt-2 text-[10px] text-gray-500 leading-snug">
                    В RQL: <code className="text-amber-300">@doc.{attr.id}</code>
                    <br />
                    Ctrl+клик — скопировать ID
                </div>
            )}
        </div>
    );
}

// --- Блоки ---------------------------------------------------------------

function Header({
    attr,
    isSystem,
    compact,
}: {
    attr: ResolvedAttribute;
    isSystem: boolean;
    compact: boolean;
}) {
    return (
        <div className="space-y-0.5">
            <div
                className={
                    compact
                        ? 'font-mono text-[11px] text-amber-300 break-all'
                        : 'font-mono text-xs text-blue-700 break-all'
                }
            >
                {attr.id}
            </div>
            {attr.name && attr.name !== attr.id && (
                <div
                    className={
                        compact
                            ? 'text-gray-200 text-sm leading-tight'
                            : 'text-gray-900 text-sm font-medium'
                    }
                >
                    {attr.name}
                </div>
            )}
            {isSystem && (
                <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    системный атрибут
                </div>
            )}
        </div>
    );
}

function TypeBlock({
    attr,
    compact,
}: {
    attr: ResolvedAttribute;
    compact: boolean;
}) {
    return (
        <div className="flex items-center gap-2 text-[11px]">
            <span className={compact ? 'text-gray-400' : 'text-gray-500'}>Тип</span>
            <span
                className={
                    compact
                        ? 'font-mono text-blue-300'
                        : 'font-mono text-xs text-gray-800'
                }
            >
                {attr.dataType}
            </span>
        </div>
    );
}

function InheritedBlock({
    attr,
    compact,
}: {
    attr: ResolvedAttribute;
    compact: boolean;
}) {
    return (
        <div
            className={
                compact
                    ? 'text-[11px] text-gray-400'
                    : 'text-[11px] text-gray-500 italic'
            }
        >
            Унаследован от{' '}
            <span className={compact ? 'font-mono text-gray-300' : 'font-mono'}>
                {attr.inheritedFrom!.split('/').pop()}
            </span>
        </div>
    );
}

interface FlagInfo {
    icon: string;
    iconClass: string;
    text: string;
    textClass: string;
}

function FlagsBlock({
    flags,
    compact,
}: {
    flags: FlagInfo[];
    compact: boolean;
}) {
    return (
        <div
            className={
                compact
                    ? 'border-t border-gray-700 pt-2 space-y-1'
                    : 'border-t border-gray-200 pt-2 space-y-1'
            }
        >
            {!compact && (
                <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Флаги и ограничения
                </div>
            )}
            {flags.map((f, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className={f.iconClass}>{f.icon}</span>
                    <span className={compact ? f.textClass : 'text-gray-700'}>
                        {f.text}
                    </span>
                </div>
            ))}
        </div>
    );
}

function DescriptionBlock({
    text,
    compact,
}: {
    text: string;
    compact: boolean;
}) {
    return (
        <div
            className={
                compact
                    ? 'border-t border-gray-700 pt-2 text-[11px] text-gray-300 leading-snug'
                    : 'text-xs text-gray-600 leading-snug'
            }
        >
            {text}
        </div>
    );
}

interface ApplicableRule {
    id: string;
    name?: string;
    effect?: string;
    message?: string;
}

function DataRulesBlock({
    rules,
    compact,
}: {
    rules: ApplicableRule[];
    compact: boolean;
}) {
    return (
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
                Правила данных
            </div>
            {rules.map(r => (
                <div key={r.id} className="text-[11px] leading-snug">
                    <div className={compact ? 'text-gray-200' : 'text-gray-800'}>
                        {r.name ?? r.id}
                        {r.effect && (
                            <span
                                className={
                                    compact
                                        ? 'ml-1 text-purple-300'
                                        : 'ml-1 text-purple-700 font-mono text-[10px]'
                                }
                            >
                                [{r.effect}]
                            </span>
                        )}
                    </div>
                    {r.message && (
                        <div
                            className={
                                compact ? 'text-gray-400 text-[10px]' : 'text-gray-500 text-[10px]'
                            }
                        >
                            {r.message}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// --- Правила данных ------------------------------------------------------

function useApplicableDataRules(
    attr: ResolvedAttribute,
    entityFqid: string | undefined,
): ApplicableRule[] {
    const domains = useSchemaStore(s => s.domains);

    if (!entityFqid) return [];

    const [domainId, entityId] = entityFqid.split('/');
    const domain = domains.find(d => d.id === domainId);
    if (!domain?.dataRules) return [];

    const result: ApplicableRule[] = [];
    for (const rule of domain.dataRules) {
        if (!rule.entity || rule.entity !== entityId) continue;

        // Правило на конкретный атрибут
        if (rule.attribute) {
            if (rule.attribute !== attr.id) continue;
            result.push({
                id: rule.id,
                name: rule.name,
                effect: rule.rule?.effect,
                message: rule.message,
            });
            continue;
        }

        // Правило на всю сущность — проверяем, что атрибут в списке
        const ruleAttrs = rule.rule?.attributes;
        if (ruleAttrs) {
            const found = ruleAttrs.find(a => a.attribute === attr.id);
            if (found) {
                result.push({
                    id: rule.id,
                    name: rule.name,
                    effect: rule.rule?.effect,
                    message: found.message ?? rule.message,
                });
            }
        }
    }

    return result;
}

// --- Сбор флагов --------------------------------------------------------

function collectFlags(attr: Attribute & { inheritedFrom?: string }): FlagInfo[] {
    const flags: FlagInfo[] = [];

    if (attr.readonly) {
        flags.push({
            icon: '🔒',
            iconClass: '',
            text: 'Только для чтения',
            textClass: 'text-amber-300',
        });
    }

    for (const c of attr.constraints ?? []) {
        const info = describeConstraint(c);
        if (info) flags.push(info);
    }

    return flags;
}

function describeConstraint(c: Constraint): FlagInfo | null {
    switch (c.kind) {
        case 'required':
            return { icon: '●', iconClass: 'text-red-400', text: 'Обязательное поле', textClass: 'text-red-300' };
        case 'unique':
            return { icon: '◈', iconClass: 'text-purple-400', text: 'Уникальное значение', textClass: 'text-purple-300' };
        case 'range':
            return { icon: '↔', iconClass: 'text-blue-400', text: `Диапазон: ${formatRange(c.min, c.max)}`, textClass: 'text-blue-300' };
        case 'length':
            return { icon: '↔', iconClass: 'text-blue-400', text: `Длина: ${formatRange(c.min, c.max)} символов`, textClass: 'text-blue-300' };
        case 'size':
            return { icon: '↔', iconClass: 'text-blue-400', text: `Размер файла: ${formatSizeRange(c.min, c.max)}`, textClass: 'text-blue-300' };
        case 'regexp':
            return { icon: '⌘', iconClass: 'text-teal-400', text: `Шаблон: ${c.regexp ?? '—'}`, textClass: 'text-teal-300' };
        case 'mime_types':
            return { icon: '☰', iconClass: 'text-teal-400', text: `Типы файлов: ${(c.mimeTypes ?? []).join(', ')}`, textClass: 'text-teal-300' };
        default:
            return null;
    }
}

function formatRange(min?: number, max?: number): string {
    if (min !== undefined && max !== undefined) return `${min} … ${max}`;
    if (min !== undefined) return `≥ ${min}`;
    if (max !== undefined) return `≤ ${max}`;
    return 'без границ';
}

function formatSizeRange(min?: number, max?: number): string {
    const fmt = (n: number) =>
        n >= 1024 * 1024
            ? `${(n / 1024 / 1024).toFixed(1)} МБ`
            : n >= 1024
                ? `${(n / 1024).toFixed(0)} КБ`
                : `${n} Б`;

    if (min !== undefined && max !== undefined) return `${fmt(min)} … ${fmt(max)}`;
    if (min !== undefined) return `≥ ${fmt(min)}`;
    if (max !== undefined) return `до ${fmt(max)}`;
    return 'без ограничений';
}