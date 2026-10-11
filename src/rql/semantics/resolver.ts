import type {
  Node,
  AliasRef,
  FunctionCall,
  BinaryExpr,
  InExpr,
  BetweenExpr,
} from "../parser/ast";
import type {
  ResolvedEntity,
  ResolvedLinkage,
  SymbolTable,
} from "../../schema/symbol-table";
import { findFunction, RQL_FUNCTIONS } from "../functions";
import { schemaDataTypeToRqlType, isCompatible, type RqlType } from "./types";
import { collectScope, type Scope } from "./scope";
import { SYSTEM_LINKAGE_ATTRIBUTES } from "../../schema/system-attributes";

export interface PublicResolverContext {
  symbolTable: SymbolTable;
  entityFqid: string;
  domain: string;
}

export interface ResolverContext extends PublicResolverContext {
  scope: Scope;
}

export interface SemanticDiagnostic {
  message: string;
  severity: "error" | "warning" | "info";
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  startOffset: number;
  endOffset: number;
  quickFixes?: QuickFix[];
}

export interface QuickFix {
  title: string;
  /** Что вставить вместо указанного диапазона */
  replacement: string;
  /** Границы замены (абсолютные offset'ы) */
  startOffset: number;
  endOffset: number;
}

/**
 * Публичный вход. Scope считается внутри — пользователь передаёт
 * только symbolTable, entityFqid и domain.
 */
export function resolveAst(
  ast: Node,
  ctx: PublicResolverContext,
): SemanticDiagnostic[] {
  const out: SemanticDiagnostic[] = [];
  const scope = collectScope(ast, ctx.symbolTable, ctx.domain);
  const fullCtx: ResolverContext = { ...ctx, scope };

  walk(ast, fullCtx, out);
  return out;
}

function walk(
  node: Node,
  ctx: ResolverContext,
  out: SemanticDiagnostic[],
): void {
  switch (node.kind) {
    case "alias":
      checkAlias(node, ctx, out);
      break;
    case "call":
      checkCall(node, ctx, out);
      for (const a of node.args) walk(a, ctx, out);
      break;
    case "binary":
      walk(node.left, ctx, out);
      walk(node.right, ctx, out);
      checkBinaryTypes(node, ctx, out);
      break;
    case "unary":
      walk(node.operand, ctx, out);
      break;
    case "paren":
      walk(node.inner, ctx, out);
      break;
    case "array":
      for (const el of node.elements) walk(el, ctx, out);
      break;
    case "between":
      walk(node.value, ctx, out);
      walk(node.from, ctx, out);
      walk(node.to, ctx, out);
      checkBetweenTypes(node, ctx, out);
      break;
    case "like":
      walk(node.value, ctx, out);
      walk(node.pattern, ctx, out);
      break;
    case "isnull":
      walk(node.value, ctx, out);
      break;
    case "select":
      for (const f of node.fields) walk(f, ctx, out);
      if (node.from) walk(node.from, ctx, out);
      for (const j of node.joins) walk(j, ctx, out);
      if (node.where) walk(node.where, ctx, out);
      for (const g of node.groupBy) walk(g, ctx, out);
      if (node.having) walk(node.having, ctx, out);
      for (const o of node.orderBy) walk(o.expr, ctx, out);
      break;
    case "in":
      walk(node.value, ctx, out);
      walk(node.set, ctx, out);
      checkInTypes(node, ctx, out);
      break;
  }
}

// --- checkAlias ----------------------------------------------------------

function checkAlias(
  node: AliasRef,
  ctx: ResolverContext,
  out: SemanticDiagnostic[],
): void {
  const [head, ...rest] = node.parts;

  // 1. Системные псевдонимы
  if (head === "@doc") {
    if (rest.length === 0 || !ctx.entityFqid) return;
    const entity = ctx.symbolTable.entities.get(ctx.entityFqid);
    if (!entity) return;
    checkEntityAttribute(node, rest[0], entity, out);
    return;
  }

  if (head === "@row" || head === "@index" || head.startsWith("@Current")) {
    return;
  }

  // 2. Объявленные псевдонимы
  const kind = ctx.scope.get(head);

  if (kind?.kind === "entity" && rest.length > 0) {
    const entity = ctx.symbolTable.entities.get(kind.entityFqid);
    if (entity) checkEntityAttribute(node, rest[0], entity, out);
    return;
  }

  if (kind?.kind === "linkage" && rest.length > 0) {
    const linkage = ctx.symbolTable.linkages.get(kind.linkageFqid);
    if (linkage) checkLinkageAttribute(node, rest[0], linkage, out);
    return;
  }

  if (kind) return; // объявленный псевдоним без обращения к атрибутам

  // 3. Ссылки на перечисления / workflow (не меняются)
  if (rest.length > 0) {
    const typeId = head.slice(1);
    const localFqid = `${ctx.domain}/${typeId}`;
    const enumValues =
      ctx.symbolTable.enums.get(localFqid) ??
      ctx.symbolTable.enums.get(typeId) ??
      ctx.symbolTable.workflows.get(localFqid) ??
      ctx.symbolTable.workflows.get(typeId);

    if (enumValues) {
      const valueId = rest[0];
      if (!enumValues.some((v) => v.id === valueId)) {
        const candidates = enumValues.map((v) => v.id);
        const closest = findClosest(valueId, candidates);

        const quickFixes: QuickFix[] = closest.slice(0, 5).map((c) => ({
          title: `→ @${typeId}.${c}`,
          replacement: `@${typeId}.${c}`,
          startOffset: node.pos.startOffset,
          endOffset: node.pos.endOffset,
        }));

        out.push(
          diagnostic(
            node,
            "error",
            `В перечислении "${typeId}" нет значения "${valueId}"`,
            quickFixes,
          ),
        );
      }
      return;
    }
  }

  out.push(diagnostic(node, "warning", `Неизвестный псевдоним "${node.raw}"`));
}

// --- проверка атрибутов сущности -----------------------------------------

function checkEntityAttribute(
  node: AliasRef,
  attrName: string,
  entity: ResolvedEntity,
  out: SemanticDiagnostic[],
): void {
  if (entity.attributes.has(attrName)) return;

  const candidates = [...entity.attributes.keys()];
  const closest = findClosest(attrName, candidates);
  const prefix = node.parts[0]; // '@doc' или '@e_Incident_Ioc'

  const quickFixes: QuickFix[] = closest.slice(0, 5).map((c) => ({
    title: `→ ${prefix}.${c}`,
    replacement: `${prefix}.${c}`,
    startOffset: node.pos.startOffset,
    endOffset: node.pos.endOffset,
  }));

  out.push(
    diagnostic(
      node,
      "error",
      `У сущности "${entity.entity.id}" нет атрибута "${attrName}"`,
      quickFixes,
    ),
  );
}

// --- проверка атрибутов связи --------------------------------------------

function checkLinkageAttribute(
  node: AliasRef,
  attrName: string,
  linkage: ResolvedLinkage,
  out: SemanticDiagnostic[],
): void {
  // Собственные атрибуты связи + системные
  const ownAttributes = linkage.attributes ?? [];
  const systemIds = new Set(SYSTEM_LINKAGE_ATTRIBUTES.map((a) => a.id));
  const ownIds = new Set(ownAttributes.map((a) => a.id));

  if (ownIds.has(attrName) || systemIds.has(attrName)) return;

  const candidates = [
    ...ownAttributes.map((a) => a.id),
    ...SYSTEM_LINKAGE_ATTRIBUTES.map((a) => a.id),
  ];
  const closest = findClosest(attrName, candidates);
  const prefix = node.parts[0];

  const quickFixes: QuickFix[] = closest.slice(0, 5).map((c) => ({
    title: `→ ${prefix}.${c}`,
    replacement: `${prefix}.${c}`,
    startOffset: node.pos.startOffset,
    endOffset: node.pos.endOffset,
  }));

  out.push(
    diagnostic(
      node,
      "error",
      `У связи "${linkage.id}" нет атрибута "${attrName}"`,
      quickFixes,
    ),
  );
}
// --- checkCall -----------------------------------------------------------

const SQL_KEYWORDS_AS_FUNCTIONS = new Set(["ON", "ASC", "DESC", "BY"]);

function checkCall(
  node: FunctionCall,
  ctx: ResolverContext,
  out: SemanticDiagnostic[],
): void {
  const upper = node.name.toUpperCase();
  if (SQL_KEYWORDS_AS_FUNCTIONS.has(upper)) {
    // Всё ок — это ключевое слово в составе другого выражения
    return;
  }

  // Функции-обёртки для массивов — проверяем отдельно
  if (ARRAY_FUNCTIONS.has(upper)) {
    checkArrayFunction(node, ctx, out);
  }

  const fn = findFunction(node.name);
  if (!fn) {
    const candidates = RQL_FUNCTIONS.map((f) => f.name);
    const closest = findClosest(node.name, candidates);

    const quickFixes: QuickFix[] = closest.slice(0, 3).map((c) => ({
      title: `→ ${c}`,
      replacement: c,
      startOffset: node.pos.startOffset,
      endOffset: node.pos.startOffset + node.name.length,
    }));

    out.push(
      diagnostic(
        node,
        "warning",
        `Неизвестная функция "${node.name}"`,
        quickFixes,
      ),
    );
    return;
  }

  const n = node.args.length;
  if (n < fn.minArgs) {
    out.push(
      diagnostic(
        node,
        "error",
        `Функция "${fn.name}" ожидает минимум ${fn.minArgs} ${plural(fn.minArgs, "аргумент", "аргумента", "аргументов")}, передано ${n}`,
      ),
    );
  } else if (n > fn.maxArgs) {
    out.push(
      diagnostic(
        node,
        "error",
        `Функция "${fn.name}" ожидает не более ${fn.maxArgs} ${plural(fn.maxArgs, "аргумент", "аргумента", "аргументов")}, передано ${n}`,
      ),
    );
  }
}

// --- checkBinaryTypes ----------------------------------------------------

function checkBinaryTypes(
  node: BinaryExpr,
  ctx: ResolverContext,
  out: SemanticDiagnostic[],
): void {
  if (node.op === "AND" || node.op === "OR") return;
  if (
    node.op === "+" ||
    node.op === "-" ||
    node.op === "*" ||
    node.op === "/" ||
    node.op === "%"
  ) {
    return; // арифметика — отдельная проверка, пока не делаем
  }

  const lt = inferType(node.left, ctx);
  const rt = inferType(node.right, ctx);

  if (!isCompatible(lt, rt)) {
    out.push(
      diagnostic(
        node,
        "error",
        `Несовместимые типы в сравнении "${node.op}": ${lt} и ${rt}`,
      ),
    );
  }
}

// --- Типизатор выражений -------------------------------------------------

function inferType(node: Node, ctx: ResolverContext): RqlType {
  switch (node.kind) {
    case "literal":
      if (node.type === "null") return "null";
      if (node.type === "string") return "string";
      if (node.type === "number") return "number";
      if (node.type === "boolean") return "boolean";
      return "any";
    case "alias":
      return inferAliasType(node, ctx);
    case "call": {
      const fn = findFunction(node.name);
      return fn?.returnType ?? "any";
    }
    case "binary":
      return isBooleanOp(node.op) ? "boolean" : "number";
    case "unary":
      return node.op === "NOT" ? "boolean" : "number";
    case "paren":
      return inferType(node.inner, ctx);
    case "array":
      return "array";
    case "between":
    case "in":
    case "isnull":
    case "like":
      return "boolean";
    default:
      return "any";
  }
}

function isBooleanOp(op: BinaryExpr["op"]): boolean {
  return (
    op === "AND" ||
    op === "OR" ||
    op === "=" ||
    op === "!=" ||
    op === "<" ||
    op === ">" ||
    op === "<=" ||
    op === ">="
  );
}

function inferAliasType(node: AliasRef, ctx: ResolverContext): RqlType {
  const [head, ...rest] = node.parts;

  if (head === "@doc") {
    if (rest.length === 0) return "reference";
    if (!ctx.entityFqid) return "any";
    const entity = ctx.symbolTable.entities.get(ctx.entityFqid);
    const attr = entity?.attributes.get(rest[0]);
    if (!attr) return "any";
    return resolveAttrType(attr.dataType, ctx);
  }

  if (head === "@CurrentDate") return "date";
  if (head === "@CurrentTime") return "time";
  if (head === "@CurrentTimestamp" || head === "@CurrentDateTime")
    return "timestamp";
  if (head === "@CurrentDayOfWeek") return "string";
  if (head === "@CurrentUser") {
    if (rest[0] === "id") return "uuid";
    if (rest[0] === "username") return "string";
    return "reference";
  }
  if (head === "@row") return "any";
  if (head === "@index") return "number";

  // Псевдонимы из scope: @e_X.attr и @link_X.attr
  const kind = ctx.scope.get(head);
  if (kind?.kind === "entity" && rest.length > 0) {
    const entity = ctx.symbolTable.entities.get(kind.entityFqid);
    const attr = entity?.attributes.get(rest[0]);
    if (attr) return resolveAttrType(attr.dataType, ctx);
    return "any";
  }
  if (kind?.kind === "linkage" && rest.length > 0) {
    const linkage = ctx.symbolTable.linkages.get(kind.linkageFqid);
    if (!linkage) return "any";
    // Системные атрибуты связи
    const sysAttr = SYSTEM_LINKAGE_ATTRIBUTES.find((a) => a.id === rest[0]);
    if (sysAttr) return schemaDataTypeToRqlType(sysAttr.dataType);
    // Собственные атрибуты связи из схемы
    const own = linkage.attributes?.find((a) => a.id === rest[0]);
    if (own) return resolveAttrType(own.dataType, ctx);
    return "any";
  }

  // @enumX.Y / @workflowX.Y
  if (rest.length > 0) {
    const typeId = head.slice(1);
    const localFqid = `${ctx.domain}/${typeId}`;
    if (
      ctx.symbolTable.enums.has(localFqid) ||
      ctx.symbolTable.enums.has(typeId)
    )
      return "enum";
    if (
      ctx.symbolTable.workflows.has(localFqid) ||
      ctx.symbolTable.workflows.has(typeId)
    )
      return "workflow";
  }

  return "any";
}

/**
 * Резолвит тип данных атрибута с учётом пользовательских типов.
 * Сначала пробует как встроенный, потом ищет в dataTypes.
 */
function resolveAttrType(dataType: string, ctx: ResolverContext): RqlType {
  const builtin = schemaDataTypeToRqlType(dataType);
  if (builtin !== "any") return builtin;

  const localFqid = `${ctx.domain}/${dataType}`;
  if (
    ctx.symbolTable.enums.has(localFqid) ||
    ctx.symbolTable.enums.has(dataType)
  ) {
    return "enum";
  }
  if (
    ctx.symbolTable.workflows.has(localFqid) ||
    ctx.symbolTable.workflows.has(dataType)
  ) {
    return "workflow";
  }
  return "any";
}

// --- helpers -------------------------------------------------------------

function diagnostic(
  node: Node,
  severity: SemanticDiagnostic["severity"],
  message: string,
  quickFixes?: QuickFix[],
): SemanticDiagnostic {
  return {
    message,
    severity,
    startLine: node.pos.startLine,
    startColumn: node.pos.startColumn,
    endLine: node.pos.endLine,
    endColumn: node.pos.endColumn,
    startOffset: node.pos.startOffset,
    endOffset: node.pos.endOffset,
    quickFixes,
  };
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Нечёткий поиск: возвращает кандидатов, отсортированных по расстоянию
 * Левенштейна. Фильтрует слишком далёкие.
 */
function findClosest(needle: string, candidates: string[]): string[] {
  const scored = candidates.map((c) => ({
    c,
    d: levenshtein(needle.toLowerCase(), c.toLowerCase()),
  }));
  scored.sort((a, b) => a.d - b.d);

  // Порог: не больше max(2, len/3)
  const maxDist = Math.max(2, Math.floor(needle.length / 3));
  return scored.filter((s) => s.d <= maxDist).map((s) => s.c);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = a.length;
  const n = b.length;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1, // удаление
        cur[j - 1] + 1, // вставка
        prev[j - 1] + cost, // замена
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }

  return prev[n];
}

const ARRAY_FUNCTIONS = new Set(["HAS", "HASALL", "HASANY"]);

function checkArrayFunction(
  node: FunctionCall,
  ctx: ResolverContext,
  out: SemanticDiagnostic[],
): void {
  const name = node.name.toUpperCase();
  if (!ARRAY_FUNCTIONS.has(name)) return;

  if (node.args.length < 2) return;

  const arrT = inferType(node.args[0], ctx);
  if (arrT !== "array" && arrT !== "any") {
    out.push(
      diagnostic(
        node,
        "warning",
        `Функция ${node.name}() ожидает массив в первом аргументе, получено ${arrT}`,
      ),
    );
    return;
  }

  // Для has(array, value) — сравниваем тип второго аргумента с типом элементов
  if (name === "HAS" && node.args.length === 2) {
    const elemT = inferArrayElementType(node.args[0], ctx);
    const valT = inferType(node.args[1], ctx);
    if (elemT !== "any" && valT !== "any" && !isCompatible(elemT, valT)) {
      out.push(
        diagnostic(
          node,
          "warning",
          `Несовместимые типы в has(): элементы массива ${elemT}, значение ${valT}`,
        ),
      );
    }
  }
}

/**
 * Пытается определить тип элемента массива.
 * Для атрибута типа Array берём тип item из схемы.
 * Для всего остального возвращаем 'any'.
 */
function inferArrayElementType(node: Node, ctx: ResolverContext): RqlType {
  if (node.kind === "alias") {
    const [head, ...rest] = node.parts;

    if (head === "@doc" && rest.length > 0 && ctx.entityFqid) {
      const entity = ctx.symbolTable.entities.get(ctx.entityFqid);
      const attr = entity?.attributes.get(rest[0]);
      if (attr && attr.dataType === "Array" && attr.item) {
        return resolveAttrType(attr.item.dataType, ctx);
      }
    }

    const kind = ctx.scope.get(head);
    if (kind?.kind === "entity" && rest.length > 0) {
      const entity = ctx.symbolTable.entities.get(kind.entityFqid);
      const attr = entity?.attributes.get(rest[0]);
      if (attr && attr.dataType === "Array" && attr.item) {
        return resolveAttrType(attr.item.dataType, ctx);
      }
    }
  }
  return "any";
}

/**
 * Разбирает узел правой части IN и возвращает типы элементов.
 * Ожидаемые формы:
 *   SELECT(UNNEST(ARRAY(x, y, z)))
 *   SELECT(...)
 *   <прямой массив>
 */
function inferSetElementTypes(node: Node, ctx: ResolverContext): RqlType[] {
  switch (node.kind) {
    case "call": {
      const name = node.name.toUpperCase();
      if (name === "SELECT" || name === "UNNEST") {
        const inner = node.args[0];
        if (inner) return inferSetElementTypes(inner, ctx);
      }
      if (name === "ARRAY") {
        return node.args.map((a) => inferType(a, ctx));
      }
      return [];
    }

    case "array":
      return node.elements.map((e) => inferType(e, ctx));

    case "paren":
      return inferSetElementTypes(node.inner, ctx);

    case "select": {
      // SELECT(...) разобран как selectStatement — поле одно, и это parenExpr
      if (node.fields.length === 1) {
        return inferSetElementTypes(node.fields[0], ctx);
      }
      // SELECT a, b, c — набор значений без FROM/WHERE
      return node.fields.map((f) => inferType(f, ctx));
    }

    default:
      return [];
  }
}

function checkInTypes(
  node: InExpr,
  ctx: ResolverContext,
  out: SemanticDiagnostic[],
): void { 
  const valueType = inferType(node.value, ctx);
  const elemTypes = inferSetElementTypes(node.set, ctx);

  if (elemTypes.length === 0) return;
  if (valueType === "any") return;
  if (elemTypes.some((t) => t === "any")) return;

  if (elemTypes.some((t) => isCompatible(valueType, t))) return;

  out.push(
    diagnostic(
      node,
      "warning",
      `Несовместимые типы в IN: ${valueType} и ${elemTypes.join(" | ")}`,
    ),
  );
}

function checkBetweenTypes(
  node: BetweenExpr,
  ctx: ResolverContext,
  out: SemanticDiagnostic[],
): void {
  const valueType = inferType(node.value, ctx);
  const fromType = inferType(node.from, ctx);
  const toType = inferType(node.to, ctx);

  if (valueType === "any") return;
  if (fromType === "any" && toType === "any") return;

  const fromCompatible = isCompatible(valueType, fromType);
  const toCompatible = isCompatible(valueType, toType);

  if (!fromCompatible || !toCompatible) {
    out.push(
      diagnostic(
        node,
        "warning",
        `Несовместимые типы в BETWEEN: ${valueType} и ${fromType}..${toType}`,
      ),
    );
  }
}
