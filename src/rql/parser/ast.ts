export interface Position {
  startOffset: number;
  endOffset: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface BaseNode {
  pos: Position;
}

export type Node =
  | BinaryExpr
  | UnaryExpr
  | FunctionCall
  | AliasRef
  | IdentifierRef
  | Literal
  | ArrayLiteral
  | SelectStatement
  | ParenExpr
  | BetweenExpr
  | InExpr
  | IsNullExpr
  | LikeExpr;

export interface SelectStatement extends BaseNode {
  kind: "select";
  fields: Node[];
  from?: Node;
  joins: Node[];
  where?: Node;
  groupBy: Node[];
  having?: Node;
  orderBy: { expr: Node; direction: "ASC" | "DESC" }[];
  limit?: number;
  offset?: number;
}

export interface BinaryExpr extends BaseNode {
  kind: "binary";
  op:
    | "="
    | "!="
    | "<"
    | ">"
    | "<="
    | ">="
    | "+"
    | "-"
    | "*"
    | "/"
    | "%"
    | "AND"
    | "OR";
  left: Node;
  right: Node;
}

export interface UnaryExpr extends BaseNode {
  kind: "unary";
  op: "NOT" | "-";
  operand: Node;
}

export interface FunctionCall extends BaseNode {
  kind: "call";
  name: string;
  args: Node[];
}

export interface AliasRef extends BaseNode {
  kind: "alias";
  /** Полный текст псевдонима, например "@doc.incidentId" */
  raw: string;
  /** Части, разделённые точкой: ["@doc", "incidentId"] */
  parts: string[];
}

export interface IdentifierRef extends BaseNode {
  kind: "ident";
  name: string;
}

export interface Literal extends BaseNode {
  kind: "literal";
  value: string | number | boolean | null;
  type: "string" | "number" | "boolean" | "null";
}

export interface ArrayLiteral extends BaseNode {
  kind: "array";
  elements: Node[];
}

export interface ParenExpr extends BaseNode {
  kind: "paren";
  inner: Node;
}

export interface BetweenExpr extends BaseNode {
  kind: "between";
  value: Node;
  from: Node;
  to: Node;
  negated: boolean;
}

export interface InExpr extends BaseNode {
  kind: "in";
  value: Node;
  set: Node;
  negated: boolean;
}

export interface IsNullExpr extends BaseNode {
  kind: "isnull";
  value: Node;
  negated: boolean;
}

export interface LikeExpr extends BaseNode {
  kind: "like";
  value: Node;
  pattern: Node;
  negated: boolean;
}

export interface SelectStatement extends BaseNode {
  kind: "select";
  fields: Node[];
  from?: Node;
  joins: Node[];
  where?: Node;
  groupBy: Node[];
  having?: Node;
  orderBy: { expr: Node; direction: "ASC" | "DESC" }[];
  limit?: number;
  offset?: number;
}
