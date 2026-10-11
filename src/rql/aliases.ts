export interface RqlAlias {
  name: string;
  signature: string;
  description: string;
  category: "system" | "current" | "env";
}

export const SYSTEM_ALIASES: RqlAlias[] = [
  {
    name: "@doc",
    signature: "@doc",
    description: "Текущий объект",
    category: "system",
  },
  {
    name: "@row",
    signature: "@row",
    description: "Текущая строка таблицы",
    category: "system",
  },
  {
    name: "@index",
    signature: "@index",
    description: "Индекс элемента массива",
    category: "system",
  },
  {
    name: "@CurrentUser",
    signature: "@CurrentUser",
    description: "Текущий пользователь",
    category: "current",
  },
  {
    name: "@CurrentUser.id",
    signature: "@CurrentUser.id",
    description: "ID текущего пользователя",
    category: "current",
  },
  {
    name: "@CurrentUser.username",
    signature: "@CurrentUser.username",
    description: "Имя текущего пользователя",
    category: "current",
  },
  {
    name: "@CurrentDate",
    signature: "@CurrentDate",
    description: "Текущая дата",
    category: "env",
  },
  {
    name: "@CurrentTime",
    signature: "@CurrentTime",
    description: "Текущее время",
    category: "env",
  },
  {
    name: "@CurrentTimestamp",
    signature: "@CurrentTimestamp",
    description: "Текущая дата и время",
    category: "env",
  },
  {
    name: "@CurrentDateTime",
    signature: "@CurrentDateTime",
    description: "Текущая дата и время",
    category: "env",
  },
  {
    name: "@CurrentDayOfWeek",
    signature: "@CurrentDayOfWeek",
    description: "Текущий день недели",
    category: "env",
  },
];
