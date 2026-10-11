import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
    trigger: (open: boolean) => ReactNode;
    children: (close: () => void) => ReactNode;
    width?: number;
    align?: 'left' | 'right';
}

export function Popover({ trigger, children, width = 260, align = 'left' }: Props) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const toggle = () => {
        if (open) {
            setOpen(false);
            setCoords(null);
            return;
        }

        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;

        let x = align === 'left' ? rect.left : rect.right - width;
        const y = rect.bottom + 4;

        if (x + width > window.innerWidth - 8) x = window.innerWidth - width - 8;
        if (x < 8) x = 8;

        setCoords({ x, y });
        setOpen(true);
    };

    const close = () => {
        setOpen(false);
        setCoords(null);
    };

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (wrapperRef.current?.contains(target)) return;
            if (target.closest('[data-popover-body]')) return;
            close();
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    return (
        <>
            <div
                ref={wrapperRef}
                onClick={toggle}
                className="inline-flex cursor-pointer"
            >
                {trigger(open)}
            </div>

            {open && coords &&
                createPortal(
                    <div
                        data-popover-body
                        style={{
                            position: 'fixed',
                            left: coords.x,
                            top: coords.y,
                            width,
                            zIndex: 60,
                        }}
                        className="bg-white border border-gray-200 rounded-lg shadow-xl"
                    >
                        {children(close)}
                    </div>,
                    document.body,
                )}
        </>
    );
}