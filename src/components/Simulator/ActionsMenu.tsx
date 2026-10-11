import { useState } from 'react';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { showToast } from '../Toast';
import { Popover } from './Popover';
import { IconMore } from '../icons';
import { generateFakeObject } from '../../simulator/generate';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useEditorStore } from '../../store/useEditorStore';

interface Props {
    onCompare: () => void;
    onPlaybook: () => void;
}

export function ActionsMenu({ onCompare, onPlaybook }: Props) {
    const table = useSchemaStore(s => s.symbolTable);
    const context = useEditorStore(s => s.context);
    const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';

    const setObjectJson = useSimulatorStore(s => s.setObjectJson);

    const generateFake = () => {
        if (!table || !entityFqid) return;
        const entity = table.entities.get(entityFqid);
        if (!entity) return;
        const fake = generateFakeObject(entity, table);
        setObjectJson(JSON.stringify(fake, null, 2));
        showToast('Сгенерирован пример объекта');
    };

    const clearObject = () => {
        setObjectJson('{\n  \n}');
    };

    return (
        <Popover
            width={240}
            align="left"
            trigger={(open) => (
                <div
                    className={`inline-flex items-center justify-center w-8 h-8 rounded border transition-colors ${open
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                    title="Дополнительные действия"
                >
                    <IconMore className="w-4 h-4" />
                </div>
            )}
        >
            {(close) => (
                <div className="py-1">
                    <MenuItem
                        icon="✨"
                        onClick={() => {
                            generateFake();
                            close();
                        }}
                    >
                        Сгенерировать пример
                    </MenuItem>

                    <MenuItem
                        icon="🧹"
                        onClick={() => {
                            clearObject();
                            close();
                        }}
                    >
                        Очистить JSON
                    </MenuItem>

                    <div className="my-1 border-t border-gray-100" />

                    <MenuItem
                        icon="⚖"
                        onClick={() => {
                            onCompare();
                            close();
                        }}
                    >
                        Сравнить сценарии
                    </MenuItem>

                    <MenuItem
                        icon="📖"
                        onClick={() => {
                            onPlaybook();
                            close();
                        }}
                    >
                        Плейбуки
                    </MenuItem>
                </div>
            )}
        </Popover>
    );
}

function MenuItem({
    icon,
    onClick,
    children,
}: {
    icon: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
        >
            <span className="w-4 text-center text-sm opacity-70">{icon}</span>
            {children}
        </button>
    );
}