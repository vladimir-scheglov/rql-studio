import { resolveEntityFqid, type SymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";
import type { GroupNode, LeafNode, LinkageNode, LeafValue } from "./types";
import type { DataRuleEffect } from "./export-yaml";
import { nextId } from "./types";

export interface EffectExtras {
  constraint?: string;
  expression?: string;
  value?: string;
}

export interface TemplateContext {
  table: SymbolTable;
  domain: string;
  entityFqid: string;
}

export interface TemplateParam {
  id: string;
  label: string;
  hint?: string;
  kind: "attribute" | "linkage" | "text" | "select";
  attributeFilter?: (attr: any, ctx: TemplateContext) => boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  category:
    | "required"
    | "hidden"
    | "readonly"
    | "user"
    | "workflow"
    | "date"
    | "validation";
  defaultEffect: DataRuleEffect;
  conditionParams: TemplateParam[];
  effectParams: TemplateParam[];
  build: (values: Record<string, string>, ctx: TemplateContext) => GroupNode;
  /** Опционально — поля для YAML: constraint, expression, value */
  effectExtras?: (
    values: Record<string, string>,
    ctx: TemplateContext,
  ) => EffectExtras;
}
// --- Утилиты -------------------------------------------------------------

function leaf(
  attribute: string,
  operator: LeafNode["operator"],
  value?: LeafNode["value"],
): LeafNode {
  return {
    id: nextId("l"),
    kind: "leaf",
    attribute,
    operator,
    value: value ?? null,
    values: [],
  };
}

function group(
  children: any[],
  operator: GroupNode["operator"] = "AND",
): GroupNode {
  return { id: nextId("g"), kind: "group", operator, children };
}

// --- Каталог шаблонов ---------------------------------------------------

export const RULE_TEMPLATES: RuleTemplate[] = [
  // 1. Поле обязательно, если другое заполнено
  {
    id: "required-when-other-filled",
    name: "Поле обязательно, если другое заполнено",
    description:
      "Условие: если триггер-атрибут заполнен, целевой атрибут становится обязательным.",
    category: "required",
    defaultEffect: "required",

    conditionParams: [
      { id: "trigger", label: "Если заполнено", kind: "attribute" },
    ],
    effectParams: [
      { id: "target", label: "Обязательный атрибут", kind: "attribute" },
      {
        id: "message",
        label: "Сообщение об ошибке",
        kind: "text",
        hint: "Укажите значение",
      },
      { id: "help", label: "Справка (опционально)", kind: "text" },
    ],

    build: (v) => group([leaf(v.trigger, "IS NOT NULL")]),
  },

  // 2. Поле обязательно для определённого статуса
  {
    id: "required-for-status",
    name: "Поле обязательно для статуса",
    description:
      "Условие: если статус равен выбранному, целевой атрибут становится обязательным.",
    category: "workflow",
    defaultEffect: "required",

    conditionParams: [
      { id: "statusAttr", label: "Атрибут статуса", kind: "attribute" },
      {
        id: "statusValue",
        label: "Значение статуса",
        hint: "Формат: @WorkflowId.statusId",
        kind: "text",
      },
    ],
    effectParams: [
      { id: "target", label: "Обязательный атрибут", kind: "attribute" },
      { id: "message", label: "Сообщение об ошибке", kind: "text" },
    ],

    build: (v) =>
      group([leaf(v.statusAttr, "=", parseEnumOrString(v.statusValue))]),
  },

  // 3. Скрыть поле для статуса
  {
    id: "hidden-for-status",
    name: "Скрыть поле для статуса",
    description: "Условие: если статус равен выбранному, поле скрыто.",
    category: "hidden",
    defaultEffect: "hidden",

    conditionParams: [
      { id: "statusAttr", label: "Атрибут статуса", kind: "attribute" },
      { id: "statusValue", label: "Значение статуса", kind: "text" },
    ],
    effectParams: [
      { id: "target", label: "Скрываемый атрибут", kind: "attribute" },
    ],

    build: (v) =>
      group([leaf(v.statusAttr, "=", parseEnumOrString(v.statusValue))]),
  },

  // 4. Запретить редактирование заполненного поля
  {
    id: "readonly-when-not-empty",
    name: "Запретить редактирование заполненного поля",
    description: "Условие: если атрибут заполнен, значение нельзя изменить.",
    category: "readonly",
    defaultEffect: "readonly",

    conditionParams: [],
    effectParams: [{ id: "target", label: "Атрибут", kind: "attribute" }],

    // Без параметров: условие — просто «атрибут не пуст». Триггер
    // передаём через effectParams — но RQL его тоже должен знать.
    // Поэтому здесь используем effectParams.target и как trigger.
    build: (v) => group([leaf(v.target, "IS NOT NULL")]),
  },

  // 5. Значение по умолчанию — текущий пользователь
  {
    id: "default-current-user",
    name: "Значение по умолчанию — текущий пользователь",
    description:
      "При создании объекта в поле подставляется текущий пользователь.",
    category: "user",
    defaultEffect: "default",

    conditionParams: [],
    effectParams: [
      {
        id: "target",
        label: "Атрибут типа Reference (User)",
        kind: "attribute",
      },
    ],

    build: () => group([]),
  },

  // 6. Редактировать может только автор
  {
    id: "only-current-user-can-edit",
    name: "Редактировать может только автор",
    description:
      "Условие: если пользователь не создатель объекта, поле только для чтения.",
    category: "user",
    defaultEffect: "readonly",

    conditionParams: [],
    effectParams: [{ id: "target", label: "Атрибут", kind: "attribute" }],

    build: (v) =>
      group([
        leaf(v.target, "IS NOT NULL"),
        leaf("createdBy", "!=", { kind: "system-user", which: "id" }),
      ]),
  },

  // 7. Дата не раньше текущей
  {
    id: "date-not-in-past",
    name: "Дата не может быть в прошлом",
    description:
      "Условие: если атрибут-дата заполнен, он должен быть позже текущей даты.",
    category: "date",
    defaultEffect: "allowed",

    conditionParams: [],
    effectParams: [{ id: "target", label: "Атрибут-дата", kind: "attribute" }],

    build: (v) => group([leaf(v.target, "IS NOT NULL")]),
  },

  // 8. Ограничить допустимые значения
  {
    id: "restrict-enum",
    name: "Ограничить допустимые значения",
    description:
      "Условие: значение атрибута должно входить в указанный список.",
    category: "required",
    defaultEffect: "allowed",

    conditionParams: [
      {
        id: "values",
        label: "Допустимые значения",
        hint: "Через запятую: @IncUrgency.high, @IncUrgency.low",
        kind: "text",
      },
    ],
    effectParams: [
      { id: "target", label: "Атрибут типа Enum", kind: "attribute" },
    ],

    build: (v) => {
      // target нужен и здесь — берём из effectParams
      // Проверка, что target есть, делается в модалке
      const target = v.target ?? "";
      if (!target) return group([]);
      const n = leaf(target, "IN");
      n.values = parseValuesList(v.values);
      return group([n]);
    },
  },

  // 9. Требовать наличие связи
  {
    id: "linkage-required",
    name: "Требовать наличие связи",
    description:
      "Условие: у объекта должна быть хотя бы одна связь указанного типа.",
    category: "required",
    defaultEffect: "required",

    conditionParams: [{ id: "linkage", label: "Связь", kind: "linkage" }],
    effectParams: [
      { id: "message", label: "Сообщение об ошибке", kind: "text" },
    ],

    build: (v, ctx) => {
      const linkage =
        ctx.table.linkages.get(v.linkage) ??
        ctx.table.linkages.get(`${ctx.domain}/${v.linkage}`);
      if (!linkage) return group([]);

      const side1Fqid = resolveEntityFqid(
        linkage.side1,
        linkage.domain,
        ctx.table,
      );
      const side2Fqid = resolveEntityFqid(
        linkage.side2,
        linkage.domain,
        ctx.table,
      );

      let side: "1" | "2" = "1";
      let targetFqid = "";
      if (side1Fqid === ctx.entityFqid) {
        side = "1";
        targetFqid = side2Fqid ?? "";
      } else if (side2Fqid === ctx.entityFqid) {
        side = "2";
        targetFqid = side1Fqid ?? "";
      }

      const node: LinkageNode = {
        id: nextId("lk"),
        kind: "linkage",
        linkageFqid: linkage.fqid,
        side,
        targetEntityFqid: targetFqid,
        mode: "exists",
        nested: null,
      };
      return group([node]);
    },
  },
  // 10. Readonly после закрытия
  {
    id: "readonly-after-closed",
    name: "Запретить редактирование после закрытия",
    description:
      "Условие: если статус = закрыт, указанный атрибут становится недоступным для редактирования.",
    category: "readonly",
    defaultEffect: "readonly",
    conditionParams: [
      { id: "statusAttr", label: "Атрибут статуса", kind: "attribute" },
      {
        id: "statusValue",
        label: "Закрывающий статус",
        kind: "text",
        hint: "Например: @IncStatus.closed",
      },
    ],
    effectParams: [
      { id: "target", label: "Защищаемый атрибут", kind: "attribute" },
    ],
    build: (v) =>
      group([leaf(v.statusAttr, "=", parseEnumOrString(v.statusValue))]),
  },

  // 11. Скрыть от пользователей без роли
  {
    id: "hide-from-role",
    name: "Скрыть поле от пользователей без роли",
    description:
      "Условие: если у текущего пользователя нет указанной роли, поле скрыто.",
    category: "hidden",
    defaultEffect: "hidden",
    conditionParams: [
      {
        id: "roleName",
        label: "Роль",
        kind: "text",
        hint: "Имя или UUID роли",
      },
    ],
    effectParams: [
      { id: "target", label: "Скрываемый атрибут", kind: "attribute" },
    ],
    build: (v) =>
      group([
        {
          id: nextId("l"),
          kind: "leaf",
          attribute: "__expr__",
          operator: "=",
          value: null,
          values: [],
        },
      ]),
    // В expr — NOT hasRole('X')
  },

  // 12. Readonly для группы
  {
    id: "readonly-for-group",
    name: "Запретить редактирование для группы",
    description:
      "Условие: если пользователь состоит в указанной группе, поле только для чтения.",
    category: "readonly",
    defaultEffect: "readonly",
    conditionParams: [
      {
        id: "groupName",
        label: "Группа",
        kind: "text",
        hint: "Имя или UUID группы",
      },
    ],
    effectParams: [
      { id: "target", label: "Защищаемый атрибут", kind: "attribute" },
    ],
    build: () => group([]),
  },

  // 13. Дата не в будущем
  {
    id: "date-not-in-future",
    name: "Дата не может быть в будущем",
    description:
      "Условие: если атрибут-дата заполнен и больше текущей даты, значение отклоняется.",
    category: "date",
    defaultEffect: "allowed",
    conditionParams: [
      { id: "dateAttr", label: "Атрибут-дата", kind: "attribute" },
    ],
    effectParams: [
      {
        id: "message",
        label: "Сообщение",
        kind: "text",
        defaultValue: "Дата не может быть в будущем",
      },
    ],
    build: (v) =>
      group([
        leaf(v.dateAttr, ">", {
          kind: "system-date",
          which: "CurrentTimestamp",
        }),
      ]),
  },

  // 14. Дата окончания не раньше даты начала
  {
    id: "end-date-after-start",
    name: "Дата окончания не раньше даты начала",
    description:
      "Условие: если обе даты заполнены и дата окончания раньше начала, значение отклоняется.",
    category: "validation",
    defaultEffect: "allowed",
    conditionParams: [
      { id: "startDate", label: "Дата начала", kind: "attribute" },
      { id: "endDate", label: "Дата окончания", kind: "attribute" },
    ],
    effectParams: [
      {
        id: "target",
        label: "Проверяемый атрибут",
        kind: "attribute",
        hint: "Обычно дата окончания",
      },
      {
        id: "message",
        label: "Сообщение",
        kind: "text",
        defaultValue: "Дата окончания раньше даты начала",
      },
    ],
    build: (v) =>
      group([
        leaf(v.endDate, "<", { kind: "attribute", attribute: v.startDate }),
      ]),
  },

  // 15. Значение по умолчанию — текущая дата
  {
    id: "default-now",
    name: "Значение по умолчанию — текущая дата",
    description:
      "При создании объекта в атрибут подставляется текущая дата и время.",
    category: "date",
    defaultEffect: "default",
    conditionParams: [],
    effectParams: [
      { id: "target", label: "Атрибут типа Timestamp", kind: "attribute" },
    ],
    build: () => group([]),
    effectExtras: () => ({ expression: "@CurrentTimestamp" }),
  },

  // 16. Ограничить числовой диапазон
  {
    id: "limit-number-range",
    name: "Ограничить числовой диапазон",
    description:
      "Условие: значение атрибута должно быть в указанном диапазоне.",
    category: "validation",
    defaultEffect: "allowed",
    conditionParams: [],
    effectParams: [
      { id: "target", label: "Числовой атрибут", kind: "attribute" },
      { id: "min", label: "Минимум", kind: "text" },
      { id: "max", label: "Максимум", kind: "text" },
      { id: "message", label: "Сообщение", kind: "text" },
    ],
    build: (v) => {
      const parts: any[] = [];
      if (v.min?.trim()) {
        parts.push(
          leaf(v.target, "<", { kind: "number", value: Number(v.min) }),
        );
      }
      if (v.max?.trim()) {
        parts.push(
          leaf(v.target, ">", { kind: "number", value: Number(v.max) }),
        );
      }
      if (parts.length === 0) return group([]);
      if (parts.length === 1) return group(parts);
      return group(parts, "OR");
    },
  },

  // 17. Показать только для статуса
  {
    id: "visible-only-for-status",
    name: "Показать только для статуса",
    description: "Условие: если статус отличается от указанного, поле скрыто.",
    category: "hidden",
    defaultEffect: "hidden",
    conditionParams: [
      { id: "statusAttr", label: "Атрибут статуса", kind: "attribute" },
      {
        id: "statusValue",
        label: "Разрешающий статус",
        kind: "text",
        hint: "Например: @IncStatus.in_progress",
      },
    ],
    effectParams: [
      { id: "target", label: "Показываемый атрибут", kind: "attribute" },
    ],
    build: (v) =>
      group([leaf(v.statusAttr, "!=", parseEnumOrString(v.statusValue))]),
  },

  // 18. Обязательно для активных (не закрытых)
  {
    id: "required-while-active",
    name: "Обязательно, пока не закрыто",
    description:
      "Условие: пока статус отличается от закрывающего, указанный атрибут обязателен.",
    category: "required",
    defaultEffect: "required",
    conditionParams: [
      { id: "statusAttr", label: "Атрибут статуса", kind: "attribute" },
      { id: "closedValue", label: "Закрывающий статус", kind: "text" },
    ],
    effectParams: [
      { id: "target", label: "Обязательный атрибут", kind: "attribute" },
      { id: "message", label: "Сообщение", kind: "text" },
    ],
    build: (v) =>
      group([leaf(v.statusAttr, "!=", parseEnumOrString(v.closedValue))]),
  },

  // 19. Значение по умолчанию — конкретный enum
  {
    id: "default-enum-value",
    name: "Значение по умолчанию — из перечисления",
    description:
      "При создании объекта в атрибут-перечисление подставляется указанное значение.",
    category: "user",
    defaultEffect: "default",
    conditionParams: [],
    effectParams: [
      { id: "target", label: "Атрибут типа Enum", kind: "attribute" },
      {
        id: "value",
        label: "Значение",
        kind: "text",
        hint: "Формат: @EnumId.valueId",
        defaultValue: "",
      },
    ],
    build: () => group([]),
    effectExtras: (v) => ({ value: v.value }),
  },

  // 20. Запретить изменение после создания
  {
    id: "readonly-after-create",
    name: "Запретить изменение после создания",
    description:
      "Условие: если объект уже создан, атрибут нельзя редактировать.",
    category: "readonly",
    defaultEffect: "readonly",
    conditionParams: [],
    effectParams: [{ id: "target", label: "Атрибут", kind: "attribute" }],
    build: () =>
      group([
        leaf("createdAt", "<=", {
          kind: "system-date",
          which: "CurrentTimestamp",
        }),
      ]),
  },
];

// --- Парсеры значений ---------------------------------------------------

function parseEnumOrString(raw: string): LeafValue {
  const trimmed = raw.trim();
  // @EnumId.valueId → enum
  const enumMatch = trimmed.match(/^@([\w]+)\.([\w]+)$/);
  if (enumMatch) {
    return { kind: "enum", enumId: enumMatch[1], valueId: enumMatch[2] };
  }
  return { kind: "string", value: trimmed };
}

function parseValuesList(raw: string): LeafValue[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseEnumOrString);
}

// --- Фильтр по категории ------------------------------------------------

export const TEMPLATE_CATEGORIES: {
  id: RuleTemplate["category"];
  label: string;
}[] = [
  { id: "required", label: "Обязательность" },
  { id: "hidden", label: "Скрытие" },
  { id: "readonly", label: "Запрет редактирования" },
  { id: "user", label: "Пользователь" },
  { id: "workflow", label: "Workflow" },
  { id: "date", label: "Даты" },
  { id: "validation", label: "Валидация" },
];
