import type { FieldState } from '../../simulator/simulate';

interface Props {
    state: FieldState;
}

export function StateBadges({ state }: Props) {
    const badges: { key: string; label: string; cls: string }[] = [];

    if (!state.visible) {
        badges.push({
            key: 'hidden',
            label: 'Скрыто',
            cls: 'bg-gray-200 text-gray-700',
        });
    }
    if (state.readonly) {
        badges.push({
            key: 'readonly',
            label: 'Только чтение',
            cls: 'bg-amber-100 text-amber-800 border border-amber-200',
        });
    }
    if (state.required) {
        badges.push({
            key: 'required',
            label: 'Обязательное',
            cls: 'bg-red-100 text-red-800 border border-red-200',
        });
    }
    if (state.validationError) {
        badges.push({
            key: 'invalid',
            label: 'Ошибка',
            cls: 'bg-red-600 text-white',
        });
    }

    if (badges.length === 0) {
        badges.push({
            key: 'normal',
            label: 'Обычное',
            cls: 'bg-gray-100 text-gray-500',
        });
    }

    return (
        <div className="flex flex-wrap gap-1">
            {badges.map(b => (
                <span
                    key={b.key}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${b.cls}`}
                >
                    {b.label}
                </span>
            ))}
        </div>
    );
}