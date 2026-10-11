import type {
  DomainSchema,
  Entity,
  Attribute,
  Linkage,
  DataRule,
  DataType,
  Sequence,
} from "./types";

export type ChangeStatus = "added" | "removed" | "modified" | "unchanged";

export interface FieldChange {
  field: string;
  before: any;
  after: any;
}

export interface EntityDiff {
  id: string;
  status: ChangeStatus;
  base?: Entity;
  target?: Entity;
  changedFields: FieldChange[];
  attributes: AttributeDiff[];
}

export interface AttributeDiff {
  id: string;
  status: ChangeStatus;
  base?: Attribute;
  target?: Attribute;
  changedFields: FieldChange[];
}

export interface LinkageDiff {
  id: string;
  status: ChangeStatus;
  base?: Linkage;
  target?: Linkage;
  changedFields: FieldChange[];
}

export interface RuleDiff {
  id: string;
  status: ChangeStatus;
  base?: DataRule;
  target?: DataRule;
  changedFields: FieldChange[];
}

export interface DataTypeDiff {
  id: string;
  status: ChangeStatus;
  base?: DataType;
  target?: DataType;
  changedFields: FieldChange[];
}

export interface SequenceDiff {
  id: string;
  status: ChangeStatus;
  base?: Sequence;
  target?: Sequence;
  changedFields: FieldChange[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  total: number;
}

export interface SchemaDiff {
  baseId: string;
  targetId: string;
  baseVersion?: string;
  targetVersion?: string;
  entities: EntityDiff[];
  linkages: LinkageDiff[];
  rules: RuleDiff[];
  dataTypes: DataTypeDiff[];
  sequences: SequenceDiff[];
  summary: {
    entities: DiffSummary;
    attributes: DiffSummary;
    linkages: DiffSummary;
    rules: DiffSummary;
    dataTypes: DiffSummary;
    sequences: DiffSummary;
    total: DiffSummary;
  };
}

// =========================================================================

export function diffSchemas(
  base: DomainSchema,
  target: DomainSchema,
): SchemaDiff {
  const entities = diffById(
    base.entities ?? [],
    target.entities ?? [],
    diffEntity,
  );
  const linkages = diffById(
    base.linkages ?? [],
    target.linkages ?? [],
    diffLinkage,
  );
  const rules = diffById(
    base.dataRules ?? [],
    target.dataRules ?? [],
    diffRule,
  );
  const dataTypes = diffById(
    base.dataTypes ?? [],
    target.dataTypes ?? [],
    diffDataType,
  );
  const sequences = diffById(
    base.sequences ?? [],
    target.sequences ?? [],
    diffSequence,
  );

  // Собираем атрибуты со всех сущностей для сводки
  const allAttrDiffs = entities.flatMap((e) => e.attributes);

  const sEntities = summarize(entities);
  const sAttrs = summarize(allAttrDiffs);
  const sLinkages = summarize(linkages);
  const sRules = summarize(rules);
  const sTypes = summarize(dataTypes);
  const sSeqs = summarize(sequences);

  const total: DiffSummary = {
    added:
      sEntities.added +
      sAttrs.added +
      sLinkages.added +
      sRules.added +
      sTypes.added +
      sSeqs.added,
    removed:
      sEntities.removed +
      sAttrs.removed +
      sLinkages.removed +
      sRules.removed +
      sTypes.removed +
      sSeqs.removed,
    modified:
      sEntities.modified +
      sAttrs.modified +
      sLinkages.modified +
      sRules.modified +
      sTypes.modified +
      sSeqs.modified,
    total: 0,
  };
  total.total = total.added + total.removed + total.modified;

  return {
    baseId: base.id,
    targetId: target.id,
    baseVersion: base.version,
    targetVersion: target.version,
    entities,
    linkages,
    rules,
    dataTypes,
    sequences,
    summary: {
      entities: sEntities,
      attributes: sAttrs,
      linkages: sLinkages,
      rules: sRules,
      dataTypes: sTypes,
      sequences: sSeqs,
      total,
    },
  };
}

// =========================================================================

function diffById<T extends { id: string }, D extends { status: ChangeStatus }>(
  baseList: T[],
  targetList: T[],
  differ: (base?: T, target?: T) => D,
): D[] {
  const baseMap = new Map(baseList.map((x) => [x.id, x]));
  const targetMap = new Map(targetList.map((x) => [x.id, x]));
  const allIds = new Set([...baseMap.keys(), ...targetMap.keys()]);

  const result: D[] = [];
  for (const id of allIds) {
    const d = differ(baseMap.get(id), targetMap.get(id));
    if (d.status !== "unchanged") result.push(d);
  }

  const order: Record<ChangeStatus, number> = {
    modified: 0,
    added: 1,
    removed: 2,
    unchanged: 3,
  };

  result.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  return result;
}

function diffEntity(base?: Entity, target?: Entity): EntityDiff {
  const id = (target ?? base)!.id;
  const status: ChangeStatus = !base
    ? "added"
    : !target
      ? "removed"
      : "modified";

  const changedFields =
    status === "modified"
      ? getChangedFields(base, target, ["id", "attributes"])
      : [];

  // Сравниваем атрибуты
  const baseAttrs = base?.attributes ?? [];
  const targetAttrs = target?.attributes ?? [];
  const attributes = diffById(baseAttrs, targetAttrs, (a, b) =>
    diffAttribute(id, a, b),
  );

  // Если modified, но ничего не изменилось — возвращаем unchanged
  if (
    status === "modified" &&
    changedFields.length === 0 &&
    attributes.length === 0
  ) {
    return {
      id,
      status: "unchanged",
      base,
      target,
      changedFields: [],
      attributes: [],
    };
  }

  return { id, status, base, target, changedFields, attributes };
}

function diffAttribute(
  entityId: string,
  base?: Attribute,
  target?: Attribute,
): AttributeDiff {
  const id = (target ?? base)!.id;
  const status: ChangeStatus = !base
    ? "added"
    : !target
      ? "removed"
      : "modified";

  const changedFields =
    status === "modified" ? getChangedFields(base, target, ["id"]) : [];

  // Если modified, но ничего не изменилось — unchanged
  if (status === "modified" && changedFields.length === 0) {
    return { id, status: "unchanged", base, target, changedFields: [] };
  }

  return { id, status, base, target, changedFields };
}

function diffLinkage(base?: Linkage, target?: Linkage): LinkageDiff {
  const id = (target ?? base)!.id;
  const status: ChangeStatus = !base
    ? "added"
    : !target
      ? "removed"
      : "modified";
  const changedFields =
    status === "modified" ? getChangedFields(base, target, ["id"]) : [];
  if (status === "modified" && changedFields.length === 0) {
    return { id, status: "unchanged", base, target, changedFields: [] };
  }
  return { id, status, base, target, changedFields };
}

// То же для diffRule, diffDataType, diffSequence

// То же для diffRule, diffDataType, diffSequence

function diffRule(base?: DataRule, target?: DataRule): RuleDiff {
  const id = (target ?? base)!.id;
  const status: ChangeStatus = !base
    ? "added"
    : !target
      ? "removed"
      : "modified";
  const changedFields =
    status === "modified" ? getChangedFields(base, target, ["id"]) : [];
  if (status === "modified" && changedFields.length === 0) {
    return { id, status: "unchanged", base, target, changedFields: [] };
  }
  return { id, status, base, target, changedFields };
}

function diffDataType(base?: DataType, target?: DataType): DataTypeDiff {
  const id = (target ?? base)!.id;
  const status: ChangeStatus = !base
    ? "added"
    : !target
      ? "removed"
      : "modified";
  const changedFields =
    status === "modified" ? getChangedFields(base, target, ["id"]) : [];
  if (status === "modified" && changedFields.length === 0) {
    return { id, status: "unchanged", base, target, changedFields: [] };
  }
  return { id, status, base, target, changedFields };
}

function diffSequence(base?: Sequence, target?: Sequence): SequenceDiff {
  const id = (target ?? base)!.id;
  const status: ChangeStatus = !base
    ? "added"
    : !target
      ? "removed"
      : "modified";
  const changedFields =
    status === "modified" ? getChangedFields(base, target, ["id"]) : [];
  if (status === "modified" && changedFields.length === 0) {
    return { id, status: "unchanged", base, target, changedFields: [] };
  }
  return { id, status, base, target, changedFields };
}

function getChangedFields(
  base: any,
  target: any,
  exclude: string[] = [],
): FieldChange[] {
  if (!base || !target) return [];

  const allKeys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(target ?? {}),
  ]);

  const result: FieldChange[] = [];
  for (const key of allKeys) {
    if (exclude.includes(key)) continue;
    const a = normalize(base[key]);
    const b = normalize(target[key]);
    if (a !== b) {
      result.push({ field: key, before: base[key], after: target[key] });
    }
  }
  return result;
}

/**
 * Стабильная сериализация: сортирует ключи объектов рекурсивно.
 * Устраняет ложные diff из-за разного порядка ключей.
 */
function normalize(value: any): string {
  return JSON.stringify(value, replacerSorted);
}

function replacerSorted(_key: string, value: any): any {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, any> = {};
    for (const k of Object.keys(value).sort()) {
      sorted[k] = value[k];
    }
    return sorted;
  }
  return value;
}

function summarize(items: { status: ChangeStatus }[]): DiffSummary {
  let added = 0,
    removed = 0,
    modified = 0;
  for (const item of items) {
    if (item.status === "added") added++;
    else if (item.status === "removed") removed++;
    else if (item.status === "modified") modified++;
    // unchanged не считаем
  }
  return {
    added,
    removed,
    modified,
    total: added + removed + modified,
  };
}