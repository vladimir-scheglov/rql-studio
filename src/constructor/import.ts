import type {
  Node,
  BinaryExpr,
  FunctionCall,
  AliasRef,
  Literal,
  ArrayLiteral,
  SelectStatement,
} from "../rql/parser/ast";
import { resolveEntityFqid, resolveLinkageFqid, type SymbolTable } from "../schema/symbol-table";
import { parseFqid } from "../schema/fqid";
import type {
  ConditionNode,
  GroupNode,
  LeafNode,
  LeafOperator,
  LeafValue,
  LinkageNode,
} from "./types";
import { nextId } from "./types";

export interface ImportResult {
  root: GroupNode | null;
  errors: string[];
}

/**
 * Импортирует RQL-выражение (AST) в дерево конструктора.
 * Возвращает root-группу или null, если разобрать не удалось.
 */
export function importFromRql(
  ast: Node,
  table: SymbolTable,
  domain: string,
  entityFqid: string,
): ImportResult {
  const errors: string[] = [];
  try {
    const node = convert(ast, { table, domain, entityFqid, errors });
    if (!node || errors.length > 0) {
      return { root: null, errors };
    }
    // Корень всегда группа — оборачиваем, если пришёл leaf
    if (node.kind === "group") {
      return { root: node, errors };
    }
    const root: GroupNode = {
      id: nextId("g"),
      kind: "group",
      operator: "AND",
      children: [node],
    };
    return { root, errors };
  } catch (e: any) {
    errors.push(e.message ?? String(e));
    return { root: null, errors };
  }
}

interface Ctx {
  table: SymbolTable;
  domain: string;
  entityFqid: string;
  errors: string[];
}

function convert(node: Node, ctx: Ctx): ConditionNode | null {
  const linkage = tryConvertLinkage(node, ctx);
  if (linkage) return linkage;

  switch (node.kind) {
    case "binary":
      return convertBinary(node, ctx);
    case "unary":
      return convertUnary(node, ctx);
    case "paren":
      return convert(node.inner, ctx);
    case "in":
      return convertIn(node, ctx);
    case "between":
      return convertBetween(node, ctx);
    case "like":
      return convertLike(node, ctx);
    case "isnull":
      return convertIsNull(node, ctx);
    case "call":
      return convertCall(node, ctx);
    default:
      if (node.kind === "select") {
        ctx.errors.push(
          "Это правило содержит цепочку связей (SELECT). " +
            "Конструктор редактирует только простые условия. " +
            "Используйте «Построитель пути» или отредактируйте правило вручную в редакторе кода.",
        );
      } else {
        ctx.errors.push(`Неподдерживаемый узел: ${node.kind}`);
      }
      return null;
  }
}

// --- Группы (AND / OR) ---------------------------------------------------

function convertBinary(node: BinaryExpr, ctx: Ctx): ConditionNode | null {
  if (node.op === "AND" || node.op === "OR") {
    const left = convert(node.left, ctx);
    const right = convert(node.right, ctx);

    // Разворачиваем один уровень вложенности: если left — группа с тем же
    // оператором, добавляем right как брат, а не как вложенную группу.
    const children: ConditionNode[] = [];
    if (left) {
      if (left.kind === "group" && left.operator === node.op) {
        children.push(...left.children);
      } else {
        children.push(left);
      }
    }
    if (right) {
      if (right.kind === "group" && right.operator === node.op) {
        children.push(...right.children);
      } else {
        children.push(right);
      }
    }

    return {
      id: nextId("g"),
      kind: "group",
      operator: node.op,
      children,
    };
  }

  // Обычное сравнение: =, !=, <, >, <=, >=
  return convertComparison(node, ctx);
}

function convertUnary(node: any, ctx: Ctx): ConditionNode | null {
  if (node.op !== "NOT") {
    ctx.errors.push(`Неподдерживаемый унарный оператор: ${node.op}`);
    return null;
  }
  const inner = convert(node.operand, ctx);
  if (!inner) return null;
  return {
    id: nextId("g"),
    kind: "group",
    operator: "NOT",
    children: [inner],
  };
}

// --- Простые leaf-условия ------------------------------------------------

function convertComparison(node: BinaryExpr, ctx: Ctx): LeafNode | null {
  const op = node.op as LeafOperator;
  if (!["=", "!=", ">", "<", ">=", "<="].includes(op)) {
    ctx.errors.push(`Неподдерживаемый оператор сравнения: ${node.op}`);
    return null;
  }

  const attr = extractAttribute(node.left, ctx);
  if (!attr) {
    ctx.errors.push(`Не удалось определить атрибут в сравнении "${node.op}"`);
    return null;
  }

  const value = extractValue(node.right, ctx);

  return {
    id: nextId("l"),
    kind: "leaf",
    attribute: attr,
    operator: op,
    value,
    values: [],
  };
}

function convertLike(node: any, ctx: Ctx): LeafNode | null {
  const attr = extractAttribute(node.value, ctx);
  if (!attr) {
    ctx.errors.push("Не удалось определить атрибут в LIKE");
    return null;
  }
  const value = extractValue(node.pattern, ctx);
  return {
    id: nextId("l"),
    kind: "leaf",
    attribute: attr,
    operator: "LIKE",
    value,
    values: [],
  };
}

function convertIsNull(node: any, ctx: Ctx): LeafNode | null {
  const attr = extractAttribute(node.value, ctx);
  if (!attr) {
    ctx.errors.push("Не удалось определить атрибут в IS NULL");
    return null;
  }
  return {
    id: nextId("l"),
    kind: "leaf",
    attribute: attr,
    operator: node.negated ? "IS NOT NULL" : "IS NULL",
    value: null,
    values: [],
  };
}

function convertIn(node: any, ctx: Ctx): LeafNode | null {
  const attr = extractAttribute(node.value, ctx);
  if (!attr) {
    ctx.errors.push("Не удалось определить атрибут в IN");
    return null;
  }
  const values = extractArrayValues(node.set, ctx);
  if (values.length === 0) {
    ctx.errors.push("Не удалось разобрать значения в IN");
    return null;
  }
  return {
    id: nextId("l"),
    kind: "leaf",
    attribute: attr,
    operator: "IN",
    value: null,
    values,
  };
}

function convertBetween(node: any, ctx: Ctx): LeafNode | null {
  const attr = extractAttribute(node.value, ctx);
  if (!attr) {
    ctx.errors.push("Не удалось определить атрибут в BETWEEN");
    return null;
  }
  const from = extractValue(node.from, ctx);
  const to = extractValue(node.to, ctx);
  if (!from || !to) {
    ctx.errors.push("Не удалось разобрать границы BETWEEN");
    return null;
  }
  return {
    id: nextId("l"),
    kind: "leaf",
    attribute: attr,
    operator: "BETWEEN",
    value: null,
    values: [from, to],
  };
}

// --- has() --------------------------------------------------------------

function convertCall(node: FunctionCall, ctx: Ctx): LeafNode | null {
  const name = node.name.toUpperCase();
  if (name === "HAS" && node.args.length === 2) {
    const attr = extractAttribute(node.args[0], ctx);
    if (!attr) {
      ctx.errors.push("Не удалось определить атрибут в has()");
      return null;
    }
    const value = extractValue(node.args[1], ctx);
    return {
      id: nextId("l"),
      kind: "leaf",
      attribute: attr,
      operator: "HAS",
      value,
      values: [],
    };
  }

  ctx.errors.push(`Неподдерживаемая функция: ${node.name}`);
  return null;
}

// --- Извлечение атрибутов и значений -------------------------------------

function extractAttribute(node: Node, ctx: Ctx): string | null {
  if (node.kind === "alias") {
    const [head, ...rest] = node.parts;
    if (rest.length === 0) return null;

    // @doc.attr → attr
    if (head === "@doc") {
      return rest[0];
    }

    // @link_X.attr → X.attr (атрибут связи)
    if (head.startsWith("@link_")) {
      const linkageId = head.slice(6);
      return `${linkageId}.${rest[0]}`;
    }

    // @e_X.attr → X.attr (атрибут связанной сущности)
    if (head.startsWith("@e_")) {
      const linkageId = head.slice(3);
      return `${linkageId}.${rest[0]}`;
    }

    return null;
  }
  if (node.kind === "ident") return node.name;
  return null;
}

function extractValue(node: Node, ctx: Ctx): LeafValue | null {
  if (node.kind === "literal") {
    if (node.type === "string")
      return { kind: "string", value: node.value as string };
    if (node.type === "number")
      return { kind: "number", value: node.value as number };
    if (node.type === "boolean")
      return { kind: "boolean", value: node.value as boolean };
    if (node.type === "null") return null;
  }
  if (node.kind === "alias") {
    const [head, ...rest] = node.parts;

    if (
      head === "@CurrentDate" ||
      head === "@CurrentTime" ||
      head === "@CurrentTimestamp" ||
      head === "@CurrentDateTime"
    ) {
      // @CurrentDateTime — синоним @CurrentTimestamp
      const which: "CurrentDate" | "CurrentTime" | "CurrentTimestamp" =
        head === "@CurrentDate"
          ? "CurrentDate"
          : head === "@CurrentTime"
            ? "CurrentTime"
            : "CurrentTimestamp";

      return { kind: "system-date", which };
    }
    if (head === "@CurrentUser" && rest[0]) {
      const which = rest[0] as "id" | "username";
      return { kind: "system-user", which };
    }

    // @enumX.Y / @workflowX.Y
    if (rest.length > 0) {
      const typeId = head.slice(1);
      const localFqid = `${ctx.domain}/${typeId}`;
      if (ctx.table.enums.has(localFqid) || ctx.table.enums.has(typeId)) {
        return { kind: "enum", enumId: typeId, valueId: rest[0] };
      }
      if (
        ctx.table.workflows.has(localFqid) ||
        ctx.table.workflows.has(typeId)
      ) {
        return { kind: "workflow", workflowId: typeId, statusId: rest[0] };
      }
    }
  }
  return null;
}

function extractArrayValues(node: Node, ctx: Ctx): LeafValue[] {
  if (node.kind === "call") {
    const name = node.name.toUpperCase();
    if (name === "SELECT" || name === "UNNEST") {
      const inner = node.args[0];
      if (inner) return extractArrayValues(inner, ctx);
    }
    if (name === "ARRAY") {
      return node.args
        .map((a) => extractValue(a, ctx))
        .filter((v): v is LeafValue => v !== null);
    }
  }

  // SELECT(...) разобран как selectStatement
  if (node.kind === "select") {
    if (node.fields.length === 1) {
      return extractArrayValues(node.fields[0], ctx);
    }
    return node.fields
      .map((f) => extractValue(f, ctx))
      .filter((v): v is LeafValue => v !== null);
  }

  if (node.kind === "paren") {
    return extractArrayValues(node.inner, ctx);
  }

  if (node.kind === "array") {
    return node.elements
      .map((e) => extractValue(e, ctx))
      .filter((v): v is LeafValue => v !== null);
  }

  return [];
}

// --- Linkage -------------------------------------------------------------

function tryConvertLinkage(node: Node, ctx: Ctx): LinkageNode | null {
  // exists / not-exists
  if (node.kind === 'binary') {
    const result = tryParseExists(node, ctx);
    if (result) return result;
  }

  // linkage-attribute / entity-attribute
  if (node.kind === 'select') {
    const result = tryParseJoinSelect(node, ctx);
    if (result) return result;
  }

  return null;
}

/** exists / not-exists: <SELECT count FROM(...) WHERE(eq(@link_X.sideN, @doc.id))> [>|=] 0 */
function tryParseExists(node: BinaryExpr, ctx: Ctx): LinkageNode | null {
  if (node.op !== '>' && node.op !== '=') return null;

  // Правая часть — литерал 0
  if (
    node.right.kind !== 'literal' ||
    node.right.type !== 'number' ||
    node.right.value !== 0
  ) {
    return null;
  }

  // Левая часть — call('SELECT', [count(...), FROM(...), WHERE(...)])
  if (node.left.kind !== 'call') return null;
  if (node.left.name.toUpperCase() !== 'SELECT') return null;
  if (node.left.args.length !== 3) return null;

  const countCall = node.left.args[0];
  const fromCall = node.left.args[1];
  const whereCall = node.left.args[2];

  if (countCall.kind !== 'call' || countCall.name.toUpperCase() !== 'COUNT') return null;
  if (fromCall.kind !== 'call' || fromCall.name.toUpperCase() !== 'FROM') return null;
  if (whereCall.kind !== 'call' || whereCall.name.toUpperCase() !== 'WHERE') return null;

  // FROM('current', @linkage, @alias)
  if (fromCall.args.length < 3) return null;
  const linkageArg = fromCall.args[1];
  if (linkageArg.kind !== 'alias' || linkageArg.parts.length !== 1) return null;
  const linkageName = linkageArg.parts[0].slice(1); // без @

  // WHERE(eq(@link_X.sideN, @doc.id))
  const condition = whereCall.args[0];
  if (condition.kind !== 'call' || condition.name.toUpperCase() !== 'EQ') return null;
  if (condition.args.length !== 2) return null;

  const left = condition.args[0];
  if (left.kind !== 'alias' || left.parts.length !== 2) return null;
  const sideAttr = left.parts[1];
  if (sideAttr !== 'side1' && sideAttr !== 'side2') return null;
  const side: '1' | '2' = sideAttr === 'side1' ? '1' : '2';

  // Резолвим связь
  const linkageFqid = resolveLinkageFqid(linkageName, ctx.domain, ctx.table);
  if (!linkageFqid) return null;
  const linkage = ctx.table.linkages.get(linkageFqid);
  if (!linkage) return null;

  // Целевая сущность — противоположная сторона связи
  const targetName = side === '1' ? linkage.side2 : linkage.side1;
  const targetEntityFqid = resolveEntityFqid(targetName, ctx.domain, ctx.table) ?? '';

  return {
    id: nextId('lk'),
    kind: 'linkage',
    linkageFqid,
    side,
    targetEntityFqid,
    mode: node.op === '>' ? 'exists' : 'not-exists',
    nested: null,
  };
}

/** linkage-attribute / entity-attribute: SELECT join(...) [, join(...)] WHERE <leaf> */
function tryParseJoinSelect(node: SelectStatement, ctx: Ctx): LinkageNode | null {
  if (!node.where) return null;

  const joins = node.fields.filter(
    (f): f is FunctionCall =>
      f.kind === 'call' && f.name.toUpperCase() === 'JOIN',
  );

  if (joins.length === 0 || joins.length > 2) return null;

  interface JoinInfo {
    sourceName: string; // без @
    alias: string;      // с @, например @link_X или @e_X
    side: '1' | '2';
  }

  const infos: JoinInfo[] = [];
  for (const join of joins) {
    const info = extractJoinInfo(join);
    if (!info) return null;
    infos.push(info);
  }

  // К чему относится where: @link_X.attr или @e_X.attr
  const whereAlias = extractWhereAlias(node.where);
  if (!whereAlias) return null;

  const leaf = extractNestedLeaf(node.where, ctx);
  if (!leaf) return null;

  const linkageJoin = infos.find(i => i.alias.startsWith('@link_'));
  const entityJoin = infos.find(i => i.alias.startsWith('@e_'));

  // linkage-attribute
  if (whereAlias.startsWith('@link_')) {
    if (!linkageJoin) return null;
    const linkageFqid = resolveLinkageFqid(
      linkageJoin.sourceName,
      ctx.domain,
      ctx.table,
    );
    if (!linkageFqid) return null;

    return {
      id: nextId('lk'),
      kind: 'linkage',
      linkageFqid,
      side: linkageJoin.side,
      targetEntityFqid: '',
      mode: 'linkage-attribute',
      nested: leaf,
    };
  }

  // entity-attribute
  if (whereAlias.startsWith('@e_')) {
    if (!entityJoin || !linkageJoin) return null;

    const linkageFqid = resolveLinkageFqid(
      linkageJoin.sourceName,
      ctx.domain,
      ctx.table,
    );
    if (!linkageFqid) return null;

    const targetEntityFqid =
      resolveEntityFqid(entityJoin.sourceName, ctx.domain, ctx.table) ?? '';

    return {
      id: nextId('lk'),
      kind: 'linkage',
      linkageFqid,
      side: linkageJoin.side,
      targetEntityFqid,
      mode: 'entity-attribute',
      nested: leaf,
    };
  }

  return null;
}

function extractJoinInfo(join: FunctionCall): {
  sourceName: string;
  alias: string;
  side: '1' | '2';
} | null {
  // join('current', @Source, @alias, ON(eq(@alias.sideN, ...)))
  if (join.args.length < 4) return null;

  const sourceArg = join.args[1];
  const aliasArg = join.args[2];
  const onArg = join.args[3];

  if (sourceArg.kind !== 'alias' || sourceArg.parts.length !== 1) return null;
  if (aliasArg.kind !== 'alias' || aliasArg.parts.length !== 1) return null;
  if (onArg.kind !== 'call' || onArg.name.toUpperCase() !== 'ON') return null;

  const eqArg = onArg.args[0];
  if (!eqArg || eqArg.kind !== 'call' || eqArg.name.toUpperCase() !== 'EQ') return null;

  const sideRef = eqArg.args[0];
  let side: '1' | '2' = '1';
  if (sideRef.kind === 'alias' && sideRef.parts.length === 2) {
    if (sideRef.parts[1] === 'side1') side = '1';
    else if (sideRef.parts[1] === 'side2') side = '2';
  }

  return {
    sourceName: sourceArg.parts[0].slice(1), // без @
    alias: aliasArg.parts[0],                // с @
    side,
  };
}

/** Возвращает псевдоним (с @), к которому относится where-условие */
function extractWhereAlias(where: Node): string | null {
  let target: Node | null = null;

  switch (where.kind) {
    case 'binary':
      target = where.left;
      break;
    case 'like':
      target = where.value;
      break;
    case 'isnull':
      target = where.value;
      break;
    case 'in':
      target = where.value;
      break;
    case 'between':
      target = where.value;
      break;
  }

  if (target && target.kind === 'alias' && target.parts.length > 0) {
    return target.parts[0];
  }
  return null;
}

/** Строит nested LeafNode из where-условия — без префикса псевдонима в атрибуте */
function extractNestedLeaf(where: Node, ctx: Ctx): LeafNode | null {
  const attr = extractAttrFromWhere(where);
  if (!attr) return null;

  if (where.kind === 'like') {
    return {
      id: nextId('l'),
      kind: 'leaf',
      attribute: attr,
      operator: 'LIKE',
      value: extractValue(where.pattern, ctx),
      values: [],
    };
  }

  if (
    where.kind === 'binary' &&
    ['=', '!=', '<', '>', '<=', '>='].includes(where.op)
  ) {
    return {
      id: nextId('l'),
      kind: 'leaf',
      attribute: attr,
      operator: where.op as LeafOperator,
      value: extractValue(where.right, ctx),
      values: [],
    };
  }

  if (where.kind === 'isnull') {
    return {
      id: nextId('l'),
      kind: 'leaf',
      attribute: attr,
      operator: where.negated ? 'IS NOT NULL' : 'IS NULL',
      value: null,
      values: [],
    };
  }

  if (where.kind === 'in') {
    const values = extractArrayValues(where.set, ctx);
    if (values.length === 0) return null;
    return {
      id: nextId('l'),
      kind: 'leaf',
      attribute: attr,
      operator: 'IN',
      value: null,
      values,
    };
  }

  if (where.kind === 'between') {
    const from = extractValue(where.from, ctx);
    const to = extractValue(where.to, ctx);
    if (!from || !to) return null;
    return {
      id: nextId('l'),
      kind: 'leaf',
      attribute: attr,
      operator: 'BETWEEN',
      value: null,
      values: [from, to],
    };
  }

  return null;
}

/** Возвращает имя атрибута без псевдонима: "@e_X.value" → "value", "attr" → "attr" */
function extractPlainAttr(node: Node): string | null {
  if (node.kind === 'alias' && node.parts.length === 2) {
    return node.parts[1];
  }
  if (node.kind === 'ident') return node.name;
  return null;
}

/** Возвращает имя атрибута из where-условия, смотря на правильную сторону */
function extractAttrFromWhere(where: Node): string | null {
  switch (where.kind) {
    case 'binary':
      // Левая часть — атрибут: attr = value
      return extractPlainAttr(where.left);
    case 'like':
      // where.value — атрибут
      return extractPlainAttr(where.value);
    case 'isnull':
      return extractPlainAttr(where.value);
    case 'in':
      return extractPlainAttr(where.value);
    case 'between':
      return extractPlainAttr(where.value);
    default:
      return null;
  }
}