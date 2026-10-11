import { useEffect } from "react";
import { useCommandPaletteStore } from "../../store/useCommandPaletteStore";

export function useCommandHotkey() {
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Cmd+K или Ctrl+K
      if (e.key === "k" || e.key === "K" || e.key === "л" || e.key === "Л") {
        e.preventDefault();
        const isOpen = useCommandPaletteStore.getState().open;
        if (isOpen) closePalette();
        else openPalette();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPalette, closePalette]);
}
