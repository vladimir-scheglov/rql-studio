import { useEffect } from "react";
import { useConstructorStore } from "../../store/useConstructorStore";

export function useConstructorHotkeys() {
  const undo = useConstructorStore((s) => s.undo);
  const redo = useConstructorStore((s) => s.redo);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Не перехватываем, если фокус в input/textarea/select/contenteditable
      const tag = target.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable;
      if (isEditable) return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Ctrl+Z — Undo
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Shift+Z или Ctrl+Y — Redo
      if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
}
