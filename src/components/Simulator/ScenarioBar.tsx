import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { useSimulatorScenariosStore } from '../../store/useSimulatorScenariosStore';
import { showToast } from '../Toast';
import { IconPlus, IconMore } from '../icons';

export function ScenarioBar() {
    const objectJson = useSimulatorStore(s => s.objectJson);
    const currentUser = useSimulatorStore(s => s.currentUser);
    const currentDate = useSimulatorStore(s => s.currentDate);
    const selectedRuleIds = useSimulatorStore(s => s.selectedRuleIds);
    const setObjectJson = useSimulatorStore(s => s.setObjectJson);
    const setCurrentUser = useSimulatorStore(s => s.setCurrentUser);
    const setCurrentDate = useSimulatorStore(s => s.setCurrentDate);
    const selectAllRules = useSimulatorStore(s => s.selectAllRules);

    const scenarios = useSimulatorScenariosStore(s => s.scenarios);
    const activeId = useSimulatorScenariosStore(s => s.activeScenarioId);
    const saveScenario = useSimulatorScenariosStore(s => s.saveScenario);
    const updateScenario = useSimulatorScenariosStore(s => s.updateScenario);
    const deleteScenario = useSimulatorScenariosStore(s => s.deleteScenario);
    const duplicateScenario = useSimulatorScenariosStore(s => s.duplicateScenario);
    const setActive = useSimulatorScenariosStore(s => s.setActive);
    const renameScenario = useSimulatorScenariosStore(s => s.renameScenario);

    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const renameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (renaming && renameRef.current) renameRef.current.focus();
    }, [renaming]);

    const applyScenario = (id: string) => {
        const s = scenarios.find(x => x.id === id);
        if (!s) return;
        setObjectJson(s.objectJson);
        setCurrentUser({ username: s.username, roles: s.roles });
        setCurrentDate(s.currentDate);
        selectAllRules(s.selectedRuleIds);
        setActive(id);
        setOpenMenuId(null);
    };

    const saveAsNew = () => {
        const name = window.prompt(
            'Название сценария:',
            `Сценарий ${scenarios.length + 1}`,
        );
        if (!name) return;
        saveScenario({
            name,
            objectJson,
            username: currentUser.username,
            roles: currentUser.roles,
            currentDate,
            selectedRuleIds: [...selectedRuleIds],
        });
        showToast('Сценарий сохранён');
    };

    const saveActive = () => {
        if (!activeId) {
            saveAsNew();
            return;
        }
        updateScenario(activeId, {
            objectJson,
            username: currentUser.username,
            roles: currentUser.roles,
            currentDate,
            selectedRuleIds: [...selectedRuleIds],
        });
        showToast('Сценарий обновлён');
    };

    const startRename = (id: string, currentName: string) => {
        setRenaming(id);
        setRenameValue(currentName);
        setOpenMenuId(null);
    };

    const confirmRename = () => {
        if (renaming && renameValue.trim()) {
            renameScenario(renaming, renameValue.trim());
        }
        setRenaming(null);
    };

    const openMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenuPosition({ x: rect.left, y: rect.bottom + 4 });
        setOpenMenuId(prev => (prev === id ? null : id));
    };

    const closeMenu = () => {
        setOpenMenuId(null);
        setMenuPosition(null);
    };

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
            <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium shrink-0">
                Сценарии:
            </span>

            <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
                {scenarios.length === 0 && (
                    <span className="text-[11px] text-gray-400 italic">
                        нет сохранённых сценариев
                    </span>
                )}

                {scenarios.map(s => {
                    const active = s.id === activeId;
                    const isRenaming = renaming === s.id;
                    const menuOpen = openMenuId === s.id;

                    return (
                        <div
                            key={s.id}
                            className={`group flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded border transition-colors shrink-0 ${active
                                    ? 'bg-blue-100 border-blue-300'
                                    : 'bg-white border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            {isRenaming ? (
                                <input
                                    ref={renameRef}
                                    type="text"
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={confirmRename}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') confirmRename();
                                        if (e.key === 'Escape') setRenaming(null);
                                    }}
                                    className="text-[11px] w-24 px-1 border border-blue-300 rounded focus:outline-none"
                                />
                            ) : (
                                <button
                                    onClick={() => applyScenario(s.id)}
                                    onDoubleClick={() => startRename(s.id, s.name)}
                                    className={`text-[11px] max-w-[140px] truncate ${active ? 'text-blue-900 font-medium' : 'text-gray-700'
                                        }`}
                                    title={`${s.name}\nДвойной клик — переименовать`}
                                >
                                    {s.name}
                                </button>
                            )}

                            {/* Кнопка меню — крупнее, с видимой зоной клика */}
                            <button
                                onClick={e => openMenu(s.id, e)}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${menuOpen
                                        ? 'bg-gray-200 text-gray-800'
                                        : 'text-gray-400 hover:text-gray-800 hover:bg-gray-100'
                                    }`}
                                title="Действия со сценарием"
                                aria-label="Действия со сценарием"
                            >
                                <IconMore className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center gap-1 shrink-0 border-l border-gray-200 pl-2">
                {activeId ? (
                    <button
                        onClick={saveActive}
                        className="text-[10px] px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                        title="Сохранить изменения в текущем сценарии"
                    >
                        Обновить
                    </button>
                ) : null}
                <button
                    onClick={saveAsNew}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                    title="Сохранить текущее состояние как новый сценарий"
                >
                    <IconPlus className="w-3 h-3" />
                    Сохранить как
                </button>
            </div>

            {/* Меню сценария — рендерится через портал, чтобы не обрезалось */}
            {openMenuId && menuPosition &&
                createPortal(
                    <ScenarioMenu
                        position={menuPosition}
                        scenarioId={openMenuId}
                        onClose={closeMenu}
                        onRename={() => {
                            const s = scenarios.find(x => x.id === openMenuId);
                            if (s) startRename(s.id, s.name);
                        }}
                        onOverwrite={() => {
                            updateScenario(openMenuId, {
                                objectJson,
                                username: currentUser.username,
                                roles: currentUser.roles,
                                currentDate,
                                selectedRuleIds: [...selectedRuleIds],
                            });
                            showToast('Перезаписано');
                            closeMenu();
                        }}
                        onDuplicate={() => {
                            duplicateScenario(openMenuId);
                            closeMenu();
                        }}
                        onDelete={() => {
                            const s = scenarios.find(x => x.id === openMenuId);
                            if (!s) return;
                            if (window.confirm(`Удалить сценарий «${s.name}»?`)) {
                                deleteScenario(openMenuId);
                            }
                            closeMenu();
                        }}
                    />,
                    document.body,
                )}
        </div>
    );
}

// =========================================================================

function ScenarioMenu({
    position,
    onClose,
    onRename,
    onOverwrite,
    onDuplicate,
    onDelete,
}: {
    position: { x: number; y: number };
    scenarioId: string;
    onClose: () => void;
    onRename: () => void;
    onOverwrite: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Закрытие по клику вне
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('keydown', escapeHandler);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('keydown', escapeHandler);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                zIndex: 60,
            }}
            className="min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-xl py-1"
        >
            <MenuItem onClick={onRename}>Переименовать</MenuItem>
            <MenuItem onClick={onOverwrite}>Перезаписать текущим</MenuItem>
            <MenuItem onClick={onDuplicate}>Дублировать</MenuItem>
            <div className="my-1 border-t border-gray-100" />
            <MenuItem onClick={onDelete} danger>
                Удалить
            </MenuItem>
        </div>
    );
}

function MenuItem({
    onClick,
    danger,
    children,
}: {
    onClick: () => void;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${danger
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
        >
            {children}
        </button>
    );
}