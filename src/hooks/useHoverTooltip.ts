import { useRef, useState } from "react";

interface TooltipState<T> {
  data: T;
  x: number;
  y: number;
}

export function useHoverTooltip<T>(delay = 300) {
  const [state, setState] = useState<TooltipState<T> | null>(null);
  const timerRef = useRef<number | null>(null);

  const show = (data: T, e: React.MouseEvent) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const x = e.clientX;
    const y = e.clientY;
    timerRef.current = window.setTimeout(() => {
      setState({ data, x, y });
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState(null);
  };

  return { tooltip: state, show, hide };
}
