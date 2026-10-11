import type { RqlType } from "./semantics/types";

export type FunctionCategory =
  | "logical"
  | "comparison"
  | "date"
  | "string"
  | "array"
  | "user"
  | "range"
  | "conversion"
  | "aggregate";

export interface RqlFunction {
  name: string;
  signature: string;
  description: string;
  example?: string;
  category: FunctionCategory;
  minArgs: number;
  maxArgs: number; // Infinity, если неограничено
  returnType: RqlType;
}

export const RQL_FUNCTIONS: RqlFunction[] = [
  // --- Логические ---
  {
    name: "and",
    signature: "and(a, b, ...)",
    description: "Логическое И",
    category: "logical",
    minArgs: 2,
    maxArgs: Infinity,
    returnType: "boolean",
  },
  {
    name: "or",
    signature: "or(a, b, ...)",
    description: "Логическое ИЛИ",
    category: "logical",
    minArgs: 2,
    maxArgs: Infinity,
    returnType: "boolean",
  },
  {
    name: "not",
    signature: "not(a)",
    description: "Логическое НЕ",
    category: "logical",
    minArgs: 1,
    maxArgs: 1,
    returnType: "boolean",
  },

  // --- Сравнение ---
  {
    name: "eq",
    signature: "eq(a, b)",
    description: "a = b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "ne",
    signature: "ne(a, b)",
    description: "a != b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "lt",
    signature: "lt(a, b)",
    description: "a < b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "lte",
    signature: "lte(a, b)",
    description: "a <= b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "gt",
    signature: "gt(a, b)",
    description: "a > b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "gte",
    signature: "gte(a, b)",
    description: "a >= b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "in",
    signature: "in(a, b)",
    description: "a входит в b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "notIn",
    signature: "notIn(a, b)",
    description: "a не входит в b",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "isNull",
    signature: "isNull(a)",
    description: "a IS NULL",
    category: "comparison",
    minArgs: 1,
    maxArgs: 1,
    returnType: "boolean",
  },
  {
    name: "isNotNull",
    signature: "isNotNull(a)",
    description: "a IS NOT NULL",
    category: "comparison",
    minArgs: 1,
    maxArgs: 1,
    returnType: "boolean",
  },
  {
    name: "like",
    signature: "like(a, pattern)",
    description: "Сравнение с шаблоном",
    category: "comparison",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "between",
    signature: "between(a, b, c)",
    description: "a BETWEEN b AND c",
    category: "comparison",
    minArgs: 3,
    maxArgs: 3,
    returnType: "boolean",
  },

  // --- Массивы ---
  {
    name: "has",
    signature: "has(array, value)",
    description: "Проверить наличие элемента в массиве",
    category: "array",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "hasAll",
    signature: "hasAll(array, values)",
    description: "Все элементы присутствуют",
    category: "array",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "hasAny",
    signature: "hasAny(array, values)",
    description: "Хотя бы один элемент присутствует",
    category: "array",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "ARRAY",
    signature: "ARRAY(a, b, ...)",
    description: "Создать массив",
    category: "array",
    minArgs: 1,
    maxArgs: Infinity,
    returnType: "array",
  },
  {
    name: "UNNEST",
    signature: "UNNEST(array)",
    description: "Развернуть массив в коллекцию",
    category: "array",
    minArgs: 1,
    maxArgs: 1,
    returnType: "array",
  },

  // --- Дата/время ---
  {
    name: "DATE_PART",
    signature: "DATE_PART('part', value)",
    description: "Извлечь компонент даты",
    category: "date",
    minArgs: 2,
    maxArgs: 2,
    returnType: "number",
    example: "DATE_PART('hour', @CurrentTimestamp)",
  },
  {
    name: "TSRANGE",
    signature: "TSRANGE(from, to [, 'bounds'])",
    description: "Создать диапазон времени",
    category: "range",
    minArgs: 2,
    maxArgs: 3,
    returnType: "any",
    example: "TSRANGE('2025-01-01', '2025-02-01')",
  },
  {
    name: "tsrangeBefore",
    signature: "tsrangeBefore(range, value)",
    description: "Диапазон до значения",
    category: "range",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "tsrangeAfter",
    signature: "tsrangeAfter(range, value)",
    description: "Диапазон после значения",
    category: "range",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "tsrangeIncludes",
    signature: "tsrangeIncludes(outer, inner)",
    description: "Включение диапазона",
    category: "range",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "tsrangeIntersects",
    signature: "tsrangeIntersects(a, b)",
    description: "Пересечение диапазонов",
    category: "range",
    minArgs: 2,
    maxArgs: 2,
    returnType: "boolean",
  },
  {
    name: "tsrangeInterval",
    signature: "tsrangeInterval(range [, 'unit'])",
    description: "Длительность диапазона",
    category: "range",
    minArgs: 1,
    maxArgs: 2,
    returnType: "number",
  },

  // --- Пользователь ---
  {
    name: "hasRole",
    signature: "hasRole(role)",
    description: "Проверить роль пользователя",
    category: "user",
    minArgs: 1,
    maxArgs: 1,
    returnType: "boolean",
  },
  {
    name: "hasUserGroup",
    signature: "hasUserGroup(group)",
    description: "Проверить группу пользователя",
    category: "user",
    minArgs: 1,
    maxArgs: 1,
    returnType: "boolean",
  },
  {
    name: "isSuperAdmin",
    signature: "isSuperAdmin()",
    description: "Проверить статус суперадмина",
    category: "user",
    minArgs: 0,
    maxArgs: 0,
    returnType: "boolean",
  },

  // --- Приведение типов / вложенные запросы ---
  {
    name: "CAST",
    signature: "CAST(value, 'TYPE')",
    description: "Привести к типу",
    category: "conversion",
    minArgs: 2,
    maxArgs: 2,
    returnType: "any",
  },
  {
    name: "SELECT",
    signature: "SELECT(...)",
    description: "Вложенный запрос",
    category: "conversion",
    minArgs: 1,
    maxArgs: Infinity,
    returnType: "any",
  },
  {
    name: "FROM",
    signature: "FROM('domain', @source [, alias])",
    description: "Источник данных",
    category: "conversion",
    minArgs: 1,
    maxArgs: 3,
    returnType: "any",
  },
  {
    name: "JOIN",
    signature: "JOIN(...)",
    description: "Соединение",
    category: "conversion",
    minArgs: 3,
    maxArgs: 4,
    returnType: "any",
  },
  {
    name: "WHERE",
    signature: "WHERE(expr)",
    description: "Фильтр",
    category: "conversion",
    minArgs: 1,
    maxArgs: 1,
    returnType: "any",
  },
  {
    name: "GROUP",
    signature: "GROUP(...)",
    description: "Группировка",
    category: "conversion",
    minArgs: 1,
    maxArgs: Infinity,
    returnType: "any",
  },
  {
    name: "HAVING",
    signature: "HAVING(expr)",
    description: "Фильтр после группировки",
    category: "conversion",
    minArgs: 1,
    maxArgs: 1,
    returnType: "any",
  },
  {
    name: "ORDER",
    signature: "ORDER(asc(x), desc(y))",
    description: "Сортировка",
    category: "conversion",
    minArgs: 1,
    maxArgs: Infinity,
    returnType: "any",
  },
  {
    name: "LIMIT",
    signature: "LIMIT(n)",
    description: "Ограничение количества",
    category: "conversion",
    minArgs: 1,
    maxArgs: 1,
    returnType: "any",
  },

  // --- Агрегатные ---
  {
    name: "array_agg",
    signature: "array_agg(expr)",
    description:
      "Собирает значения в массив. Используется в SELECT-запросах для возврата списка id связанных объектов.",
    category: "aggregate",
    minArgs: 1,
    maxArgs: 1,
    returnType: "array",
  },
  {
    name: "count",
    signature: "count(expr)",
    description: "Количество значений",
    category: "aggregate",
    minArgs: 1,
    maxArgs: 1,
    returnType: "number",
  },
  {
    name: "sum",
    signature: "sum(expr)",
    description: "Сумма",
    category: "aggregate",
    minArgs: 1,
    maxArgs: 1,
    returnType: "number",
  },
  {
    name: "avg",
    signature: "avg(expr)",
    description: "Среднее",
    category: "aggregate",
    minArgs: 1,
    maxArgs: 1,
    returnType: "number",
  },
  {
    name: "min",
    signature: "min(expr)",
    description: "Минимум",
    category: "aggregate",
    minArgs: 1,
    maxArgs: 1,
    returnType: "any",
  },
  {
    name: "max",
    signature: "max(expr)",
    description: "Максимум",
    category: "aggregate",
    minArgs: 1,
    maxArgs: 1,
    returnType: "any",
  },
  {
    name: "ON",
    signature: "ON(condition)",
    description:
      "Условие соединения внутри join(...). Используется только в связке с join.",
    category: "conversion",
    minArgs: 1,
    maxArgs: 1,
    returnType: "any",
  },
  // --- Агрегатные дополнительные ---
  {
    name: "string_agg",
    signature: "string_agg(expr, delimiter)",
    description:
      "Собирает строковые значения в одну строку через разделитель. Используется в SELECT-запросах.",
    category: "aggregate",
    minArgs: 2,
    maxArgs: 2,
    returnType: "string",
    example: "string_agg(@e_Asset.hostname, ', ')",
  },
  {
    name: "json_agg",
    signature: "json_agg(expr)",
    description:
      "Собирает значения в JSON-массив. Используется в SELECT-запросах.",
    category: "aggregate",
    minArgs: 1,
    maxArgs: 1,
    returnType: "array",
  },

  // --- Функции для работы с массивами (ClickHouse-совместимые) ---
  {
    name: "array_join",
    signature: "array_join(array, delimiter)",
    description: "Объединяет элементы массива в строку через разделитель.",
    category: "array",
    minArgs: 2,
    maxArgs: 2,
    returnType: "string",
    example: "array_join(@doc.tags, ', ')",
  },
  {
    name: "array_map",
    signature: "array_map(func, array)",
    description:
      "Применяет функцию к каждому элементу массива и возвращает массив результатов. Для передачи функции используется лямбда-синтаксис ClickHouse.",
    category: "array",
    minArgs: 2,
    maxArgs: Infinity,
    returnType: "array",
    example: "array_map(x -> x * 2, @doc.values)",
  },
  {
    name: "array_filter",
    signature: "array_filter(func, array)",
    description:
      "Оставляет только те элементы массива, для которых функция возвращает истину.",
    category: "array",
    minArgs: 2,
    maxArgs: 2,
    returnType: "array",
    example: "array_filter(x -> x > 0, @doc.values)",
  },
];

const FUNCTIONS_BY_NAME = new Map<string, RqlFunction>(
  RQL_FUNCTIONS.map((f) => [f.name.toUpperCase(), f]),
);

export function findFunction(name: string): RqlFunction | undefined {
  return FUNCTIONS_BY_NAME.get(name.toUpperCase());
}
