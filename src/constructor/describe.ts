import type {
  SymbolTable,
  ResolvedEntity,
  ResolvedLinkage,
} from "../schema/symbol-table";
import { resolveEntityFqid } from "../schema/symbol-table";
import { SYSTEM_LINKAGE_ATTRIBUTES } from "../schema/system-attributes";
import type {
  ConditionNode,
  GroupNode,
  LeafNode,
  LeafValue,
  LinkageNode,
  LeafOperator,
  PathNode,
} from "./types";

interface Ctx {
  table: SymbolTable;
  domain: string;
  entityFqid: string;
}

type DataKind =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "workflow"
  | "reference"
  | "other";

// =========================================================================
// Публичный API
// =========================================================================

export function describeCondition(
  node: ConditionNode,
  table: SymbolTable,
  domain: string,
  entityFqid: string,
): string {
  const ctx: Ctx = { table, domain, entityFqid };
  if (node.kind === "group") return describeGroup(node, ctx, 0);
  return describeNode(node, ctx, 0);
}

// =========================================================================
// Группы
// =========================================================================

function describeGroup(node: GroupNode, ctx: Ctx, indent: number): string {
  const pad = "  ".repeat(indent);

  if (node.children.length === 0) return `${pad}(пустое условие)`;

  // NOT — особый случай
  if (node.operator === "NOT") {
    const child = node.children[0];
    if (!child) return `${pad}НЕ (пустое условие)`;

    if (child.kind === "leaf") {
      const negated = describeLeafNegated(child, ctx);
      if (negated) return `${pad}${negated}`;
    }
    if (child.kind === "linkage") {
      const negated = describeLinkageNegated(child, ctx);
      if (negated) return `${pad}${negated}`;
    }

    const inner = describeNode(child, ctx, indent + 1);
    return `${pad}НЕ:\n${inner}`;
  }

  // Пытаемся свернуть OR однотипных условий в одну строку
  if (node.operator === "OR") {
    const collapsed = tryCollapseOrGroup(node, ctx);
    if (collapsed) return `${pad}${collapsed}`;
  }

  const header =
    node.operator === "AND"
      ? "Все условия выполнены:"
      : "Хотя бы одно из условий выполнено:";

  const lines: string[] = [];
  for (const child of node.children) {
    if (child.kind === "group") {
      lines.push(describeGroup(child, ctx, indent + 1));
    } else {
      lines.push(`${pad}  • ${describeNode(child, ctx, 0)}`);
    }
  }

  return `${pad}${header}\n${lines.join("\n")}`;
}

function describeNode(node: ConditionNode, ctx: Ctx, indent: number): string {
  if (node.kind === "leaf") return describeLeaf(node, ctx);
  if (node.kind === "linkage") return describeLinkage(node, ctx);
  if (node.kind === "path") return describePath(node, ctx);
  return describeGroup(node, ctx, indent);
}

function describePath(node: PathNode, ctx: Ctx): string {
  if (!node.path.steps.length) {
    return "пустая цепочка связей";
  }

  const startEntity = ctx.table.entities.get(node.path.startEntityFqid);
  const startName =
    startEntity?.entity.name ??
    startEntity?.entity.id ??
    node.path.startEntityFqid;

  const targetFqid = node.path.steps[node.path.steps.length - 1].toEntityFqid;
  const targetEntity = ctx.table.entities.get(targetFqid);
  const targetName =
    targetEntity?.entity.name ?? targetEntity?.entity.id ?? targetFqid;

  // Опишем путь через глаголы связей
  const parts: string[] = [startName];
  for (const step of node.path.steps) {
    if (step.kind === "linkage") {
      const linkage = ctx.table.linkages.get(step.linkageFqid);
      const verb =
        step.fromSide === "1"
          ? (linkage?.nameFrom?.side1 ?? `через ${linkage?.id ?? "?"}`)
          : (linkage?.nameFrom?.side2 ?? `через ${linkage?.id ?? "?"}`);
      parts.push(`→ (${verb})`);
    } else if (step.kind === "reference") {
      const fromEntity = ctx.table.entities.get(step.fromEntityFqid);
      const attr = fromEntity?.attributes.get(step.attributeId);
      parts.push(`→ (по полю «${attr?.name ?? step.attributeId}»)`);
    }
  }
  parts.push(`→ ${targetName}`);

  return `Цепочка связей: ${parts.join(" ")}`;
}
// =========================================================================
// Схлопывание OR
// =========================================================================

/**
 * Если группа — OR, и все её дети — leaf с одинаковым attribute и
 * поддерживаемым оператором, возвращает одну строку.
 *
 *   Тема = 'a' OR Тема = 'b'                → Тема: «a» или «b»
 *   Тема LIKE '%a%' OR Тема LIKE '%b%'      → Тема содержит «%a%» или «%b%»
 *   Тема != 'a' OR Тема != 'b'              → Тема ≠ «a» или «b»
 */
function tryCollapseOrGroup(node: GroupNode, ctx: Ctx): string | null {
  if (node.children.length < 2) return null;

  // Все дети должны быть leaf
  const leaves = node.children.filter((c): c is LeafNode => c.kind === "leaf");
  if (leaves.length !== node.children.length) return null;

  const first = leaves[0];
  if (!first.attribute) return null;

  // Одинаковый атрибут и оператор у всех
  const op = first.operator;
  if (!["=", "!=", "LIKE"].includes(op)) return null;

  for (const l of leaves) {
    if (l.attribute !== first.attribute) return null;
    if (l.operator !== op) return null;
  }

  // Собираем значения
  const values: string[] = [];
  for (const l of leaves) {
    const v = describeValue(l.value, ctx);
    if (v === "—") return null;
    values.push(v);
  }

  const attrInfo = resolveAttribute(first.attribute, ctx);
  const attrName = attrInfo.name;

  if (op === "LIKE") {
    return `${attrName} содержит ${joinOr(values)}`;
  }
  if (op === "=") {
    return `${attrName}: ${joinOr(values)}`;
  }
  if (op === "!=") {
    return `${attrName} ≠ ${joinOr(values)}`;
  }

  return null;
}

function joinOr(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} или ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} или ${values[values.length - 1]}`;
}

// =========================================================================
// Leaf
// =========================================================================

function describeLeaf(node: LeafNode, ctx: Ctx): string {
  if (!node.attribute) return "(пустое условие)";

  const attrInfo = resolveAttribute(node.attribute, ctx);
  const attrName = attrInfo.name;
  const kind = attrInfo.kind;
  const value = describeValue(node.value, ctx);

  switch (node.operator) {
    case "IS NULL":
      return kind === "reference"
        ? `${attrName} не указан`
        : `${attrName} не заполнено`;

    case "IS NOT NULL":
      return kind === "reference"
        ? `${attrName} указан`
        : `${attrName} заполнено`;

    case "LIKE":
      return `${attrName} содержит ${value}`;

    case "IN": {
      const values = node.values
        .map((v) => describeValue(v, ctx))
        .filter((v) => v !== "—");
      return `${attrName} — одно из: ${values.join(", ")}`;
    }

    case "BETWEEN": {
      const [a, b] = node.values;
      return `${attrName} в диапазоне от ${describeValue(a, ctx)} до ${describeValue(b, ctx)}`;
    }

    case "HAS":
      return `${attrName} содержит ${value}`;

    case "=":
      return `${attrName}: ${value}`;

    case "!=":
      return `${attrName} ≠ ${value}`;

    case ">":
      return kind === "date"
        ? `${attrName} позже ${value}`
        : `${attrName} больше ${value}`;

    case "<":
      return kind === "date"
        ? `${attrName} раньше ${value}`
        : `${attrName} меньше ${value}`;

    case ">=":
      return kind === "date"
        ? `${attrName} не раньше ${value}`
        : `${attrName} не меньше ${value}`;

    case "<=":
      return kind === "date"
        ? `${attrName} не позже ${value}`
        : `${attrName} не больше ${value}`;

    default:
      return `${attrName} ${describeOperator(node.operator, kind)} ${value}`;
  }
}

/**
 * Переформулировка при NOT. Возвращает строку или null,
 * если переформулировать не удалось.
 */
function describeLeafNegated(node: LeafNode, ctx: Ctx): string | null {
  if (!node.attribute) return null;

  const attrInfo = resolveAttribute(node.attribute, ctx);
  const attrName = attrInfo.name;
  const kind = attrInfo.kind;
  const value = describeValue(node.value, ctx);

  switch (node.operator) {
    case "=":
      return `${attrName} ≠ ${value}`;

    case "!=":
      return `${attrName}: ${value}`;

    case "LIKE":
      return `${attrName} не содержит ${value}`;

    case "IN": {
      const values = node.values
        .map((v) => describeValue(v, ctx))
        .filter((v) => v !== "—");
      return `${attrName} не входит в список: ${values.join(", ")}`;
    }

    case "IS NULL":
      return kind === "reference"
        ? `${attrName} указан`
        : `${attrName} заполнено`;

    case "IS NOT NULL":
      return kind === "reference"
        ? `${attrName} не указан`
        : `${attrName} не заполнено`;

    case "BETWEEN": {
      const [a, b] = node.values;
      return `${attrName} вне диапазона от ${describeValue(a, ctx)} до ${describeValue(b, ctx)}`;
    }

    default:
      return null;
  }
}

// =========================================================================
// Операторы (fallback)
// =========================================================================

function describeOperator(op: LeafOperator, kind: DataKind): string {
  // Для дат — «раньше/позже»
  if (kind === "date") {
    switch (op) {
      case "=":
        return "равно";
      case "!=":
        return "не равно";
      case ">":
        return "позже";
      case "<":
        return "раньше";
      case ">=":
        return "не раньше";
      case "<=":
        return "не позже";
    }
  }

  switch (op) {
    case "=":
      return "равно";
    case "!=":
      return "не равно";
    case ">":
      return "больше";
    case "<":
      return "меньше";
    case ">=":
      return "не меньше";
    case "<=":
      return "не больше";
    case "LIKE":
      return "содержит";
    case "IN":
      return "одно из";
    case "BETWEEN":
      return "в диапазоне";
    case "HAS":
      return "содержит";
    case "IS NULL":
      return "пусто";
    case "IS NOT NULL":
      return "не пусто";
  }
  return op;
}

// =========================================================================
// Linkage
// =========================================================================

function describeLinkage(node: LinkageNode, ctx: Ctx): string {
  const linkage = ctx.table.linkages.get(node.linkageFqid);
  const linkageName = linkage?.name ?? shortId(node.linkageFqid);

  switch (node.mode) {
    case "exists":
      return `связан с «${linkageName}»`;
    case "not-exists":
      return `не связан с «${linkageName}»`;
    case "linkage-attribute": {
      if (!node.nested?.attribute) {
        return `связь «${linkageName}» (без условия)`;
      }
      const attrName = resolveLinkageAttrName(linkage, node.nested.attribute);
      const leafDesc =
        describeLeaf(node.nested, ctx) || `${attrName} — (условие)`;
      return `связь «${linkageName}»: ${leafDesc}`;
    }
    case "entity-attribute": {
      if (!node.nested?.attribute) {
        return `связанный объект по «${linkageName}» (без условия)`;
      }
      const targetEntity = ctx.table.entities.get(node.targetEntityFqid);
      const entityName =
        targetEntity?.entity.name ?? shortId(node.targetEntityFqid);
      const leafDesc = describeLeaf(node.nested, ctx) || `(условие)`;
      return `связанный «${entityName}» по «${linkageName}»: ${leafDesc}`;
    }
  }
}

function describeLinkageNegated(node: LinkageNode, ctx: Ctx): string | null {
  const linkage = ctx.table.linkages.get(node.linkageFqid);
  const linkageName = linkage?.name ?? shortId(node.linkageFqid);

  if (node.mode === "exists") return `не связан с «${linkageName}»`;
  if (node.mode === "not-exists") return `связан с «${linkageName}»`;
  return null;
}

// =========================================================================
// Значения
// =========================================================================

function describeValue(v: LeafValue | null, ctx: Ctx): string {
  if (!v) return "—";

  switch (v.kind) {
    case "string":
      return `«${v.value}»`;
    case "number":
      return String(v.value);
    case "boolean":
      return v.value ? "да" : "нет";
    case "enum":
      return `«${resolveEnumValueName(v.enumId, v.valueId, ctx)}»`;
    case "workflow":
      return `«${resolveWorkflowValueName(v.workflowId, v.statusId, ctx)}»`;
    case "system-date":
      switch (v.which) {
        case "CurrentDate":
          return "сегодня";
        case "CurrentTime":
          return "текущее время";
        case "CurrentTimestamp":
          return "текущий момент";
      }
      return "сейчас";
    case "system-user":
      return v.which === "id"
        ? "текущий пользователь"
        : "имя текущего пользователя";
    case "attribute":
      return `значение «${v.attribute}»`;
  }
}

// =========================================================================
// Разрешение атрибутов
// =========================================================================

interface AttrInfo {
  name: string;
  kind: DataKind;
}

function resolveAttribute(attrId: string, ctx: Ctx): AttrInfo {
  // Простой атрибут
  if (!attrId.includes(".")) {
    const entity = ctx.table.entities.get(ctx.entityFqid);
    const attr = entity?.attributes.get(attrId);
    if (attr) {
      return {
        name: attr.name ?? attr.id,
        kind: kindOfDataType(attr.dataType, ctx),
      };
    }
    return { name: attrId, kind: "other" };
  }

  // Составной "linkageId.attr"
  const [linkageId, attrName] = attrId.split(".");
  const linkageFqid = `${ctx.domain}/${linkageId}`;
  const linkage = ctx.table.linkages.get(linkageFqid);

  if (linkage) {
    const own = linkage.attributes?.find((a) => a.id === attrName);
    if (own)
      return {
        name: own.name ?? own.id,
        kind: kindOfDataType(own.dataType, ctx),
      };

    const sys = SYSTEM_LINKAGE_ATTRIBUTES.find((a) => a.id === attrName);
    if (sys)
      return {
        name: sys.name ?? sys.id,
        kind: kindOfDataType(sys.dataType, ctx),
      };

    for (const side of [linkage.side1, linkage.side2]) {
      const targetFqid =
        resolveEntityFqid(side, linkage.domain, ctx.table) ??
        `${ctx.domain}/${side}`;
      const target = ctx.table.entities.get(targetFqid);
      const attr = target?.attributes.get(attrName);
      if (attr)
        return {
          name: attr.name ?? attr.id,
          kind: kindOfDataType(attr.dataType, ctx),
        };
    }
  }

  return { name: attrId, kind: "other" };
}

function kindOfDataType(dataType: string, ctx: Ctx): DataKind {
  const localFqid = `${ctx.domain}/${dataType}`;
  if (ctx.table.enums.has(localFqid) || ctx.table.enums.has(dataType)) {
    return "enum";
  }
  if (ctx.table.workflows.has(localFqid) || ctx.table.workflows.has(dataType)) {
    return "workflow";
  }

  switch (dataType) {
    case "String":
    case "Text":
    case "URL":
    case "MAC":
    case "IpAddress":
    case "CIDR":
    case "Identifier":
    case "Uuid":
      return "string";
    case "Integer":
    case "Decimal":
    case "Float":
    case "Calculation":
      return "number";
    case "Bool":
      return "boolean";
    case "Timestamp":
    case "TimestampRange":
    case "Date":
    case "Time":
      return "date";
    case "Reference":
      return "reference";
    case "Enum":
      return "enum";
    case "Workflow":
      return "workflow";
    default:
      return "other";
  }
}

function resolveLinkageAttrName(
  linkage: ResolvedLinkage | undefined,
  attrId: string,
): string {
  if (!linkage) return attrId;
  const own = linkage.attributes?.find((a) => a.id === attrId);
  if (own?.name) return own.name;
  const sys = SYSTEM_LINKAGE_ATTRIBUTES.find((a) => a.id === attrId);
  if (sys?.name) return sys.name;
  return attrId;
}

function resolveEntityAttrName(
  entity: ResolvedEntity | undefined,
  attrId: string,
): string {
  const attr = entity?.attributes.get(attrId);
  return attr?.name ?? attrId;
}

function resolveEnumValueName(
  enumId: string,
  valueId: string,
  ctx: Ctx,
): string {
  const localFqid = `${ctx.domain}/${enumId}`;
  const values = ctx.table.enums.get(localFqid) ?? ctx.table.enums.get(enumId);
  if (!values) return valueId;
  const v = values.find((x) => x.id === valueId);
  return v?.name ?? valueId;
}

function resolveWorkflowValueName(
  workflowId: string,
  statusId: string,
  ctx: Ctx,
): string {
  const localFqid = `${ctx.domain}/${workflowId}`;
  const values =
    ctx.table.workflows.get(localFqid) ?? ctx.table.workflows.get(workflowId);
  if (!values) return statusId;
  const v = values.find((x) => x.id === statusId);
  return v?.name ?? statusId;
}

function shortId(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash === -1 ? fqid : fqid.slice(slash + 1);
}
