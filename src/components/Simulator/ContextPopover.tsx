import { useSimulatorStore } from '../../store/useSimulatorStore';
import { Popover } from './Popover';

export function ContextPopover() {
    const currentUser = useSimulatorStore(s => s.currentUser);
    const currentDate = useSimulatorStore(s => s.currentDate);
    const setCurrentUser = useSimulatorStore(s => s.setCurrentUser);
    const setCurrentDate = useSimulatorStore(s => s.setCurrentDate);

    // Короткое представление для кнопки
    const shortDate = (() => {
        try {
            const d = new Date(currentDate);
            return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        } catch {
            return '—';
        }
    })();

    return (
        <Popover
            width={280}
            trigger={(open) => (
                <div
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border transition-colors ${open
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                        stroke="currentColor" strokeWidth="1.5" className="shrink-0">
                        <circle cx="6" cy="4" r="2" />
                        <path d="M2 10 a4 4 0 0 1 8 0" strokeLinecap="round" />
                    </svg>
                    <span className="truncate max-w-[200px]">
                        {currentUser.username || '—'}
                        <span className="text-gray-400 ml-1">·</span>
                        <span className="text-gray-500 ml-1">
                            {currentUser.roles.join(', ') || '—'}
                        </span>
                        <span className="text-gray-400 ml-1">·</span>
                        <span className="text-gray-500 ml-1">{shortDate}</span>
                    </span>
                </div>
            )}
        >
            {() => (
                <div className="p-3 space-y-3">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                        Контекст симуляции
                    </div>

                    <label className="block">
                        <span className="block text-[10px] text-gray-500 mb-1">
                            Пользователь
                        </span>
                        <input
                            type="text"
                            value={currentUser.username}
                            onChange={e => setCurrentUser({ username: e.target.value })}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                        />
                    </label>

                    <label className="block">
                        <span className="block text-[10px] text-gray-500 mb-1">
                            Роли (через запятую)
                        </span>
                        <input
                            type="text"
                            value={currentUser.roles.join(', ')}
                            onChange={e =>
                                setCurrentUser({
                                    roles: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                                })
                            }
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                        />
                    </label>

                    <label className="block">
                        <span className="block text-[10px] text-gray-500 mb-1">
                            Дата и время
                        </span>
                        <input
                            type="datetime-local"
                            value={currentDate.slice(0, 16)}
                            onChange={e => setCurrentDate(new Date(e.target.value).toISOString().slice(0, 19))}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                        />
                    </label>
                </div>
            )}
        </Popover>
    );
}