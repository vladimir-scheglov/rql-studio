import type {
  Node,
  BinaryExpr,
  UnaryExpr,
  FunctionCall,
  AliasRef,
} from "../rql/parser/ast";
import type { SymbolTable } from "../schema/symbol-table";

export interface EvalContext {
  /** Значения атрибутов объекта */
  obj: Record<string, any>;
  /** Текущая сущность */
  entityFqid: string;
  /** Текущий пользователь */
  currentUser?: {
    id: string;
    username: string;
    roles?: string[];
    groups?: string[];
  };
  /** Текущая дата/время */
  currentDate?: Date;
  /** Значения связанных объектов (для @e_X.attr, @link_X.attr) */
  linkages?: Record<string, any>;
  /** Значения перечислений: enumId.valueId → 'valueId' */
  table: SymbolTable;
}

export interface EvalResult {
  value: any;
  error?: string;
}

// =========================================================================

export function evaluate(node: Node, ctx: EvalContext): EvalResult {
  try {
    const value = evalNode(node, ctx);
    return { value };
  } catch (e: any) {
    return { value: null, error: e.message ?? String(e) };
  }
}

// =========================================================================

function evalNode(node: Node, ctx: EvalContext): any {
  switch (node.kind) {
    case "literal":
      return node.value;

    case "alias":
      return evalAlias(node, ctx);

    case "binary":
      return evalBinary(node, ctx);

    case "unary":
      return evalUnary(node, ctx);

    case "call":
      return evalCall(node, ctx);

    case "paren":
      return evalNode(node.inner, ctx);

    case "array":
      return node.elements.map((e) => evalNode(e, ctx));

    case "in":
      return evalIn(node, ctx);

    case "between":
      return evalBetween(node, ctx);

    case "isnull":
      return evalIsNull(node, ctx);

    case "like":
      return evalLike(node, ctx);

    case "select":
      // Вложенные запросы в симуляторе не поддерживаются
      return null;

    case "ident":
      // Голый идентификатор — может быть атрибутом
      return ctx.obj[node.name] ?? null;

    default:
      return null;
  }
}

// =========================================================================
// Aliases
// =========================================================================

function evalAlias(node: AliasRef, ctx: EvalContext): any {
  const [head, ...rest] = node.parts;

  if (head === "@doc") {
    if (rest.length === 0) return ctx.obj;
    return ctx.obj[rest[0]] ?? null;
  }

  if (head === "@CurrentUser") {
    if (!ctx.currentUser) return null;
    if (rest.length === 0) return ctx.currentUser;
    if (rest[0] === "id") return ctx.currentUser.id;
    if (rest[0] === "username") return ctx.currentUser.username;
    return null;
  }

  if (head === "@CurrentDate") {
    return (ctx.currentDate ?? new Date()).toISOString().slice(0, 10);
  }
  if (head === "@CurrentTime") {
    return (ctx.currentDate ?? new Date()).toISOString().slice(11, 19);
  }
  if (head === "@CurrentTimestamp" || head === "@CurrentDateTime") {
    return (ctx.currentDate ?? new Date()).toISOString();
  }
  if (head === "@CurrentDayOfWeek") {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[(ctx.currentDate ?? new Date()).getDay()];
  }
  if (head === "@row" || head === "@index") return null;

  // Псевдонимы связей — из контекста linkages
  if (ctx.linkages) {
    const key = head.slice(1); // без @
    if (ctx.linkages[key] !== undefined) {
      if (rest.length === 0) return ctx.linkages[key];
      return ctx.linkages[key]?.[rest[0]] ?? null;
    }
  }

  // @EnumId.valueId → возвращаем valueId как строку
  if (rest.length > 0) {
    return rest[0];
  }

  // Просто @EnumId без значения — невалидно в симуляторе
  return null;
}

// =========================================================================
// Binary
// =========================================================================

function evalBinary(node: BinaryExpr, ctx: EvalContext): any {
  const L = evalNode(node.left, ctx);
  const R = evalNode(node.right, ctx);

  switch (node.op) {
    case "=":
      return looseEq(L, R);
    case "!=":
      return !looseEq(L, R);
    case ">":
      return cmp(L, R) > 0;
    case "<":
      return cmp(L, R) < 0;
    case ">=":
      return cmp(L, R) >= 0;
    case "<=":
      return cmp(L, R) <= 0;
    case "AND":
      return truthy(L) && truthy(R);
    case "OR":
      return truthy(L) || truthy(R);
    case "+":
      return toNum(L) + toNum(R);
    case "-":
      return toNum(L) - toNum(R);
    case "*":
      return toNum(L) * toNum(R);
    case "/":
      return toNum(L) / toNum(R);
    case "%":
      return toNum(L) % toNum(R);
    default:
      return null;
  }
}

function looseEq(a: any, b: any): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === typeof b) return a === b;
  // Разные типы — пытаемся привести
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

function cmp(a: any, b: any): number {
  if (a === null || a === undefined) return b === null ? 0 : -1;
  if (b === null || b === undefined) return 1;

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();

  // Строки и даты в виде строк
  if (typeof a === "string" && typeof b === "string") {
    // ISO-даты сравниваются как строки корректно
    return a.localeCompare(b);
  }

  return Number(a) - Number(b);
}

function truthy(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function toNum(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

// =========================================================================
// Unary
// =========================================================================

function evalUnary(node: UnaryExpr, ctx: EvalContext): any {
  const v = evalNode(node.operand, ctx);
  if (node.op === "NOT") return !truthy(v);
  if (node.op === "-") return -toNum(v);
  return null;
}

// =========================================================================
// Call
// =========================================================================

function evalCall(node: FunctionCall, ctx: EvalContext): any {
  const name = node.name.toUpperCase();

  // --- Особые случаи: требуют ленивого вычисления аргументов ---

  if (name === "AND") {
    return node.args.every((a) => truthy(evalNode(a, ctx)));
  }
  if (name === "OR") {
    return node.args.some((a) => truthy(evalNode(a, ctx)));
  }
  if (name === "NOT") {
    return !truthy(evalNode(node.args[0], ctx));
  }
  if (name === "IF") {
    const [cond, thenN, elseN] = node.args;
    return truthy(evalNode(cond, ctx))
      ? evalNode(thenN, ctx)
      : evalNode(elseN, ctx);
  }
  if (name === "COALESCE") {
    for (const a of node.args) {
      const v = evalNode(a, ctx);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }
  if (name === "ISNULL") {
    return evalNode(node.args[0], ctx) === null;
  }
  if (name === "ISNOTNULL") {
    return evalNode(node.args[0], ctx) !== null;
  }

  // --- Конструкторы массивов и вложенные SELECT ---

  if (name === "ARRAY") {
    return node.args.map((a) => evalNode(a, ctx));
  }
  if (name === "UNNEST") {
    // UNNEST(ARRAY(...)) → возвращаем массив как есть
    return node.args.length === 1 ? evalNode(node.args[0], ctx) : null;
  }
  if (name === "SELECT") {
    // SELECT(x, y, z) или SELECT(UNNEST(ARRAY(...)))
    // Если один аргумент — разворачиваем его.
    // Если несколько — возвращаем массив вычисленных значений.
    if (node.args.length === 0) return null;
    if (node.args.length === 1) return evalNode(node.args[0], ctx);
    return node.args.map((a) => evalNode(a, ctx));
  }

  // --- Все остальные функции: вычисляем аргументы заранее ---

  const args = node.args.map((a) => evalNode(a, ctx));

  switch (name) {
    // Сравнение
    case "EQ":
      return looseEq(args[0], args[1]);
    case "NE":
      return !looseEq(args[0], args[1]);
    case "LT":
      return cmp(args[0], args[1]) < 0;
    case "LTE":
      return cmp(args[0], args[1]) <= 0;
    case "GT":
      return cmp(args[0], args[1]) > 0;
    case "GTE":
      return cmp(args[0], args[1]) >= 0;

    // Строковые и множественные
    case "LIKE":
      return matchLike(args[0], args[1]);
    case "IN": {
      const set = args[1];
      if (!Array.isArray(set)) return false;
      return set.some((x) => looseEq(x, args[0]));
    }
    case "NOTIN": {
      const set = args[1];
      if (!Array.isArray(set)) return true;
      return !set.some((x) => looseEq(x, args[0]));
    }

    // Массивы
    case "HAS": {
      const arr = args[0];
      return Array.isArray(arr) && arr.some((x) => looseEq(x, args[1]));
    }
    case "HASALL": {
      const arr = args[0];
      const values = args[1];
      if (!Array.isArray(arr) || !Array.isArray(values)) return false;
      return values.every((v) => arr.some((x) => looseEq(x, v)));
    }
    case "HASANY": {
      const arr = args[0];
      const values = args[1];
      if (!Array.isArray(arr) || !Array.isArray(values)) return false;
      return values.some((v) => arr.some((x) => looseEq(x, v)));
    }

    // Пользователь
    case "HASROLE": {
      const role = args[0];
      return ctx.currentUser?.roles?.includes(String(role)) ?? false;
    }
    case "HASUSERGROUP": {
      const group = args[0];
      return ctx.currentUser?.groups?.includes(String(group)) ?? false;
    }
    case "ISSUPERADMIN":
      return ctx.currentUser?.roles?.includes("superadmin") ?? false;

    // Агрегаты — в контексте симулятора возвращаем 0
    case "COUNT":
      return 0;
    case "SUM":
      return 0;
    case "AVG":
      return 0;
    case "MIN":
      return null;
    case "MAX":
      return null;

    // Прочее
    case "LENGTH": {
      const v = args[0];
      if (typeof v === "string") return v.length;
      if (Array.isArray(v)) return v.length;
      return 0;
    }
    case "LOWER":
      return typeof args[0] === "string" ? args[0].toLowerCase() : args[0];
    case "UPPER":
      return typeof args[0] === "string" ? args[0].toUpperCase() : args[0];

    // Неизвестная функция
    default:
      return null;
  }
}
function matchLike(value: any, pattern: any): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value);
  const p = String(pattern);
  // Преобразуем SQL LIKE в регексп
  const re = p
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  try {
    return new RegExp("^" + re + "$").test(s);
  } catch {
    return false;
  }
}

// =========================================================================
// In / Between / IsNull / Like
// =========================================================================

function evalIn(node: any, ctx: EvalContext): boolean {
  const v = evalNode(node.value, ctx);
  const set = evalNode(node.set, ctx);
  const result = Array.isArray(set) && set.some((x) => looseEq(x, v));
  return node.negated ? !result : result;
}

function evalBetween(node: any, ctx: EvalContext): boolean {
  const v = evalNode(node.value, ctx);
  const from = evalNode(node.from, ctx);
  const to = evalNode(node.to, ctx);
  const result = cmp(v, from) >= 0 && cmp(v, to) <= 0;
  return node.negated ? !result : result;
}

function evalIsNull(node: any, ctx: EvalContext): boolean {
  const v = evalNode(node.value, ctx);
  const result = v === null || v === undefined;
  return node.negated ? !result : result;
}

function evalLike(node: any, ctx: EvalContext): boolean {
  const v = evalNode(node.value, ctx);
  const p = evalNode(node.pattern, ctx);
  const result = matchLike(v, p);
  return node.negated ? !result : result;
}
