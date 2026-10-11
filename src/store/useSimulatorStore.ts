import { create } from "zustand";

type LeftTab = "data" | "linkages" | "rules";

interface SimulatorState {
  objectJson: string;
  currentUser: { id: string; username: string; roles: string[] };
  currentDate: string;
  /** ID выбранных правил — массив, а не Set */
  selectedRuleIds: string[];
  leftTab: LeftTab;
  hintsCollapsed: boolean;
  linkages: Record<string, Record<string, any>>;

  setObjectJson: (v: string) => void;
  setCurrentUser: (u: Partial<SimulatorState["currentUser"]>) => void;
  setCurrentDate: (d: string) => void;
  toggleRule: (id: string) => void;
  selectAllRules: (ids: string[]) => void;
  clearRules: () => void;
  setLeftTab: (t: LeftTab) => void;
  toggleHints: () => void;
  setLinkages: (v: Record<string, Record<string, any>>) => void;
  updateLinkageValue: (alias: string, attrId: string, value: any) => void;
  removeLinkage: (alias: string) => void;
}

const today = new Date().toISOString().slice(0, 19);

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  objectJson: "{\n  \n}",
  currentUser: { id: "user-1", username: "admin", roles: ["admin"] },
  currentDate: today,
  selectedRuleIds: [],
  leftTab: "data",
  hintsCollapsed: false,
  linkages: {},

  setObjectJson: (objectJson) => set({ objectJson }),
  setCurrentUser: (u) => set({ currentUser: { ...get().currentUser, ...u } }),
  setCurrentDate: (currentDate) => set({ currentDate }),

  toggleRule: (id) => {
    const prev = get().selectedRuleIds;
    const next = prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id];
    set({ selectedRuleIds: next });
  },

  selectAllRules: (ids) => set({ selectedRuleIds: [...ids] }),
  clearRules: () => set({ selectedRuleIds: [] }),
  setLeftTab: (leftTab) => set({ leftTab }),
  toggleHints: () => set({ hintsCollapsed: !get().hintsCollapsed }),
  setLinkages: (linkages) => set({ linkages }),

  updateLinkageValue: (alias, attrId, value) => {
    const prev = get().linkages;
    const existing = prev[alias] ?? {};
    set({
      linkages: {
        ...prev,
        [alias]: { ...existing, [attrId]: value },
      },
    });
  },

  removeLinkage: (alias) => {
    const next = { ...get().linkages };
    delete next[alias];
    set({ linkages: next });
  },
}));
