import { useEffect } from "react";
import { useLayoutStore } from "../store/useLayoutStore";

export function useLayoutHotkeys() {
  const toggleInspector = useLayoutStore((s) => s.toggleInspector);
  const toggleExplorer = useLayoutStore((s) => s.toggleExplorer);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Cmd+Alt+B → инспектор
      // Cmd+B → explorer
      if (
        e.altKey &&
        (e.key === "b" || e.key === "B" || e.key === "и" || e.key === "И")
      ) {
        e.preventDefault();
        toggleInspector();
        return;
      }

      if (
        !e.altKey &&
        (e.key === "b" || e.key === "B" || e.key === "и" || e.key === "И")
      ) {
        e.preventDefault();
        toggleExplorer();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleInspector, toggleExplorer]);
}
