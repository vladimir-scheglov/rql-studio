import type { SymbolTable } from "../schema/symbol-table";
import { resolveEntityFqid, resolveLinkageFqid } from "../schema/symbol-table";
import { SYSTEM_LINKAGE_ATTRIBUTES } from "../schema/system-attributes";
import type { ConditionNode, LeafNode, LinkageNode, LeafValue } from "./types";

export type IssueSeverity = "error" | "warning";

export interface NodeIssue {
  severity: IssueSeverity;
  message: string;
}

export type IssuesMap = Map<string, NodeIssue[]>;

interface Ctx {
  table: SymbolTable;
  domain: string;
  entityFqid: string;
}

/**
 * Проверяет всё дерево и возвращает карту id → список проблем.
 * Узлы без проблем в карту не попадают.
 */
export function validateTree(
  root: ConditionNode,
  table: SymbolTable,
  domain: string,
  entityFqid: string,
): IssuesMap {
  const issues: IssuesMap = new Map();
  const ctx: Ctx = { table, domain, entityFqid };
  walk(root, ctx, issues, entityFqid);
  return issues;
}

/** Количество проблем по серьёзности */
export function countIssues(issues: IssuesMap): {
  errors: number;
  warnings: number;
  total: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const list of issues.values()) {
    for (const issue of list) {
      if (issue.severity === "error") errors++;
      else warnings++;
    }
  }
  return { errors, warnings, total: errors + warnings };
}

// --- Проход --------------------------------------------------------------

function walk(
  node: ConditionNode,
  ctx: Ctx,
  issues: IssuesMap,
  currentEntityFqid: string,
): void {
  if (node.kind === "group") {
    for (const child of node.children) {
      walk(child, ctx, issues, currentEntityFqid);
    }
    return;
  }

  if (node.kind === "leaf") {
    const list = validateLeaf(node, ctx, currentEntityFqid);
    if (list.length > 0) issues.set(node.id, list);
    return;
  }

  if (node.kind === "linkage") {
    const list = validateLinkage(node, ctx);
    if (list.length > 0) issues.set(node.id, list);

    // Вложенный leaf проверяем отдельно — в контексте связи
    if (node.nested) {
      const nestedIssues = validateNestedLeaf(node, ctx);
      if (nestedIssues.length > 0) issues.set(node.nested.id, nestedIssues);
    }
  }
  if (node.kind === "path") {
    // Пропускаем — валидация PathNode требует интеграции с RQL-резолвером,
    // отложим на следующий этап
    return;
  }
}

// --- Leaf ----------------------------------------------------------------

function validateLeaf(
  node: LeafNode,
  ctx: Ctx,
  currentEntityFqid: string,
): NodeIssue[] {
  const issues: NodeIssue[] = [];

  if (!node.attribute) {
    issues.push({ severity: "warning", message: "Атрибут не выбран" });
    return issues;
  }

  const attrCheck = resolveAttribute(
    attrValueKey(node.attribute),
    ctx,
    currentEntityFqid,
  );
  if (!attrCheck.ok) {
    issues.push({ severity: "error", message: attrCheck.message });
  }

  // Проверка значений enum/workflow
  const enumIssues = validateValues(node, attrCheck.typeInfo, ctx);
  issues.push(...enumIssues);

  return issues;
}

interface AttrCheckResult {
  ok: boolean;
  message: string;
  typeInfo?: { kind: "enum" | "workflow"; id: string };
}

function resolveAttribute(
  attrId: string,
  ctx: Ctx,
  currentEntityFqid: string,
): AttrCheckResult {
  // Простой атрибут
  if (!attrId.includes(".")) {
    const entity = ctx.table.entities.get(currentEntityFqid);
    if (!entity) {
      return {
        ok: false,
        message: `Сущность не найдена: ${currentEntityFqid}`,
      };
    }
    const attr = entity.attributes.get(attrId);
    if (!attr) {
      return { ok: false, message: `Атрибут «${attrId}» не найден в сущности` };
    }
    return { ok: true, message: "", typeInfo: kindOfAttr(attr.dataType, ctx) };
  }

  // Составной: linkageId.attr
  const [linkageId, attrName] = attrId.split(".");
  const linkageFqid = resolveLinkageFqid(linkageId, ctx.domain, ctx.table);
  if (!linkageFqid) {
    return { ok: false, message: `Связь «${linkageId}» не найдена` };
  }
  const linkage = ctx.table.linkages.get(linkageFqid);
  if (!linkage) {
    return { ok: false, message: `Связь «${linkageId}» не найдена` };
  }

  // Атрибут связи
  const own = linkage.attributes?.find((a) => a.id === attrName);
  if (own)
    return { ok: true, message: "", typeInfo: kindOfAttr(own.dataType, ctx) };
  const sys = SYSTEM_LINKAGE_ATTRIBUTES.find((a) => a.id === attrName);
  if (sys)
    return { ok: true, message: "", typeInfo: kindOfAttr(sys.dataType, ctx) };

  // Атрибут связанной сущности
  for (const side of [linkage.side1, linkage.side2]) {
    const targetFqid =
      resolveEntityFqid(side, linkage.domain, ctx.table) ??
      `${ctx.domain}/${side}`;
    const target = ctx.table.entities.get(targetFqid);
    const attr = target?.attributes.get(attrName);
    if (attr)
      return {
        ok: true,
        message: "",
        typeInfo: kindOfAttr(attr.dataType, ctx),
      };
  }

  return {
    ok: false,
    message: `Атрибут «${attrName}» не найден ни у связи, ни у связанной сущности`,
  };
}

function kindOfAttr(
  dataType: string,
  ctx: Ctx,
): { kind: "enum" | "workflow"; id: string } | undefined {
  const localFqid = `${ctx.domain}/${dataType}`;
  if (ctx.table.enums.has(localFqid) || ctx.table.enums.has(dataType)) {
    return { kind: "enum", id: dataType };
  }
  if (ctx.table.workflows.has(localFqid) || ctx.table.workflows.has(dataType)) {
    return { kind: "workflow", id: dataType };
  }
  return undefined;
}

function validateValues(
  node: LeafNode,
  typeInfo: AttrCheckResult["typeInfo"],
  ctx: Ctx,
): NodeIssue[] {
  if (!typeInfo) return [];
  const issues: NodeIssue[] = [];

  const checkValue = (v: LeafValue | null) => {
    if (!v) return;
    if (typeInfo.kind === "enum" && v.kind === "enum") {
      const fqid = `${ctx.domain}/${typeInfo.id}`;
      const values =
        ctx.table.enums.get(fqid) ?? ctx.table.enums.get(typeInfo.id);
      if (!values) {
        issues.push({
          severity: "error",
          message: `Перечисление «${typeInfo.id}» не найдено в схеме`,
        });
        return;
      }
      if (!values.some((x) => x.id === v.valueId)) {
        issues.push({
          severity: "error",
          message: `Значение «${v.valueId}» отсутствует в перечислении «${typeInfo.id}»`,
        });
      }
    }
    if (typeInfo.kind === "workflow" && v.kind === "workflow") {
      const fqid = `${ctx.domain}/${typeInfo.id}`;
      const values =
        ctx.table.workflows.get(fqid) ?? ctx.table.workflows.get(typeInfo.id);
      if (!values) {
        issues.push({
          severity: "error",
          message: `Workflow «${typeInfo.id}» не найден в схеме`,
        });
        return;
      }
      if (!values.some((x) => x.id === v.statusId)) {
        issues.push({
          severity: "error",
          message: `Статус «${v.statusId}» отсутствует в workflow «${typeInfo.id}»`,
        });
      }
    }
  };

  checkValue(node.value);
  for (const v of node.values) checkValue(v);

  return issues;
}

// --- Linkage -------------------------------------------------------------

function validateLinkage(node: LinkageNode, ctx: Ctx): NodeIssue[] {
  const issues: NodeIssue[] = [];

  if (!node.linkageFqid) {
    issues.push({ severity: "warning", message: "Связь не выбрана" });
    return issues;
  }

  const linkage = ctx.table.linkages.get(node.linkageFqid);
  if (!linkage) {
    issues.push({
      severity: "error",
      message: `Связь «${node.linkageFqid}» не найдена в схеме`,
    });
    return issues;
  }

  if (node.mode === "entity-attribute") {
    if (!node.targetEntityFqid) {
      issues.push({
        severity: "error",
        message: "Не указана целевая сущность",
      });
    } else if (!ctx.table.entities.has(node.targetEntityFqid)) {
      issues.push({
        severity: "error",
        message: `Сущность «${node.targetEntityFqid}» не найдена в схеме`,
      });
    }
  }

  return issues;
}

// --- Nested leaf ---------------------------------------------------------

function validateNestedLeaf(node: LinkageNode, ctx: Ctx): NodeIssue[] {
  const nested = node.nested;
  if (!nested || !nested.attribute) {
    return [];
  }

  const linkage = ctx.table.linkages.get(node.linkageFqid);
  if (!linkage) return [];

  if (node.mode === "linkage-attribute") {
    const own = linkage.attributes?.find((a) => a.id === nested.attribute);
    const sys = SYSTEM_LINKAGE_ATTRIBUTES.find(
      (a) => a.id === nested.attribute,
    );
    if (!own && !sys) {
      return [
        {
          severity: "error",
          message: `Атрибут «${nested.attribute}» отсутствует у связи`,
        },
      ];
    }
  }

  if (node.mode === "entity-attribute") {
    const entity = ctx.table.entities.get(node.targetEntityFqid);
    if (entity && !entity.attributes.has(nested.attribute)) {
      return [
        {
          severity: "error",
          message: `Атрибут «${nested.attribute}» отсутствует у сущности «${entity.entity.id}»`,
        },
      ];
    }
  }

  return [];
}

// --- Утилиты -------------------------------------------------------------

/** LeafNode.attribute хранится как строка; отдельная функция на будущее */
function attrValueKey(attribute: string): string {
  return attribute;
}
