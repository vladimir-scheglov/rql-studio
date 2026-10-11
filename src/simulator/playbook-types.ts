export interface PlaybookStep {
  id: string;
  name: string;
  objectJson: string;
  username: string;
  roles: string[];
  currentDate: string;
  selectedRuleIds: string[];
  linkages?: Record<string, Record<string, any>>;
  /** Опциональные заметки к шагу */
  notes?: string;
}

export interface SimulationPlaybook {
  id: string;
  name: string;
  description?: string;
  entityFqid: string;
  steps: PlaybookStep[];
  createdAt: string;
  updatedAt: string;
}
