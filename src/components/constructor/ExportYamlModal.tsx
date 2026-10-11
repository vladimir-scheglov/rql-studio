import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useConstructorStore } from '../../store/useConstructorStore';
import { buildDataRuleYaml, type DataRuleEffect } from '../../constructor/export-yaml';
import { IconX, IconCheck } from '../icons';
import { showToast } from '../Toast';
import { useCurrentRuleStore } from '../../store/useCurrentRuleStore';

interface Props {
    onClose: () => void;
}

const EFFECTS: { id: DataRuleEffect; label: string; hint: string }[] = [
    { id: 'required', label: 'required', hint: 'Сделать поле обязательным' },
    { id: 'hidden', label: 'hidden', hint: 'Скрыть поле' },
    { id: 'readonly', label: 'readonly', hint: 'Запретить редактирование' },
    { id: 'default', label: 'default', hint: 'Подставить значение по умолчанию' },
    { id: 'allowed', label: 'allowed', hint: 'Ограничить допустимые значения' },
];

export function ExportYamlModal({ onClose }: Props) {
    const root = useConstructorStore(s => s.root);
    const table = useSchemaStore(s => s.symbolTable);
    const domain = useSchemaStore(s => s.activeDomainId ?? '');
    const context = useEditorStore(s => s.context);

    const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';
    const entity = entityFqid ? table?.entities.get(entityFqid) : undefined;

    const currentEffect = useCurrentRuleStore(s => s.currentEffect);
    const currentRuleId = useCurrentRuleStore(s => s.currentRuleId);

    const [id, setId] = useState(() => currentRuleId ?? `rule_${Date.now().toString(36).slice(-6)}`);
    const [effect, setEffect] = useState<DataRuleEffect>(currentEffect ?? 'required');
    const [name, setName] = useState('');
    const [attribute, setAttribute] = useState('');
    const [message, setMessage] = useState('');
    const [help, setHelp] = useState('');

    const attributes = useMemo(
        () => (entity ? [...entity.attributes.values()] : []),
        [entity],
    );

    const yaml = useMemo(() => {
        if (!table || !domain || !entityFqid) return '';
        return buildDataRuleYaml(root, table, domain, entityFqid, {
            id,
            name: name || undefined,
            effect,
            attribute: attribute || undefined,
            message: message || undefined,
            help: help || undefined,
        });
    }, [root, table, domain, entityFqid, id, name, effect, attribute, message, help]);

    // Закрытие по Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(yaml);
            showToast('YAML скопирован');
            onClose();
        } catch {
            const ta = document.createElement('textarea');
            ta.value = yaml;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('YAML скопирован');
            onClose();
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-[860px] max-w-[95vw] max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <h2 className="font-medium text-gray-900">Экспорт в YAML</h2>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>

                {/* Body: две колонки */}
                <div className="flex-1 flex min-h-0">
                    {/* Форма */}
                    <div className="w-96 border-r border-gray-200 p-5 space-y-4 overflow-auto">
                        <Field label="ID правила" required>
                            <input
                                type="text"
                                value={id}
                                onChange={e => setId(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                            />
                        </Field>

                        <Field label="Название" hint="Отображается в интерфейсе">
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Например: Тема обязательна для закрытых"
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                            />
                        </Field>

                        <Field label="Эффект" required>
                            <select
                                value={effect}
                                onChange={e => setEffect(e.target.value as DataRuleEffect)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                            >
                                {EFFECTS.map(e => (
                                    <option key={e.id} value={e.id} title={e.hint}>
                                        {e.label} — {e.hint}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Атрибут" hint="Пусто — правило применяется к сущности целиком">
                            <select
                                value={attribute}
                                onChange={e => setAttribute(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                            >
                                <option value="">— вся сущность —</option>
                                {attributes.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {a.name ?? a.id} ({a.id})
                                    </option>
                                ))}
                            </select>
                        </Field>

                        {attribute && (
                            <>
                                <Field label="Сообщение об ошибке" hint="Показывается при нарушении правила">
                                    <input
                                        type="text"
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        placeholder="Например: Укажите тему"
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                                    />
                                </Field>

                                <Field label="Справка" hint="Показывается при наведении на иконку">
                                    <input
                                        type="text"
                                        value={help}
                                        onChange={e => setHelp(e.target.value)}
                                        placeholder="Например: Тема обязательна для всех инцидентов"
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                                    />
                                </Field>
                            </>
                        )}
                    </div>

                    {/* Превью */}
                    <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
                        <div className="px-4 py-2 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 font-medium">
                            YAML
                        </div>
                        <pre className="flex-1 p-4 text-xs font-mono whitespace-pre-wrap break-all overflow-auto text-gray-800">
                            {yaml || '—'}
                        </pre>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={copy}
                        disabled={!yaml}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
                    >
                        <IconCheck className="w-3.5 h-3.5" />
                        Скопировать
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function Field({
    label,
    hint,
    required,
    children,
}: {
    label: string;
    hint?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
            {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
        </div>
    );
}