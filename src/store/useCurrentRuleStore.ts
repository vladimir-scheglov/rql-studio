import { create } from "zustand";
import type { DataRuleEffect } from "../constructor/export-yaml";

interface CurrentRuleState {
  currentRuleId: string | null;
  currentEffect: DataRuleEffect | null;
  isUnconditional: boolean;

  setCurrentRule: (
    id: string | null,
    effect: DataRuleEffect | null,
    isUnconditional?: boolean,
  ) => void;
  clearCurrentRule: () => void;
}

export const useCurrentRuleStore = create<CurrentRuleState>((set) => ({
  currentRuleId: null,
  currentEffect: null,
  isUnconditional: false,

  setCurrentRule: (id, effect, isUnconditional = false) =>
    set({ currentRuleId: id, currentEffect: effect, isUnconditional }),

  clearCurrentRule: () =>
    set({ currentRuleId: null, currentEffect: null, isUnconditional: false }),
}));
