import type {
  DomainSchema,
  Entity,
  Attribute,
  Linkage,
  DataType,
  EnumValue,
} from "./types";
import { parseFqid } from "./fqid";
import { SYSTEM_ATTRIBUTES } from "./system-attributes";

export interface ResolvedAttribute extends Attribute {
  /** Полный FQID атрибута, например: "iocs.test/Incident.incidentId" */
  fqid: string;
  /** FQID сущности, которой принадлежит атрибут */
  ownerFqid: string;
  /** Атрибут унаследован от родителя? */
  inheritedFrom?: string;
}

export interface ResolvedEntity {
  fqid: string; // "iocs.test/Incident"
  domain: string; // "iocs.test"
  entity: Entity;
  attributes: Map<string, ResolvedAttribute>;
  /** Ссылки на родителя, если есть наследование */
  inherits?: string;
}

export interface ResolvedLinkage extends Linkage {
  fqid: string;
  domain: string;
}

export interface SymbolTable {
  domains: Map<string, DomainSchema>;
  entities: Map<string, ResolvedEntity>; // key = fqid
  entitiesByDomain: Map<string, ResolvedEntity[]>; // для UI
  linkages: Map<string, ResolvedLinkage>;
  dataTypes: Map<string, DataType>; // key = fqid
  enums: Map<string, EnumValue[]>; // key = fqid перечисления
  workflows: Map<string, EnumValue[]>; // то же для Workflow
}

export function buildSymbolTable(domains: DomainSchema[]): SymbolTable {
  const table: SymbolTable = {
    domains: new Map(),
    entities: new Map(),
    entitiesByDomain: new Map(),
    linkages: new Map(),
    dataTypes: new Map(),
    enums: new Map(),
    workflows: new Map(),
  };

  // 1. Сначала складываем домены и dataTypes
  for (const domain of domains) {
    table.domains.set(domain.id, domain);

    for (const dt of domain.dataTypes ?? []) {
      const fqid = `${domain.id}/${dt.id}`;
      table.dataTypes.set(fqid, dt);
      if (dt.dataType === "Enum") {
        table.enums.set(fqid, dt.values ?? []);
      }
      if (dt.dataType === "Workflow") {
        table.workflows.set(fqid, dt.values ?? []);
      }
    }
  }

  // 2. Затем сущности — с учётом наследования
  // Двухпроходный алгоритм: сначала регистрируем, потом резолвим атрибуты
  for (const domain of domains) {
    const list: ResolvedEntity[] = [];

    for (const entity of domain.entities ?? []) {
      const fqid = `${domain.id}/${entity.id}`;
      const resolved: ResolvedEntity = {
        fqid,
        domain: domain.id,
        entity,
        attributes: new Map(),
        inherits: entity.inherits,
      };
      table.entities.set(fqid, resolved);
      list.push(resolved);
    }

    table.entitiesByDomain.set(domain.id, list);
  }

  // 3. Резолвим атрибуты (с наследованием)
  for (const resolved of table.entities.values()) {
    collectAttributes(resolved, table, new Set());
  }

  // 4. Связи
  for (const domain of domains) {
    for (const linkage of domain.linkages ?? []) {
      const fqid = `${domain.id}/${linkage.id}`;
      table.linkages.set(fqid, { ...linkage, fqid, domain: domain.id });
    }
  }

  return table;
}

function collectAttributes(
  resolved: ResolvedEntity,
  table: SymbolTable,
  visited: Set<string>,
): void {
  if (visited.has(resolved.fqid)) return;
  visited.add(resolved.fqid);

  // Сначала атрибуты родителя
  if (resolved.inherits) {
    const parentFqid = resolveEntityFqid(
      resolved.inherits,
      resolved.domain,
      table,
    );
    if (parentFqid) {
      const parent = table.entities.get(parentFqid);
      if (parent) {
        collectAttributes(parent, table, visited);
        for (const [id, attr] of parent.attributes) {
          resolved.attributes.set(id, {
            ...attr,
            inheritedFrom: parent.fqid,
          });
        }
      }
    }
  }

  // Потом собственные атрибуты (переопределяют унаследованные)
  for (const attr of resolved.entity.attributes ?? []) {
    resolved.attributes.set(attr.id, {
      ...attr,
      fqid: `${resolved.fqid}.${attr.id}`,
      ownerFqid: resolved.fqid,
    });
  }

  // Добавляем системные атрибуты, если их ещё нет
  for (const sysAttr of SYSTEM_ATTRIBUTES) {
    if (!resolved.attributes.has(sysAttr.id)) {
      resolved.attributes.set(sysAttr.id, {
        ...sysAttr,
        fqid: `${resolved.fqid}.${sysAttr.id}`,
        ownerFqid: resolved.fqid,
      });
    }
  }
}

export function resolveEntityFqid(
  ref: string,
  currentDomain: string,
  table: SymbolTable,
): string | undefined {
  const parts = parseFqid(ref);
  if (parts.domain) {
    return `${parts.domain}/${parts.entity}`;
  }
  const local = `${currentDomain}/${parts.entity}`;
  return table.entities.has(local) ? local : undefined;
}

export function resolveLinkageFqid(
  ref: string,
  currentDomain: string,
  table: SymbolTable,
): string | undefined {
  if (ref.includes("/")) {
    return table.linkages.has(ref) ? ref : undefined;
  }
  const local = `${currentDomain}/${ref}`;
  return table.linkages.has(local) ? local : undefined;
}