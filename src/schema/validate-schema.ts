import type {
  DomainSchema,
  Entity,
  Linkage,
  Attribute,
  DataRule,
} from "./types";
import { parseFqid } from "./fqid";

export type IssueSeverity = "error" | "warning" | "info";

export interface SchemaIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Домен, к которому относится проблема */
  domainId: string;
  /** Куда кликнуть, чтобы перейти к проблеме */
  target:
    | { kind: "entity"; fqid: string }
    | { kind: "linkage"; fqid: string }
    | { kind: "domain"; domainId: string }
    | { kind: "attribute"; fqid: string }
    | { kind: "rule"; domainId: string; ruleId: string }
    | { kind: "sequence"; domainId: string; sequenceId: string }
    | { kind: "dataType"; domainId: string; dataTypeId: string };
}

export interface ValidationResult {
  issues: SchemaIssue[];
  stats: {
    errors: number;
    warnings: number;
    infos: number;
    total: number;
  };
}

// =========================================================================

export function validateSchemas(domains: DomainSchema[]): ValidationResult {
  const issues: SchemaIssue[] = [];

  // Быстрые lookup-индексы
  const knownDomains = new Set(domains.map((d) => d.id));
  const knownEntities = new Set<string>(); // fqid
  for (const d of domains) {
    for (const e of d.entities ?? []) {
      knownEntities.add(`${d.id}/${e.id}`);
    }
  }

  for (const domain of domains) {
    validateDomain(domain, domains, knownDomains, knownEntities, issues);
  }

  return {
    issues,
    stats: {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      infos: issues.filter((i) => i.severity === "info").length,
      total: issues.length,
    },
  };
}

// =========================================================================
// Валидация одного домена
// =========================================================================

function validateDomain(
  domain: DomainSchema,
  allDomains: DomainSchema[],
  knownDomains: Set<string>,
  knownEntities: Set<string>,
  out: SchemaIssue[],
): void {
  // --- Сущности ---
  for (const entity of domain.entities ?? []) {
    const fqid = `${domain.id}/${entity.id}`;

    if (!entity.name) {
      out.push({
        severity: "warning",
        code: "ENTITY_WITHOUT_NAME",
        message: `Сущность «${entity.id}» не имеет отображаемого имени (name)`,
        domainId: domain.id,
        target: { kind: "entity", fqid },
      });
    }

    if (!entity.label) {
      out.push({
        severity: "warning",
        code: "ENTITY_WITHOUT_LABEL",
        message: `Сущность «${entity.id}» не имеет лейбла (label). В интерфейсе будут показываться UUID объектов`,
        domainId: domain.id,
        target: { kind: "entity", fqid },
      });
    }

    // Атрибуты
    validateEntityAttributes(domain, entity, out);

    // Наследование
    if (entity.inherits) {
      validateInheritance(domain, entity, knownDomains, knownEntities, out);
    }
  }

  // Циклы наследования
  detectInheritanceCycles(domain, knownEntities, out);

  // --- Связи ---
  for (const linkage of domain.linkages ?? []) {
    validateLinkage(domain, linkage, knownDomains, knownEntities, out);
  }

  // --- Правила данных ---
  validateDataRules(domain, out);

  // --- Последовательности ---
  validateSequences(domain, out);

  // --- Пользовательские типы ---
  validateDataTypes(domain, allDomains, out);

  validateEntityDuplicates(domain, out);
  validateConstraints(domain, out);
  validateIdentifiers(domain, out);
  validateNameFrom(domain, out);
  validateRuleAttributes(domain, knownEntities, knownDomains, out);
}

// =========================================================================
// Атрибуты сущности
// =========================================================================

function validateEntityAttributes(
  domain: DomainSchema,
  entity: Entity,
  out: SchemaIssue[],
): void {
  const fqid = `${domain.id}/${entity.id}`;

  for (const attr of entity.attributes ?? []) {
    if (!attr.name) {
      out.push({
        severity: "info",
        code: "ATTR_WITHOUT_NAME",
        message: `Атрибут «${attr.id}» в сущности «${entity.id}» не имеет отображаемого имени (name)`,
        domainId: domain.id,
        target: { kind: "attribute", fqid: `${fqid}.${attr.id}` },
      });
    }

    // Reference без entity
    if (attr.dataType === "Reference" && !attr.entity) {
      out.push({
        severity: "error",
        code: "REF_WITHOUT_ENTITY",
        message: `Атрибут «${entity.id}.${attr.id}» имеет тип Reference, но не указана целевая сущность (entity)`,
        domainId: domain.id,
        target: { kind: "attribute", fqid: `${fqid}.${attr.id}` },
      });
    }

    // Array без item
    if (attr.dataType === "Array" && !attr.item) {
      out.push({
        severity: "error",
        code: "ARRAY_WITHOUT_ITEM",
        message: `Атрибут «${entity.id}.${attr.id}» имеет тип Array, но не указан тип элементов (item)`,
        domainId: domain.id,
        target: { kind: "attribute", fqid: `${fqid}.${attr.id}` },
      });
    }
  }
}

// =========================================================================
// Наследование
// =========================================================================

function validateInheritance(
  domain: DomainSchema,
  entity: Entity,
  knownDomains: Set<string>,
  knownEntities: Set<string>,
  out: SchemaIssue[],
): void {
  const parent = entity.inherits!;
  const fqid = `${domain.id}/${entity.id}`;

  // Резолв FQID
  const parts = parseFqid(parent);
  const parentFqid = parts.domain
    ? `${parts.domain}/${parts.entity}`
    : `${domain.id}/${parts.entity}`;

  if (!knownEntities.has(parentFqid)) {
    out.push({
      severity: "error",
      code: "INHERITS_UNKNOWN_ENTITY",
      message: `Сущность «${entity.id}» наследует несуществующую сущность «${parent}»`,
      domainId: domain.id,
      target: { kind: "entity", fqid },
    });
  }
}

function detectInheritanceCycles(
  domain: DomainSchema,
  knownEntities: Set<string>,
  out: SchemaIssue[],
): void {
  const graph = new Map<string, string | null>();

  for (const entity of domain.entities ?? []) {
    if (!entity.inherits) {
      graph.set(entity.id, null);
      continue;
    }
    const parts = parseFqid(entity.inherits);
    const targetId =
      parts.domain && parts.domain !== domain.id
        ? `${parts.domain}/${parts.entity}`
        : parts.entity;
    graph.set(entity.id, targetId);
  }

  // DFS-поиск циклов
  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (nodeId: string, path: string[]): void => {
    if (stack.has(nodeId)) {
      // Нашли цикл
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart).concat(nodeId);
      out.push({
        severity: "error",
        code: "INHERITANCE_CYCLE",
        message: `Цикл наследования: ${cycle.join(" → ")}`,
        domainId: domain.id,
        target: { kind: "entity", fqid: `${domain.id}/${nodeId}` },
      });
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    stack.add(nodeId);

    const parent = graph.get(nodeId);
    if (parent) {
      // Для кросс-доменного родителя не идём дальше
      if (parent.includes("/") && !parent.startsWith(domain.id + "/")) return;
      const localParent = parent.includes("/") ? parent.split("/")[1] : parent;
      if (graph.has(localParent)) {
        dfs(localParent, path.concat(nodeId));
      }
    }

    stack.delete(nodeId);
  };

  for (const entityId of graph.keys()) {
    if (!visited.has(entityId)) {
      dfs(entityId, []);
    }
  }
}

// =========================================================================
// Связи
// =========================================================================

function validateLinkage(
  domain: DomainSchema,
  linkage: Linkage,
  knownDomains: Set<string>,
  knownEntities: Set<string>,
  out: SchemaIssue[],
): void {
  const fqid = `${domain.id}/${linkage.id}`;

  if (!linkage.name) {
    out.push({
      severity: "info",
      code: "LINKAGE_WITHOUT_NAME",
      message: `Связь «${linkage.id}» не имеет названия (name)`,
      domainId: domain.id,
      target: { kind: "linkage", fqid },
    });
  }

  // Проверка side1
  const side1Ref = linkage.side1;
  const side1Parts = parseFqid(side1Ref);
  const side1Fqid = side1Parts.domain
    ? `${side1Parts.domain}/${side1Parts.entity}`
    : `${domain.id}/${side1Parts.entity}`;

  if (!knownEntities.has(side1Fqid)) {
    const isExternal =
      side1Parts.domain && !knownDomains.has(side1Parts.domain);
    out.push({
      severity: isExternal ? "warning" : "error",
      code: isExternal ? "LINKAGE_UNKNOWN_DOMAIN" : "LINKAGE_UNKNOWN_ENTITY",
      message: isExternal
        ? `Связь «${linkage.id}»: сторона 1 ссылается на домен «${side1Parts.domain}», который не загружен`
        : `Связь «${linkage.id}»: сторона 1 ссылается на несуществующую сущность «${side1Ref}»`,
      domainId: domain.id,
      target: { kind: "linkage", fqid },
    });
  }

  // Проверка side2
  const side2Ref = linkage.side2;
  const side2Parts = parseFqid(side2Ref);
  const side2Fqid = side2Parts.domain
    ? `${side2Parts.domain}/${side2Parts.entity}`
    : `${domain.id}/${side2Parts.entity}`;

  if (!knownEntities.has(side2Fqid)) {
    const isExternal =
      side2Parts.domain && !knownDomains.has(side2Parts.domain);
    out.push({
      severity: isExternal ? "warning" : "error",
      code: isExternal ? "LINKAGE_UNKNOWN_DOMAIN" : "LINKAGE_UNKNOWN_ENTITY",
      message: isExternal
        ? `Связь «${linkage.id}»: сторона 2 ссылается на домен «${side2Parts.domain}», который не загружен`
        : `Связь «${linkage.id}»: сторона 2 ссылается на несуществующую сущность «${side2Ref}»`,
      domainId: domain.id,
      target: { kind: "linkage", fqid },
    });
  }

  // Проверка направленности
  if (linkage.type === "1_1" || linkage.type === "1_n") {
    if (linkage.undirected) {
      out.push({
        severity: "warning",
        code: "LINKAGE_UNDIRECTED_NOT_ALLOWED",
        message: `Связь «${linkage.id}» имеет тип ${linkage.type}, но помечена как ненаправленная. Ненаправленные связи возможны только для N-N`,
        domainId: domain.id,
        target: { kind: "linkage", fqid },
      });
    }
  }
}

// =========================================================================
// Правила данных
// =========================================================================

function validateDataRules(domain: DomainSchema, out: SchemaIssue[]): void {
  const seen = new Map<string, number>();

  for (const rule of domain.dataRules ?? []) {
    // Дубликаты ID
    const count = (seen.get(rule.id) ?? 0) + 1;
    seen.set(rule.id, count);
    if (count === 2) {
      out.push({
        severity: "error",
        code: "DUPLICATE_RULE_ID",
        message: `Правило «${rule.id}» встречается в домене более одного раза`,
        domainId: domain.id,
        target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
      });
    }

    // Без имени
    if (!rule.name) {
      out.push({
        severity: "info",
        code: "RULE_WITHOUT_NAME",
        message: `Правило «${rule.id}» не имеет названия (name)`,
        domainId: domain.id,
        target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
      });
    }

    // Без условия
    const hasCondition =
      rule.condition === true ||
      (typeof rule.condition === "string" && rule.condition.trim() !== "") ||
      (rule.condition && typeof rule.condition === "object");
    if (!hasCondition) {
      out.push({
        severity: "warning",
        code: "RULE_WITHOUT_CONDITION",
        message: `Правило «${rule.id}» применяется ко всем объектам безусловно`,
        domainId: domain.id,
        target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
      });
    }

    // Без effect
    if (!rule.rule?.effect) {
      out.push({
        severity: "warning",
        code: "RULE_WITHOUT_EFFECT",
        message: `Правило «${rule.id}» не имеет эффекта (rule.effect)`,
        domainId: domain.id,
        target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
      });
    }
  }
}

// =========================================================================
// Последовательности
// =========================================================================

function validateSequences(domain: DomainSchema, out: SchemaIssue[]): void {
  const usedSequenceIds = new Set<string>();

  // Собираем использованные sequences из атрибутов-идентификаторов
  for (const entity of domain.entities ?? []) {
    for (const attr of entity.attributes ?? []) {
      if (attr.dataType === "Identifier" && attr.sequence) {
        const parts = parseFqid(attr.sequence);
        const seqId =
          parts.domain && parts.domain === domain.id
            ? parts.entity
            : parts.entity || attr.sequence;
        usedSequenceIds.add(seqId);
        // Проверяем, что такая последовательность существует
        const exists = (domain.sequences ?? []).some((s) => s.id === seqId);
        if (!exists) {
          out.push({
            severity: "error",
            code: "SEQUENCE_NOT_FOUND",
            message: `Атрибут «${entity.id}.${attr.id}» ссылается на несуществующую последовательность «${attr.sequence}»`,
            domainId: domain.id,
            target: {
              kind: "attribute",
              fqid: `${domain.id}/${entity.id}.${attr.id}`,
            },
          });
        }
      }
    }
  }

  // Осиротевшие последовательности
  for (const seq of domain.sequences ?? []) {
    if (!usedSequenceIds.has(seq.id)) {
      out.push({
        severity: "warning",
        code: "ORPHAN_SEQUENCE",
        message: `Последовательность «${seq.id}» объявлена, но не используется ни в одном атрибуте типа Identifier`,
        domainId: domain.id,
        target: { kind: "sequence", domainId: domain.id, sequenceId: seq.id },
      });
    }
  }
}

// =========================================================================
// Пользовательские типы
// =========================================================================

function validateDataTypes(
  domain: DomainSchema,
  allDomains: DomainSchema[],
  out: SchemaIssue[],
): void {
  const usedTypeIds = new Set<string>();

  for (const entity of domain.entities ?? []) {
    for (const attr of entity.attributes ?? []) {
      const dt = attr.dataType;
      if (dt && !isBuiltinType(dt)) {
        // Убираем префикс домена, если он есть
        const parts = parseFqid(dt);
        usedTypeIds.add(parts.entity);
      }
      if (attr.item?.dataType && !isBuiltinType(attr.item.dataType)) {
        const parts = parseFqid(attr.item.dataType);
        usedTypeIds.add(parts.entity);
      }
    }
  }

  // Также типы могут использоваться в других доменах — если домен загружен,
  // учитываем это через глобальный анализ (см. validateSchemas)
  for (const other of allDomains) {
    if (other.id === domain.id) continue;
    for (const entity of other.entities ?? []) {
      for (const attr of entity.attributes ?? []) {
        if (attr.dataType && !isBuiltinType(attr.dataType)) {
          const parts = parseFqid(attr.dataType);
          if (parts.domain === domain.id) {
            usedTypeIds.add(parts.entity);
          }
        }
        if (attr.item?.dataType && !isBuiltinType(attr.item.dataType)) {
          const parts = parseFqid(attr.item.dataType);
          if (parts.domain === domain.id) {
            usedTypeIds.add(parts.entity);
          }
        }
      }
    }
  }

  // Проверяем неиспользованные Enum и Workflow
  for (const dt of domain.dataTypes ?? []) {
    if (dt.dataType === "Enum" && !usedTypeIds.has(dt.id)) {
      out.push({
        severity: "info",
        code: "UNUSED_ENUM",
        message: `Перечисление «${dt.id}» не используется ни в одном атрибуте`,
        domainId: domain.id,
        target: { kind: "dataType", domainId: domain.id, dataTypeId: dt.id },
      });
    }
    if (dt.dataType === "Workflow" && !usedTypeIds.has(dt.id)) {
      out.push({
        severity: "info",
        code: "UNUSED_WORKFLOW",
        message: `Workflow «${dt.id}» не используется ни в одном атрибуте`,
        domainId: domain.id,
        target: { kind: "dataType", domainId: domain.id, dataTypeId: dt.id },
      });
    }
  }
}

// =========================================================================

const BUILTIN_TYPES = new Set([
  "String",
  "Text",
  "Integer",
  "Decimal",
  "Float",
  "Bool",
  "Timestamp",
  "Date",
  "Time",
  "TimestampRange",
  "Uuid",
  "MAC",
  "IpAddress",
  "CIDR",
  "URL",
  "Attachment",
  "Reference",
  "Array",
  "Table",
  "Enum",
  "Workflow",
  "Identifier",
  "Counter",
  "Calculation",
  "Configuration",
  "Variable",
  "Automation",
  "RQL",
]);

function isBuiltinType(t: string): boolean {
  return BUILTIN_TYPES.has(t);
}

function validateEntityDuplicates(
  domain: DomainSchema,
  out: SchemaIssue[],
): void {
  const seen = new Map<string, number>();
  for (const entity of domain.entities ?? []) {
    const count = (seen.get(entity.id) ?? 0) + 1;
    seen.set(entity.id, count);
    if (count === 2) {
      out.push({
        severity: "error",
        code: "DUPLICATE_ENTITY_ID",
        message: `Сущность с ID «${entity.id}» встречается в домене более одного раза`,
        domainId: domain.id,
        target: { kind: "entity", fqid: `${domain.id}/${entity.id}` },
      });
    }
  }
}

function validateConstraints(domain: DomainSchema, out: SchemaIssue[]): void {
  for (const entity of domain.entities ?? []) {
    for (const attr of entity.attributes ?? []) {
      checkAttrConstraints(domain, entity, attr, out);

      // Вложенный item (для массивов)
      if (attr.item) {
        for (const c of attr.item.constraints ?? []) {
          checkConstraintRange(domain, entity, attr, c, out);
        }
      }
    }
  }
}

function checkAttrConstraints(
  domain: DomainSchema,
  entity: Entity,
  attr: Attribute,
  out: SchemaIssue[],
): void {
  for (const c of attr.constraints ?? []) {
    checkConstraintRange(domain, entity, attr, c, out);
  }
}

function checkConstraintRange(
  domain: DomainSchema,
  entity: Entity,
  attr: Attribute,
  c: { kind: string; min?: number; max?: number },
  out: SchemaIssue[],
): void {
  if (c.kind !== "range" && c.kind !== "length" && c.kind !== "size") return;
  if (c.min === undefined || c.max === undefined) return;

  if (c.min > c.max) {
    out.push({
      severity: "error",
      code: "CONSTRAINT_MIN_GT_MAX",
      message: `Атрибут «${entity.id}.${attr.id}»: в ограничении «${c.kind}» минимум (${c.min}) больше максимума (${c.max})`,
      domainId: domain.id,
      target: {
        kind: "attribute",
        fqid: `${domain.id}/${entity.id}.${attr.id}`,
      },
    });
  }
}

function validateIdentifiers(domain: DomainSchema, out: SchemaIssue[]): void {
  for (const entity of domain.entities ?? []) {
    for (const attr of entity.attributes ?? []) {
      if (attr.dataType !== "Identifier") continue;

      const fqid = `${domain.id}/${entity.id}.${attr.id}`;

      // Шаблон с {@prefix} без defaultPrefix
      if (attr.template?.includes("{@prefix}") && !attr.defaultPrefix) {
        out.push({
          severity: "error",
          code: "IDENTIFIER_NO_DEFAULT_PREFIX",
          message: `Атрибут «${entity.id}.${attr.id}» использует литерал {@prefix}, но не задан defaultPrefix`,
          domainId: domain.id,
          target: { kind: "attribute", fqid },
        });
      }

      // Шаблон без {@inc}
      if (attr.template && !attr.template.includes("{@inc}")) {
        out.push({
          severity: "error",
          code: "IDENTIFIER_NO_INCREMENT",
          message: `Атрибут «${entity.id}.${attr.id}»: в шаблоне отсутствует обязательный литерал {@inc}`,
          domainId: domain.id,
          target: { kind: "attribute", fqid },
        });
      }

      // incrementTemplate: от 2 до 10 цифр
      if (attr.incrementTemplate !== undefined) {
        const digits = attr.incrementTemplate.replace(/\D/g, "").length;
        if (digits > 0 && (digits < 2 || digits > 10)) {
          out.push({
            severity: "warning",
            code: "IDENTIFIER_INCREMENT_TEMPLATE_SIZE",
            message: `Атрибут «${entity.id}.${attr.id}»: incrementTemplate содержит ${digits} цифр. Рекомендуется от 2 до 10`,
            domainId: domain.id,
            target: { kind: "attribute", fqid },
          });
        }
      }

      // defaultPrefix формат
      if (attr.defaultPrefix && !/^[A-Za-z0-9_-]+$/.test(attr.defaultPrefix)) {
        out.push({
          severity: "warning",
          code: "IDENTIFIER_PREFIX_FORMAT",
          message: `Атрибут «${entity.id}.${attr.id}»: defaultPrefix содержит недопустимые символы. Допустимы только буквы, цифры, «-» и «_»`,
          domainId: domain.id,
          target: { kind: "attribute", fqid },
        });
      }

      // template: не должно быть повторяющихся дат-литералов
      if (attr.template) {
        const literals = [...attr.template.matchAll(/\{@(\w+)\}/g)].map(
          (m) => m[1],
        );
        const dates = literals.filter((l) =>
          ["YYYY", "YY", "MM", "DD"].includes(l),
        );
        const uniqueDates = new Set(dates);
        if (dates.length !== uniqueDates.size) {
          out.push({
            severity: "warning",
            code: "IDENTIFIER_DUPLICATE_DATE_LITERAL",
            message: `Атрибут «${entity.id}.${attr.id}»: в шаблоне повторяются литералы даты`,
            domainId: domain.id,
            target: { kind: "attribute", fqid },
          });
        }
      }
    }
  }
}

function validateNameFrom(domain: DomainSchema, out: SchemaIssue[]): void {
  for (const linkage of domain.linkages ?? []) {
    const fqid = `${domain.id}/${linkage.id}`;

    if (!linkage.nameFrom) {
      out.push({
        severity: "warning",
        code: "LINKAGE_NO_NAME_FROM",
        message: `Связь «${linkage.id}» не имеет nameFrom. В интерфейсе глагольные формы связи будут по умолчанию`,
        domainId: domain.id,
        target: { kind: "linkage", fqid },
      });
      continue;
    }

    if (!linkage.nameFrom.side1?.trim()) {
      out.push({
        severity: "warning",
        code: "LINKAGE_NO_NAME_FROM_SIDE1",
        message: `Связь «${linkage.id}»: не указана глагольная форма для стороны 1 (nameFrom.side1)`,
        domainId: domain.id,
        target: { kind: "linkage", fqid },
      });
    }
    if (!linkage.nameFrom.side2?.trim()) {
      out.push({
        severity: "warning",
        code: "LINKAGE_NO_NAME_FROM_SIDE2",
        message: `Связь «${linkage.id}»: не указана глагольная форма для стороны 2 (nameFrom.side2)`,
        domainId: domain.id,
        target: { kind: "linkage", fqid },
      });
    }
  }
}

function validateRuleAttributes(
  domain: DomainSchema,
  knownEntities: Set<string>,
  knownDomains: Set<string>,
  out: SchemaIssue[],
): void {
  // Индекс: entityId → Set<attributeId>
  const entityAttrs = new Map<string, Set<string>>();
  for (const entity of domain.entities ?? []) {
    const set = new Set<string>();
    for (const attr of entity.attributes ?? []) {
      set.add(attr.id);
    }
    entityAttrs.set(entity.id, set);
  }

  for (const rule of domain.dataRules ?? []) {
    if (!rule.entity) continue;

    // Резолв FQID сущности
    const parts = parseFqid(rule.entity);
    const isExternal = parts.domain && parts.domain !== domain.id;

    if (isExternal) {
      if (!knownDomains.has(parts.domain!)) {
        out.push({
          severity: "warning",
          code: "RULE_EXTERNAL_DOMAIN_NOT_LOADED",
          message: `Правило «${rule.id}»: указана сущность из домена «${parts.domain}», который не загружен`,
          domainId: domain.id,
          target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
        });
      }
      continue;
    }

    const localEntityId = parts.entity;
    const attrs = entityAttrs.get(localEntityId);

    if (!attrs) {
      out.push({
        severity: "error",
        code: "RULE_UNKNOWN_ENTITY",
        message: `Правило «${rule.id}»: сущность «${rule.entity}» не найдена в домене`,
        domainId: domain.id,
        target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
      });
      continue;
    }

    // Проверка атрибутов в effect.attributes
    for (const a of rule.rule?.attributes ?? []) {
      if (!attrs.has(a.attribute)) {
        out.push({
          severity: "error",
          code: "RULE_UNKNOWN_ATTRIBUTE",
          message: `Правило «${rule.id}»: атрибут «${a.attribute}» отсутствует в сущности «${localEntityId}»`,
          domainId: domain.id,
          target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
        });
      }
    }

    // Проверка атрибута, к которому применяется правило (dataRules[].attribute)
    const ruleAttr = (rule as any).attribute;
    if (ruleAttr && !attrs.has(ruleAttr)) {
      out.push({
        severity: "error",
        code: "RULE_UNKNOWN_TARGET_ATTRIBUTE",
        message: `Правило «${rule.id}»: целевой атрибут «${ruleAttr}» отсутствует в сущности «${localEntityId}»`,
        domainId: domain.id,
        target: { kind: "rule", domainId: domain.id, ruleId: rule.id },
      });
    }
  }
}