import type { SymbolTable } from "../../schema/symbol-table";
import { resolveEntityFqid } from "../../schema/symbol-table";

export interface ScannedAlias {
  /** '@e_Incident_Ioc' или '@link_Incident_Ioc' */
  alias: string;
  /** Что за ним стоит: сущность или связь */
  kind: "entity" | "linkage";
  /** FQID сущности (для kind = 'entity') */
  entityFqid?: string;
  /** FQID связи (для kind = 'linkage') */
  linkageFqid?: string;
}

/**
 * Сканирует текст до курсора и собирает объявления псевдонимов
 * из FROM(...) и join(...).
 */
export function scanAliases(
  textBefore: string,
  table: SymbolTable,
  domain: string,
): ScannedAlias[] {
  const result: ScannedAlias[] = [];

  // FROM('current', @Source, @alias) и join('current', @Source, @alias, ...)
  // Ищем только те, где есть третий аргумент — псевдоним.
  const pattern =
    /\b(?:FROM|join)\s*\(\s*'[^']*'\s*,\s*@([\w]+)\s*,\s*@([\w]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(textBefore)) !== null) {
    const sourceName = match[1];
    const aliasName = match[2];

    const linkageFqid = resolveLinkageFqid(sourceName, domain, table);
    const entityFqid = resolveEntityFqid(sourceName, domain, table);

    let resolved: ScannedAlias | null = null;

    if (linkageFqid && table.linkages.has(linkageFqid)) {
      resolved = {
        alias: "", // заполним ниже
        kind: "linkage",
        linkageFqid,
      };
    } else if (entityFqid && table.entities.has(entityFqid)) {
      resolved = {
        alias: "",
        kind: "entity",
        entityFqid,
      };
    }

    if (resolved) {
      // Оба имени — и @source, и @alias — работают как псевдонимы
      result.push({ ...resolved, alias: `@${sourceName}` });
      if (aliasName !== sourceName) {
        result.push({ ...resolved, alias: `@${aliasName}` });
      }
    }
  }

  return result;
}

function resolveLinkageFqid(
  name: string,
  domain: string,
  table: SymbolTable,
): string | undefined {
  if (name.includes("/")) {
    return table.linkages.has(name) ? name : undefined;
  }
  const local = `${domain}/${name}`;
  return table.linkages.has(local) ? local : undefined;
}
