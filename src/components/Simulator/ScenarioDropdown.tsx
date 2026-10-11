import { useState } from 'react';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { useSimulatorScenariosStore } from '../../store/useSimulatorScenariosStore';
import { showToast } from '../Toast';
import { Popover } from './Popover';
import { IconFileText, IconPlus, IconX } from '../icons';

export function ScenarioDropdown() {
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
    const setActive = useSimulatorScenariosStore(s => s.setActive);

    const active = scenarios.find(s => s.id === activeId);

    const applyScenario = (id: string, close: () => void) => {
        const s = scenarios.find(x => x.id === id);
        if (!s) return;
        setObjectJson(s.objectJson);
        setCurrentUser({ username: s.username, roles: s.roles });
        setCurrentDate(s.currentDate);
        selectAllRules(s.selectedRuleIds);
        setActive(id);
        close();
    };

    const saveAsNew = (close: () => void) => {
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
        close();
    };

    const saveActive = (close: () => void) => {
        if (!activeId) {
            saveAsNew(close);
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
        close();
    };

    return (
        <Popover
            width={320}
            trigger={(open) => (
                <div
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border transition-colors ${open
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    <IconFileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[180px]">
                        {active?.name ?? 'Без сценария'}
                    </span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
                        stroke="currentColor" strokeWidth="1.4" className="shrink-0">
                        <path d="M2 3 L4 5 L6 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
            )}
        >
            {(close) => (
                <div>
                    {/* Список сценариев */}
                    <div className="max-h-72 overflow-auto py-1">
                        {scenarios.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-gray-400 italic text-center">
                                Нет сохранённых сценариев
                            </div>
                        ) : (
                            scenarios.map(s => (
                                <div
                                    key={s.id}
                                    className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer ${s.id === activeId ? 'bg-blue-50/60' : ''
                                        }`}
                                    onClick={() => applyScenario(s.id, close)}
                                >
                                    <span
                                        className={`text-xs flex-1 truncate ${s.id === activeId ? 'text-blue-900 font-medium' : 'text-gray-700'
                                            }`}
                                    >
                                        {s.name}
                                    </span>
                                    <span className="text-[10px] text-gray-400 shrink-0">
                                        {s.roles.join(', ') || '—'}
                                    </span>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (window.confirm(`Удалить сценарий «${s.name}»?`)) {
                                                deleteScenario(s.id);
                                            }
                                        }}
                                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                        title="Удалить"
                                    >
                                        <IconX className="w-3 h-3" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Действия */}
                    <div className="border-t border-gray-200 py-1">
                        {activeId && (
                            <button
                                onClick={() => saveActive(close)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
                            >
                                <span className="text-gray-400">💾</span>
                                Обновить текущий
                            </button>
                        )}
                        <button
                            onClick={() => saveAsNew(close)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
                        >
                            <IconPlus className="w-3 h-3 text-gray-400" />
                            Сохранить как новый
                        </button>
                    </div>
                </div>
            )}
        </Popover>
    );
}