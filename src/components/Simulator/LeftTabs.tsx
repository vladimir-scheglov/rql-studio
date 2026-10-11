export function LeftTabs({
    active,
    onChange,
    rulesCount,
    selectedCount,
    linkagesSet,
}: {
    active: 'data' | 'linkages' | 'rules';
    onChange: (t: 'data' | 'linkages' | 'rules') => void;
    rulesCount: number;
    selectedCount: number;
    linkagesSet: number;
}) {
    return (
        <div className="flex border-b border-gray-200 bg-white shrink-0">
            <TabButton
                active={active === 'data'}
                onClick={() => onChange('data')}
            >
                Данные
            </TabButton>
            <TabButton
                active={active === 'linkages'}
                onClick={() => onChange('linkages')}
                badge={linkagesSet > 0 ? String(linkagesSet) : undefined}
                badgeColor="purple"
            >
                Связи
            </TabButton>
            <TabButton
                active={active === 'rules'}
                onClick={() => onChange('rules')}
                badge={`${selectedCount}/${rulesCount}`}
            >
                Правила
            </TabButton>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    badge,
    badgeColor,
    children,
}: {
    active: boolean;
    onClick: () => void;
    badge?: string;
    badgeColor?: 'gray' | 'purple';
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${active
                    ? 'text-gray-900 border-b-2 border-blue-500 -mb-px'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
        >
            {children}
            {badge && (
                <span
                    className={`text-[10px] px-1 rounded tabular-nums ${badgeColor === 'purple'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                >
                    {badge}
                </span>
            )}
        </button>
    );
}