import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
    x: number;
    y: number;
    content: ReactNode;
}

export function TooltipAtPointer({ x, y, content }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: x + 12, top: y + 12 });

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const padding = 8;

        let left = x + 12;
        let top = y + 12;

        if (left + rect.width + padding > window.innerWidth) {
            left = x - rect.width - 12;
        }
        if (top + rect.height + padding > window.innerHeight) {
            top = window.innerHeight - rect.height - padding;
        }
        if (left < padding) left = padding;
        if (top < padding) top = padding;

        setPos({ left, top });
    }, [x, y]);

    return (
        <div
            ref={ref}
            style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                zIndex: 1000,
                pointerEvents: 'none',
            }}
        >
            {content}
        </div>
    );
}