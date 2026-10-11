import type { Node, FunctionCall } from "../parser/ast";
import type { SymbolTable } from "../../schema/symbol-table";

export type AliasKind =
  | { kind: "entity"; entityFqid: string }
  | { kind: "linkage"; linkageFqid: string }
  | { kind: "unknown" };

export type Scope = Map<string, AliasKind>;

/**
 * Строит карту псевдонимов, объявленных в выражении через FROM/JOIN.
 *
 *   FROM('current', @Incident_Ioc, @l)        → @Incident_Ioc = linkage, @l = linkage
 *   join('current', @Ioc, @e_Incident_Ioc)    → @Ioc = entity, @e_Incident_Ioc = entity
 *   join('current', @Person, on(...))         → @Person = entity
 *
 * Всё остальное (системные @doc, @Current*) сюда не входит — они
 * обрабатываются отдельно.
 */
export function collectScope(
  ast: Node,
  table: SymbolTable,
  domain: string,
): Scope {
  const scope: Scope = new Map();

  function visit(node: Node): void {
    switch (node.kind) {
      case "call":
        collectFromCall(node);
        for (const a of node.args) visit(a);
        break;
      case "binary":
        visit(node.left);
        visit(node.right);
        break;
      case "unary":
        visit(node.operand);
        break;
      case "paren":
        visit(node.inner);
        break;
      case "array":
        for (const el of node.elements) visit(el);
        break;
      case "between":
        visit(node.value);
        visit(node.from);
        visit(node.to);
        break;
      case "in":
        visit(node.value);
        visit(node.set);
        break;
      case "like":
        visit(node.value);
        visit(node.pattern);
        break;
      case "isnull":
        visit(node.value);
        break;
      case "select":
        for (const f of node.fields) visit(f);
        if (node.from) visit(node.from);
        for (const j of node.joins) visit(j);
        if (node.where) visit(node.where);
        for (const g of node.groupBy) visit(g);
        if (node.having) visit(node.having);
        for (const o of node.orderBy) visit(o.expr);
        break;
    }
  }

  function collectFromCall(call: FunctionCall): void {
    const name = call.name.toUpperCase();
    if (name !== "FROM" && name !== "JOIN") return;

    // Первый аргумент пропускаем: это строка 'current' или FQDN домена.
    // Второй — источник (сущность или связь).
    // Третий (если есть и это alias) — псевдоним этого источника.
    // Четвёртый (для JOIN) — ON(...), не alias.
    const sourceArg = call.args[1];
    if (!sourceArg || sourceArg.kind !== "alias") return;

    const sourceHead = sourceArg.parts[0]; // '@Incident_Ioc' или '@Ioc'
    const sourceName = sourceHead.slice(1); // 'Incident_Ioc' или 'Ioc'

    // Резолвим источник в домене
    let resolved: AliasKind = { kind: "unknown" };

    const linkageFqid = `${domain}/${sourceName}`;
    const entityFqid = `${domain}/${sourceName}`;

    if (table.linkages.has(linkageFqid)) {
      resolved = { kind: "linkage", linkageFqid };
    } else if (table.entities.has(entityFqid)) {
      resolved = { kind: "entity", entityFqid };
    }

    // Второй аргумент тоже становится псевдонимом
    scope.set(sourceHead, resolved);

    // Третий аргумент — псевдоним с тем же типом
    const aliasArg = call.args[2];
    if (aliasArg && aliasArg.kind === "alias") {
      scope.set(aliasArg.parts[0], resolved);
    }
  }

  visit(ast);
  return scope;
}
