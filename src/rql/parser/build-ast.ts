import type { CstNode, IToken } from "chevrotain";
import type {
  Node,
  Position,
  BinaryExpr,
  UnaryExpr,
  FunctionCall,
  AliasRef,
  IdentifierRef,
  Literal,
  ArrayLiteral,
  ParenExpr,
  SelectStatement,
} from "./ast";

export function buildAst(cst: CstNode, source: string): Node {
  return buildProgram(cst, source);
}

function buildProgram(cst: CstNode, source: string): Node {
  const exprNode = cst.children.expression?.[0] as CstNode | undefined;
  if (!exprNode) {
    return emptyLiteral(source);
  }
  return buildExpression(exprNode, source);
}

function buildExpression(cst: CstNode, source: string): Node {
  if (cst.children.selectStatement) {
    return buildSelectStatement(
      cst.children.selectStatement[0] as CstNode,
      source,
    );
  }
  return buildOr(cst.children.orExpr![0] as CstNode, source);
}

function buildSelectStatement(cst: CstNode, source: string): SelectStatement {
  const selectTokens = cst.children.Select as IToken[] | undefined;
  const selectTok = selectTokens![0];

  // Список полей: это все orExpr на первом уровне selectStatement
  const fieldCsts = (cst.children.orExpr as CstNode[] | undefined) ?? [];
  const fields: Node[] = fieldCsts.map((f) => buildOr(f, source));

  // Клаузы: FROM, JOIN, WHERE, GROUP BY, ORDER BY, LIMIT
  const clauseCsts = (cst.children.selectClause as CstNode[] | undefined) ?? [];

  let from: Node | undefined;
  const joins: Node[] = [];
  let where: Node | undefined;
  const groupBy: Node[] = [];
  let having: Node | undefined;
  const orderBy: { expr: Node; direction: "ASC" | "DESC" }[] = [];
  let limit: number | undefined;
  let offset: number | undefined;

  for (const clause of clauseCsts) {
    if (clause.children.fromClause) {
      from = buildClauseExpr(clause.children.fromClause[0] as CstNode, source);
      continue;
    }
    if (clause.children.joinClause) {
      const j = clause.children.joinClause[0] as CstNode;
      // Внутри joinClause есть orExpr(s) — присоединяем как отдельные узлы
      const exprs = (j.children.orExpr as CstNode[] | undefined) ?? [];
      for (const e of exprs) joins.push(buildOr(e, source));
      continue;
    }
    if (clause.children.whereClause) {
      where = buildClauseExpr(
        clause.children.whereClause[0] as CstNode,
        source,
      );
      continue;
    }
    if (clause.children.groupByClause) {
      const g = clause.children.groupByClause[0] as CstNode;
      const exprs = (g.children.orExpr as CstNode[] | undefined) ?? [];
      for (const e of exprs) groupBy.push(buildOr(e, source));
      continue;
    }
    if (clause.children.orderByClause) {
      const o = clause.children.orderByClause[0] as CstNode;
      const orderFields =
        (o.children.orderByField as CstNode[] | undefined) ?? [];
      for (const f of orderFields) {
        const parsed = buildOrderByField(f, source);
        if (parsed) orderBy.push(parsed);
      }
      continue;
    }
    if (clause.children.limitClause) {
      const l = clause.children.limitClause[0] as CstNode;
      const numToks = (l.children.NumberLiteral as IToken[] | undefined) ?? [];
      if (numToks[0]) limit = Number(numToks[0].image);
      if (numToks[1]) offset = Number(numToks[1].image);
      continue;
    }
  }

  // Позиция узла — от SELECT до последнего клауза (или до конца полей)
  const lastFieldPos =
    fields.length > 0
      ? fields[fields.length - 1].pos
      : posFromToken(selectTok, source);

  return {
    kind: "select",
    fields,
    from,
    joins,
    where,
    groupBy,
    having,
    orderBy,
    limit,
    offset,
    pos: {
      startOffset: selectTok.startOffset,
      endOffset: lastFieldPos.endOffset,
      startLine: selectTok.startLine ?? 1,
      startColumn: selectTok.startColumn ?? 1,
      endLine: lastFieldPos.endLine,
      endColumn: lastFieldPos.endColumn,
    },
  };
}

/** Достаёт одиночное выражение из клаузы (FROM / WHERE) */
function buildClauseExpr(cst: CstNode, source: string): Node {
  // Внутри клаузы всегда одиночный orExpr, потому что грамматика так устроена
  const exprs = cst.children.orExpr as CstNode[] | undefined;
  if (exprs && exprs.length > 0) return buildOr(exprs[0], source);
  return emptyLiteral(source);
}

/** Разбирает поле ORDER BY: expr [ASC|DESC] */
function buildOrderByField(
  cst: CstNode,
  source: string,
): { expr: Node; direction: "ASC" | "DESC" } | null {
  const exprs = cst.children.orExpr as CstNode[] | undefined;
  if (!exprs || exprs.length === 0) return null;

  const expr = buildOr(exprs[0], source);
  const dir: "ASC" | "DESC" = cst.children.Desc
    ? "DESC"
    : cst.children.Asc
      ? "ASC"
      : "ASC";

  return { expr, direction: dir };
}

function buildOr(cst: CstNode, source: string): Node {
  const parts = cst.children.andExpr as CstNode[];
  let node = buildAnd(parts[0], source);

  const orTokens = (cst.children.Or as IToken[] | undefined) ?? [];
  for (let i = 0; i < orTokens.length; i++) {
    node = makeBinary("OR", node, buildAnd(parts[i + 1], source));
  }
  return node;
}

function buildAnd(cst: CstNode, source: string): Node {
  const parts = cst.children.notExpr as CstNode[];
  let node = buildNot(parts[0], source);

  const andTokens = (cst.children.And as IToken[] | undefined) ?? [];
  for (let i = 0; i < andTokens.length; i++) {
    node = makeBinary("AND", node, buildNot(parts[i + 1], source));
  }
  return node;
}

function buildNot(cst: CstNode, source: string): Node {
  const notTokens = cst.children.Not as IToken[] | undefined;
  const comp = cst.children.comparison![0] as CstNode;
  const inner = buildComparison(comp, source);
  if (notTokens && notTokens.length > 0) {
    return {
      kind: "unary",
      op: "NOT",
      operand: inner,
      pos: posFromToken(notTokens[0], source),
    };
  }
  return inner;
}

function buildComparison(cst: CstNode, source: string): Node {
  const addParts = cst.children.additive as CstNode[];
  let node = buildAdditive(addParts[0], source);

  const opTokens: IToken[] = [
    ...((cst.children.Equals as IToken[]) ?? []),
    ...((cst.children.NotEquals as IToken[]) ?? []),
    ...((cst.children.LessEq as IToken[]) ?? []),
    ...((cst.children.GreaterEq as IToken[]) ?? []),
    ...((cst.children.Less as IToken[]) ?? []),
    ...((cst.children.Greater as IToken[]) ?? []),
  ].sort((a, b) => a.startOffset - b.startOffset);

  if (opTokens.length > 0 && addParts.length > 1) {
    const right = buildAdditive(addParts[1], source);
    node = makeBinary(opTokens[0].image as BinaryExpr["op"], node, right);
  }

  const extra = cst.children.inOrBetweenOrLike?.[0] as CstNode | undefined;
  if (extra) {
    return buildInOrBetween(extra, node, source);
  }

  return node;
}

function buildInOrBetween(cst: CstNode, left: Node, source: string): Node {
  if (cst.children.In) {
    const value = cst.children.additive![0] as CstNode;
    return {
      kind: "in",
      value: left,
      set: buildAdditive(value, source),
      negated: false,
      pos: left.pos,
    };
  }
  if (cst.children.Like) {
    const value = cst.children.additive![0] as CstNode;
    return {
      kind: "like",
      value: left,
      pattern: buildAdditive(value, source),
      negated: false,
      pos: left.pos,
    };
  }
  if (cst.children.Is) {
    const hasNot = !!cst.children.Not;
    return {
      kind: "isnull",
      value: left,
      negated: hasNot,
      pos: left.pos,
    };
  }
  if (cst.children.Between) {
    const addParts = cst.children.additive as CstNode[];
    return {
      kind: "between",
      value: left,
      from: buildAdditive(addParts[0], source),
      to: buildAdditive(addParts[1], source),
      negated: false,
      pos: left.pos,
    };
  }
  return left;
}

function buildAdditive(cst: CstNode, source: string): Node {
  const parts = cst.children.multiplicative as CstNode[];
  let node = buildMultiplicative(parts[0], source);

  const opTokens: IToken[] = [
    ...((cst.children.Plus as IToken[]) ?? []),
    ...((cst.children.Minus as IToken[]) ?? []),
  ].sort((a, b) => a.startOffset - b.startOffset);

  for (let i = 0; i < opTokens.length; i++) {
    node = makeBinary(
      opTokens[i].image as BinaryExpr["op"],
      node,
      buildMultiplicative(parts[i + 1], source),
    );
  }
  return node;
}

function buildMultiplicative(cst: CstNode, source: string): Node {
  const parts = cst.children.primary as CstNode[];
  let node = buildPrimary(parts[0], source);

  const opTokens: IToken[] = [
    ...((cst.children.Star as IToken[]) ?? []),
    ...((cst.children.Slash as IToken[]) ?? []),
    ...((cst.children.Percent as IToken[]) ?? []),
  ].sort((a, b) => a.startOffset - b.startOffset);

  for (let i = 0; i < opTokens.length; i++) {
    node = makeBinary(
      opTokens[i].image as BinaryExpr["op"],
      node,
      buildPrimary(parts[i + 1], source),
    );
  }
  return node;
}

function buildPrimary(cst: CstNode, source: string): Node {
  if (cst.children.selectStatement) {
    return buildSelectStatement(
      cst.children.selectStatement[0] as CstNode,
      source,
    );
  }
  if (cst.children.parenExpr) {
    return buildParen(cst.children.parenExpr[0] as CstNode, source);
  }
  if (cst.children.functionCall) {
    return buildFunctionCall(cst.children.functionCall[0] as CstNode, source);
  }
  if (cst.children.aliasRef) {
    return buildAlias(cst.children.aliasRef[0] as CstNode, source);
  }
  if (cst.children.arrayLiteral) {
    return buildArray(cst.children.arrayLiteral[0] as CstNode, source);
  }
  if (cst.children.literal) {
    return buildLiteral(cst.children.literal[0] as CstNode, source);
  }
  if (cst.children.identifierRef) {
    return buildIdentifier(cst.children.identifierRef[0] as CstNode, source);
  }
  if (cst.children.keywordAsIdentifier) {
    return buildKeywordAsIdentifier(
      cst.children.keywordAsIdentifier[0] as CstNode,
      source,
    );
  }
  return emptyLiteral(source);
}

function buildKeywordAsIdentifier(cst: CstNode, source: string): IdentifierRef {
  // Находим любой дочерний IToken — в правиле он всегда один.
  const children = cst.children as Record<string, unknown>;
  for (const key of Object.keys(children)) {
    const val = children[key];
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0] as IToken;
      if (
        first &&
        typeof first.image === "string" &&
        typeof first.startOffset === "number"
      ) {
        return {
          kind: "ident",
          name: first.image,
          pos: posFromToken(first, source),
        };
      }
    }
  }
  return {
    kind: "ident",
    name: "",
    pos: emptyLiteral(source).pos,
  };
}

function buildParen(cst: CstNode, source: string): ParenExpr {
  const inner = buildExpression(cst.children.expression![0] as CstNode, source);
  return {
    kind: "paren",
    inner,
    pos: inner.pos,
  };
}

function buildFunctionCall(cst: CstNode, source: string): FunctionCall {
  const children = cst.children as Record<string, unknown>;

  // 1. Находим имя функции — первый IToken среди детей.
  //    Это может быть Identifier, Select, From, Join, On, Asc, ...
  let nameTok: IToken | undefined;
  for (const key of Object.keys(children)) {
    const val = children[key];
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0] as IToken;
      if (
        first &&
        typeof first.image === "string" &&
        typeof first.startOffset === "number"
      ) {
        nameTok = first;
        break;
      }
    }
  }

  if (!nameTok) {
    // Совсем сломанный CST — возвращаем заглушку
    return {
      kind: "call",
      name: "",
      args: [],
      pos: emptyLiteral(source).pos,
    };
  }

  // 2. Аргументы
  const argNodes = (cst.children.expression as CstNode[] | undefined) ?? [];
  const args = argNodes.map((a) => buildExpression(a, source));

  // 3. Закрывающая скобка
  const rparen = (cst.children.RParen as IToken[] | undefined)?.[0];

  return {
    kind: "call",
    name: nameTok.image,
    args,
    pos: spanTokens(nameTok, rparen, source),
  };
}

function buildAlias(cst: CstNode, source: string): AliasRef {
  const atTok = cst.children.AtAlias![0] as IToken;
  const identToks = (cst.children.Identifier as IToken[] | undefined) ?? [];

  const parts = [...atTok.image.split("."), ...identToks.map((t) => t.image)];
  const raw = parts.join(".");

  return {
    kind: "alias",
    raw,
    parts,
    pos: spanTokens(atTok, identToks[identToks.length - 1], source),
  };
}

function buildIdentifier(cst: CstNode, source: string): IdentifierRef {
  const tok = cst.children.Identifier![0] as IToken;
  return {
    kind: "ident",
    name: tok.image,
    pos: posFromToken(tok, source),
  };
}

function buildArray(cst: CstNode, source: string): ArrayLiteral {
  const elements = (
    (cst.children.expression as CstNode[] | undefined) ?? []
  ).map((e) => buildExpression(e, source));

  const lb = cst.children.LBracket![0] as IToken;
  const rb = cst.children.RBracket?.[0] as IToken | undefined;

  return {
    kind: "array",
    elements,
    pos: spanTokens(lb, rb, source),
  };
}

function buildLiteral(cst: CstNode, source: string): Literal {
  if (cst.children.StringLiteral) {
    const t = cst.children.StringLiteral[0] as IToken;
    return {
      kind: "literal",
      type: "string",
      value: t.image.slice(1, -1).replace(/''/g, "'"),
      pos: posFromToken(t, source),
    };
  }
  if (cst.children.NumberLiteral) {
    const t = cst.children.NumberLiteral[0] as IToken;
    return {
      kind: "literal",
      type: "number",
      value: Number(t.image),
      pos: posFromToken(t, source),
    };
  }
  if (cst.children.BooleanLiteral) {
    const t = cst.children.BooleanLiteral[0] as IToken;
    return {
      kind: "literal",
      type: "boolean",
      value: t.image.toLowerCase() === "true",
      pos: posFromToken(t, source),
    };
  }
  const t = cst.children.NullLiteral![0] as IToken;
  return {
    kind: "literal",
    type: "null",
    value: null,
    pos: posFromToken(t, source),
  };
}

// --- helpers -------------------------------------------------------------

function makeBinary(op: BinaryExpr["op"], left: Node, right: Node): BinaryExpr {
  return {
    kind: "binary",
    op,
    left,
    right,
    pos: {
      startOffset: left.pos.startOffset,
      endOffset: right.pos.endOffset,
      startLine: left.pos.startLine,
      startColumn: left.pos.startColumn,
      endLine: right.pos.endLine,
      endColumn: right.pos.endColumn,
    },
  };
}

function posFromToken(token: IToken, source: string): Position {
  const startLine = token.startLine ?? 1;
  const startColumn = token.startColumn ?? 1;
  const startOffset = token.startOffset;
  const endOffset =
    (token.endOffset ?? startOffset + token.image.length - 1) + 1;
  const endLine = startLine + countNewlines(token.image);
  const endColumn =
    endLine === startLine
      ? startColumn + token.image.length
      : token.image.length - token.image.lastIndexOf("\n");

  return {
    startOffset: token.startOffset,
    endOffset,
    startLine,
    startColumn,
    endLine,
    endColumn,
  };
}

function spanTokens(
  start: IToken,
  end: IToken | undefined,
  source: string,
): Position {
  const startPos = posFromToken(start, source);
  if (!end) return startPos;

  const endPos = posFromToken(end, source);
  return {
    startOffset: startPos.startOffset,
    endOffset: endPos.endOffset,
    startLine: startPos.startLine,
    startColumn: startPos.startColumn,
    endLine: endPos.endLine,
    endColumn: endPos.endColumn,
  };
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

function emptyLiteral(source: string): Literal {
  return {
    kind: "literal",
    type: "null",
    value: null,
    pos: {
      startOffset: 0,
      endOffset: source.length,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: source.length + 1,
    },
  };
}
