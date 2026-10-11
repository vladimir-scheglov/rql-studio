import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SimulationScenario } from "../simulator/types";

interface ScenariosState {
  scenarios: SimulationScenario[];
  activeScenarioId: string | null;

  saveScenario: (
    s: Omit<SimulationScenario, "id" | "createdAt" | "updatedAt">,
  ) => void;
  updateScenario: (id: string, patch: Partial<SimulationScenario>) => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (id: string) => void;
  setActive: (id: string | null) => void;
  renameScenario: (id: string, name: string) => void;
}

export const useSimulatorScenariosStore = create<ScenariosState>()(
  persist(
    (set, get) => ({
      scenarios: [],
      activeScenarioId: null,

      saveScenario: (s) => {
        const now = new Date().toISOString();
        const id = `sc_${Date.now().toString(36)}`;
        const scenario: SimulationScenario = {
          ...s,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set({
          scenarios: [...get().scenarios, scenario],
          activeScenarioId: id,
        });
      },

      updateScenario: (id, patch) => {
        set({
          scenarios: get().scenarios.map((s) =>
            s.id === id
              ? { ...s, ...patch, updatedAt: new Date().toISOString() }
              : s,
          ),
        });
      },

      deleteScenario: (id) => {
        const next = get().scenarios.filter((s) => s.id !== id);
        set({
          scenarios: next,
          activeScenarioId:
            get().activeScenarioId === id ? null : get().activeScenarioId,
        });
      },

      duplicateScenario: (id) => {
        const src = get().scenarios.find((s) => s.id === id);
        if (!src) return;
        const now = new Date().toISOString();
        const copy: SimulationScenario = {
          ...src,
          id: `sc_${Date.now().toString(36)}`,
          name: `${src.name} (копия)`,
          createdAt: now,
          updatedAt: now,
        };
        set({
          scenarios: [...get().scenarios, copy],
          activeScenarioId: copy.id,
        });
      },

      setActive: (activeScenarioId) => set({ activeScenarioId }),
      renameScenario: (id, name) => get().updateScenario(id, { name }),
    }),
    {
      name: "rql-studio-simulator-scenarios",
    },
  ),
);
