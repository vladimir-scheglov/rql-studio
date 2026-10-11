export type RqlType =
  | "any"
  | "null"
  | "string"
  | "number"
  | "boolean"
  | "timestamp"
  | "date"
  | "time"
  | "enum"
  | "workflow"
  | "reference"
  | "uuid"
  | "array"
  | "table";

/**
 * Совместимы ли два типа для операций сравнения.
 * Консервативно: если не уверены — считаем совместимыми.
 */
export function isCompatible(a: RqlType, b: RqlType): boolean {
  if (a === "any" || b === "any") return true;
  if (a === "null" || b === "null") return true;
  if (a === b) return true;

  if ((a === "string" && b === "uuid") || (a === "uuid" && b === "string"))
    return true;

  // Date/Time/Timestamp взаимозаменяемы в выражениях
  const temporal: RqlType[] = ["timestamp", "date", "time"];
  if (temporal.includes(a) && temporal.includes(b)) return true;

  // Date/Time/Timestamp можно сравнивать со строкой-литералом,
  // потому что в RQL даты пишутся как строки: '2025-01-01'
  if (temporal.includes(a) && b === "string") return true;
  if (temporal.includes(b) && a === "string") return true;

  // Enum, Workflow, Reference сравниваются со строкой или своим типом
  if ((a === "enum" || a === "workflow") && b === "string") return true;
  if ((b === "enum" || b === "workflow") && a === "string") return true;
  if ((a === "enum" && b === "workflow") || (a === "workflow" && b === "enum"))
    return true;

  if (
    (a === "reference" && b === "string") ||
    (a === "string" && b === "reference")
  )
    return true;
  if (
    (a === "reference" && b === "uuid") ||
    (a === "uuid" && b === "reference")
  ) {
    return true;
  }

  // Date/Time/Timestamp можно сравнивать со строкой-литералом:
  // в RQL даты пишутся как строки: '2025-01-01'
  if (temporal.includes(a) && b === "string") return true;
  if (temporal.includes(b) && a === "string") return true;

  // Массивы совместимы только с массивами
  if (a === "array" && b === "array") return true;

  return false;
}

/** dataType из схемы домена → RqlType */
export function schemaDataTypeToRqlType(dataType: string): RqlType {
  switch (dataType) {
    case "String":
    case "Text":
    case "URL":
    case "MAC":
    case "IpAddress":
    case "CIDR":
    case "Identifier":
      return "string";
    case "Uuid":
      return "uuid";
    case "Integer":
    case "Decimal":
    case "Float":
    case "Calculation":
      return "number";
    case "Bool":
      return "boolean";
    case "Timestamp":
    case "TimestampRange":
      return "timestamp";
    case "Date":
      return "date";
    case "Time":
      return "time";
    case "Enum":
      return "enum";
    case "Workflow":
      return "workflow";
    case "Reference":
      return "reference";
    case "Array":
      return "array";
    case "Table":
      return "table";
    default:
      return "any";
  }
}
