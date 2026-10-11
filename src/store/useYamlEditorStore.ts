import { create } from "zustand";

interface YamlEditorState {
  /** Имя открытого файла или null */
  openFileName: string | null;
  openFile: (name: string) => void;
  closeFile: () => void;
}

export const useYamlEditorStore = create<YamlEditorState>((set) => ({
  openFileName: null,
  openFile: (name) => set({ openFileName: name }),
  closeFile: () => set({ openFileName: null }),
}));
