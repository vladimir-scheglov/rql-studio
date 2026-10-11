import type { SymbolTable } from "../schema/symbol-table";
import { resolveEntityFqid } from "../schema/symbol-table";
import type { AvailableTransition } from "./types";

/**
 * Возвращает все переходы, доступные из указанной сущности.
 * Переходы двух типов:
 *   - linkage (по связи);
 *   - reference (по атрибуту типа Reference).
 */
export function getAvailableTransitions(
  entityFqid: string,
  table: SymbolTable,
): AvailableTransition[] {
  const entity = table.entities.get(entityFqid);
  if (!entity) return [];

  const result: AvailableTransition[] = [];

  // --- 1. Все linkages, где участвует сущность ---
  for (const linkage of table.linkages.values()) {
    const side1Fqid = resolveEntityFqid(linkage.side1, linkage.domain, table);
    const side2Fqid = resolveEntityFqid(linkage.side2, linkage.domain, table);

    if (side1Fqid === entityFqid && side2Fqid) {
      result.push({
        kind: "linkage",
        label: `→ ${shortName(side2Fqid, table)} через «${linkage.name ?? linkage.id}»`,
        targetEntityFqid: side2Fqid,
        linkage,
        fromSide: "1",
      });
    }
    if (side2Fqid === entityFqid && side1Fqid && side1Fqid !== side2Fqid) {
      result.push({
        kind: "linkage",
        label: `→ ${shortName(side1Fqid, table)} через «${linkage.name ?? linkage.id}»`,
        targetEntityFqid: side1Fqid,
        linkage,
        fromSide: "2",
      });
    }
  }

  // --- 2. Атрибуты типа Reference ---
  for (const attr of entity.attributes.values()) {
    if (attr.dataType !== "Reference" || !attr.entity) continue;
    const targetFqid = resolveEntityFqid(attr.entity, entity.domain, table);
    if (!targetFqid) continue;
    if (targetFqid === entityFqid) continue;

    result.push({
      kind: "reference",
      label: `→ ${shortName(targetFqid, table)} через поле «${attr.name ?? attr.id}»`,
      targetEntityFqid: targetFqid,
      attribute: attr,
    });
  }

  return result;
}

function shortName(fqid: string, table: SymbolTable): string {
  const entity = table.entities.get(fqid);
  return entity?.entity.name ?? entity?.entity.id ?? fqid;
}
