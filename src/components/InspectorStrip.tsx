import { useLayoutStore } from "../store/useLayoutStore";

export function InspectorStrip() {
    const open = useLayoutStore(s => s.inspectorOpen);
    if (open) return null;

    return (
        <div className="w-full flex flex-col items-center py-3 h-full">
            <button
                onClick={() => useLayoutStore.getState().setInspectorOpen(true)}
                title="Показать инспектор (Cmd+Alt+B)"
                className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 3 L4 7 L9 11" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            <div className="mt-2 text-[10px] text-gray-400 [writing-mode:vertical-rl] rotate-180 tracking-wider">
                ИНСПЕКТОР
            </div>
        </div>
    );
}