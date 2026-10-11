import type { SymbolTable } from "./symbol-table";
import type { DataType } from "./types";

export interface ResolvedDataType {
  /** Что это по базовому смыслу: Enum, Workflow, Table или встроенный тип */
  kind: "Enum" | "Workflow" | "Table" | "builtin";
  /** Сам объект DataType, если это пользовательский тип */
  dataType?: DataType;
  /** Значения (для Enum и Workflow) */
  values?: { id: string; name?: string }[];
  /** Базовое имя типа: 'Enum' | 'Workflow' | 'String' | 'Integer' | ... */
  baseName: string;
}

/**
 * Резолвит тип данных атрибута в терминах Symbol Table.
 * Если атрибут ссылается на пользовательский тип (IncUrgency),
 * возвращает разобранную сущность этого типа.
 * Иначе — возвращает базовое имя как есть.
 */
export function resolveDataType(
  dataTypeId: string,
  currentDomain: string,
  table: SymbolTable,
): ResolvedDataType {
  // Сначала попробуем как локальное имя пользовательского типа в текущем домене
  const localFqid = `${currentDomain}/${dataTypeId}`;
  const dt = table.dataTypes.get(localFqid) ?? table.dataTypes.get(dataTypeId); // если уже FQID

  if (dt) {
    if (dt.dataType === "Enum") {
      return {
        kind: "Enum",
        dataType: dt,
        values: dt.values ?? [],
        baseName: "Enum",
      };
    }
    if (dt.dataType === "Workflow") {
      return {
        kind: "Workflow",
        dataType: dt,
        values: dt.values ?? [],
        baseName: "Workflow",
      };
    }
    if (dt.dataType === "Table") {
      return { kind: "Table", dataType: dt, baseName: "Table" };
    }
  }

  // Встроенный тип
  return { kind: "builtin", baseName: dataTypeId };
}
