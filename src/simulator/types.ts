export interface SimulationScenario {
  id: string;
  name: string;
  /** JSON-строка объекта */
  objectJson: string;
  /** Пользователь (username) */
  username: string;
  /** Роли через запятую */
  roles: string[];
  /** Дата в ISO */
  currentDate: string;
  /** ID выбранных правил */
  selectedRuleIds: string[];
  /** Значения связей */
  linkages?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
