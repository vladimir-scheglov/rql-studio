import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DomainSchema } from "../schema/types";
import { buildSymbolTable, type SymbolTable } from "../schema/symbol-table";
import { parseSchemaFiles } from "../schema/parse";

interface SchemaState {
  rawFiles: { name: string; content: string }[];
  domains: DomainSchema[];
  symbolTable: SymbolTable | null;
  errors: { file: string; message: string }[];
  activeDomainId: string | null;

  loadFiles: (files: { name: string; content: string }[]) => void;
  clear: () => void;
  setActiveDomain: (id: string) => void;
  removeFile: (name: string) => void;
}

export const useSchemaStore = create<SchemaState>()(
  persist(
    (set, get) => ({
      rawFiles: [],
      domains: [],
      symbolTable: null,
      errors: [],
      activeDomainId: null,

      loadFiles: (files) => {
        const { domains, errors } = parseSchemaFiles(files);
        const symbolTable = buildSymbolTable(domains);
        set({
          rawFiles: files,
          domains,
          symbolTable,
          errors,
          activeDomainId: domains[0]?.id ?? null,
        });
      },

      clear: () =>
        set({
          rawFiles: [],
          domains: [],
          symbolTable: null,
          errors: [],
          activeDomainId: null,
        }),

      removeFile: (name) => {
        const next = get().rawFiles.filter((f) => f.name !== name);

        if (next.length === 0) {
          set({
            rawFiles: [],
            domains: [],
            symbolTable: null,
            errors: [],
            activeDomainId: null,
          });
          return;
        }

        const { domains, errors } = parseSchemaFiles(next);
        const symbolTable = buildSymbolTable(domains);

        set((state) => ({
          rawFiles: next,
          domains,
          symbolTable,
          errors,
          activeDomainId:
            domains.find((d) => d.id === state.activeDomainId)?.id ??
            domains[0]?.id ??
            null,
        }));
      },

      setActiveDomain: (id) => set({ activeDomainId: id }),
    }),
    {
      name: "rql-studio-schema",
      partialize: (state) => ({
        rawFiles: state.rawFiles,
        activeDomainId: state.activeDomainId,
      }),

      // Пересобираем производные поля синхронно, мутируя черновик state.
      // Zustand применит этот state к стору после возврата из callback,
      // и все подписчики получат обновления.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.rawFiles?.length) return;

        const { domains, errors } = parseSchemaFiles(state.rawFiles);
        const symbolTable = buildSymbolTable(domains);

        state.domains = domains;
        state.symbolTable = symbolTable;
        state.errors = errors;
        state.activeDomainId = state.activeDomainId ?? domains[0]?.id ?? null;
      },
    },
  ),
);
