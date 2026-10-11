import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  SimulationPlaybook,
  PlaybookStep,
} from "../simulator/playbook-types";

interface PlaybooksState {
  playbooks: SimulationPlaybook[];
  activePlaybookId: string | null;
  activeStepIndex: number;

  createPlaybook: (
    p: Omit<SimulationPlaybook, "id" | "createdAt" | "updatedAt">,
  ) => void;
  updatePlaybook: (id: string, patch: Partial<SimulationPlaybook>) => void;
  deletePlaybook: (id: string) => void;
  setActive: (id: string | null) => void;
  setActiveStep: (index: number) => void;

  addStep: (playbookId: string, step: PlaybookStep) => void;
  updateStep: (
    playbookId: string,
    stepId: string,
    patch: Partial<PlaybookStep>,
  ) => void;
  removeStep: (playbookId: string, stepId: string) => void;
  reorderSteps: (playbookId: string, from: number, to: number) => void;
  moveStep: (playbookId: string, delta: 1 | -1) => void;
}

export const useSimulatorPlaybooksStore = create<PlaybooksState>()(
  persist(
    (set, get) => ({
      playbooks: [],
      activePlaybookId: null,
      activeStepIndex: 0,

      createPlaybook: (p) => {
        const now = new Date().toISOString();
        const pb: SimulationPlaybook = {
          ...p,
          id: `pb_${Date.now().toString(36)}`,
          createdAt: now,
          updatedAt: now,
        };
        set({
          playbooks: [...get().playbooks, pb],
          activePlaybookId: pb.id,
          activeStepIndex: 0,
        });
      },

      updatePlaybook: (id, patch) =>
        set({
          playbooks: get().playbooks.map((p) =>
            p.id === id
              ? { ...p, ...patch, updatedAt: new Date().toISOString() }
              : p,
          ),
        }),

      deletePlaybook: (id) =>
        set({
          playbooks: get().playbooks.filter((p) => p.id !== id),
          activePlaybookId:
            get().activePlaybookId === id ? null : get().activePlaybookId,
          activeStepIndex: 0,
        }),

      setActive: (activePlaybookId) =>
        set({ activePlaybookId, activeStepIndex: 0 }),
      setActiveStep: (activeStepIndex) => set({ activeStepIndex }),

      addStep: (playbookId, step) =>
        set({
          playbooks: get().playbooks.map((p) =>
            p.id === playbookId
              ? {
                  ...p,
                  steps: [...p.steps, step],
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }),

      updateStep: (playbookId, stepId, patch) =>
        set({
          playbooks: get().playbooks.map((p) =>
            p.id === playbookId
              ? {
                  ...p,
                  steps: p.steps.map((s) =>
                    s.id === stepId ? { ...s, ...patch } : s,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }),

      removeStep: (playbookId, stepId) =>
        set({
          playbooks: get().playbooks.map((p) =>
            p.id === playbookId
              ? {
                  ...p,
                  steps: p.steps.filter((s) => s.id !== stepId),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }),

      reorderSteps: (playbookId, from, to) => {
        set({
          playbooks: get().playbooks.map((p) => {
            if (p.id !== playbookId) return p;
            const steps = [...p.steps];
            const [moved] = steps.splice(from, 1);
            steps.splice(to, 0, moved);
            return { ...p, steps, updatedAt: new Date().toISOString() };
          }),
        });
      },
      moveStep: (playbookId, delta) => {
        const pb = get().playbooks.find((p) => p.id === playbookId);
        if (!pb) return;
        const current = get().activeStepIndex;
        const next = Math.max(
          0,
          Math.min(pb.steps.length - 1, current + delta),
        );
        set({ activeStepIndex: next });
      },
    }),
    { name: "rql-studio-simulator-playbooks" },
  ),
);
