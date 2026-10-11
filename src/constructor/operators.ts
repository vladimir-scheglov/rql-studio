import type { Attribute } from "../schema/types";
import type { SymbolTable } from "../schema/symbol-table";
import { schemaDataTypeToRqlType } from "../rql/semantics/types";
import { resolveDataType } from "../schema/resolve-data-type";
import type { LeafOperator } from "./types";

export function operatorsForAttribute(
  attr: Attribute,
  domain: string,
  table: SymbolTable,
): LeafOperator[] {
  const resolved = resolveDataType(attr.dataType, domain, table);

  if (resolved.kind === "Enum" || resolved.kind === "Workflow") {
    return ["=", "!=", "IN"];
  }
  if (resolved.kind === "Table") {
    return ["=", "!="];
  }

  if (attr.dataType === "Array") {
    return ["HAS"];
  }

  const t = schemaDataTypeToRqlType(resolved.baseName);
  switch (t) {
    case "string":
    case "uuid":
      return ["=", "!=", "LIKE", "IN", "IS NULL", "IS NOT NULL"];
    case "number":
      return [
        "=",
        "!=",
        ">",
        "<",
        ">=",
        "<=",
        "BETWEEN",
        "IS NULL",
        "IS NOT NULL",
      ];
    case "boolean":
      return ["="];
    case "date":
    case "time":
    case "timestamp":
      return [
        "=",
        "!=",
        ">",
        "<",
        ">=",
        "<=",
        "BETWEEN",
        "IS NULL",
        "IS NOT NULL",
      ];
    case "enum":
    case "workflow":
      return ["=", "!=", "IN"];
    case "reference":
      return ["=", "!=", "IS NULL", "IS NOT NULL"];
    default:
      return ["=", "!="];
  }
}
