import type { DomainSchema, DataRule } from "../schema/types";
import type { SymbolTable, ResolvedEntity } from "../schema/symbol-table";
import { parseRql } from "../rql/parser";
import { evaluate, type EvalContext } from "./evaluator";
import { describeDataRule } from "./describe-rule";

export type FieldEffect =
  | "required"
  | "hidden"
  | "readonly"
  | "default"
  | "allowed";

export interface FieldState {
  value: any;
  visible: boolean;
  readonly: boolean;
  required: boolean;
  validationError: string | null;
  /** Значение по умолчанию, если применилось */
  defaultValue?: any;
}

export interface RuleApplication {
  ruleId: string;
  ruleName: string | null;
  effect: FieldEffect | null;
  applies: boolean;
  /** Причина, по которой правило не сработало (для condition) */
  reason?: string;
  /** Атрибуты, на которые подействовало правило */
  attributes: string[];
  /** Сообщение из правила */
  message?: string;
  help?: string;
  /** Читаемое описание условия */
  conditionDescription?: string;
  /** Читаемое описание эффекта */
  effectDescription?: string;
  /** Ошибка парсинга условия, если была */
  descriptionError?: string;
}

export interface SimulationResult {
  fields: Record<string, FieldState>;
  rules: RuleApplication[];
  conflicts: Conflict[];
  errors: string[];
}

export interface Conflict {
  attributeId: string;
  description: string;
  ruleIds: string[];
}

// =========================================================================

export interface SimulateOptions {
  obj: Record<string, any>;
  rules: DataRule[];
  entity: ResolvedEntity;
  table: SymbolTable;
  domain: DomainSchema;
  /** Текущий пользователь */
  currentUser?: EvalContext["currentUser"];
  /** Текущая дата */
  currentDate?: Date;
  /** Пользовательские значения linkages */
  linkages?: Record<string, any>;
}

export function simulateRules(opts: SimulateOptions): SimulationResult {
  const {
    obj,
    rules,
    entity,
    table,
    domain,
    currentUser,
    currentDate,
    linkages,
  } = opts;

  const errors: string[] = [];

  // Инициализация полей
  const fields: Record<string, FieldState> = {};
  for (const attr of entity.attributes.values()) {
    fields[attr.id] = {
      value: obj[attr.id] ?? null,
      visible: true,
      readonly: !!attr.readonly,
      required: isRequiredByConstraint(attr),
      validationError: null,
    };
  }

  // Контекст для evaluator
  const ctx: EvalContext = {
    obj,
    entityFqid: entity.fqid,
    table,
    currentUser,
    currentDate: currentDate ?? new Date(),
    linkages,
  };

  // Применяем правила
  const applications: RuleApplication[] = [];

  for (const rule of rules) {
    // Отбираем только правила для нашей сущности
    if (rule.entity && !entityMatches(rule.entity, entity, domain)) continue;

    const app = applyRule(rule, ctx, fields, domain);
    applications.push(app);
  }

  // Проверяем constraints
  for (const attr of entity.attributes.values()) {
    const state = fields[attr.id];
    const err = validateValue(attr, state.value);
    if (err) state.validationError = err;
  }

  // Ищем конфликты
  const conflicts = detectConflicts(fields, applications);

  return { fields, rules: applications, conflicts, errors };
}

// =========================================================================

function applyRule(
  rule: DataRule,
  ctx: EvalContext,
  fields: Record<string, FieldState>,
  domain: DomainSchema,
): RuleApplication {
  const description = describeDataRule(rule, ctx.table, domain, ctx.entityFqid);
  
  const base: RuleApplication = {
    ruleId: rule.id,
    ruleName: rule.name ?? null,
    effect: (rule.rule?.effect as FieldEffect | undefined) ?? null,
    applies: false,
    attributes: [],
    message: rule.message,
    help: rule.help,
    conditionDescription: description.condition,
    effectDescription: description.effect,
    descriptionError: description.error,
  };

  // Парсим condition
  const condStr = extractCondition(rule.condition);
  let condResult = true;

  if (condStr && condStr !== "true") {
    const { ast, parseErrors } = parseRql(`!rql ${condStr}`);
    if (!ast || parseErrors.length > 0) {
      base.reason = "Не удалось разобрать условие правила";
      return base;
    }

    const evaluated = evaluate(ast, ctx);
    condResult = Boolean(evaluated.value);
    if (evaluated.error) base.reason = evaluated.error;
  }

  base.applies = condResult;
  if (!condResult) return base;

  // Правило сработало — применяем эффект
  const ruleAttrs = rule.rule?.attributes ?? [];
  base.attributes = ruleAttrs.map((a) => a.attribute);
  const effect = rule.rule?.effect as FieldEffect | undefined;

  for (const attrRule of ruleAttrs) {
    const state = fields[attrRule.attribute];
    if (!state) continue;

    switch (effect) {
      case "hidden":
        state.visible = false;
        break;
      case "readonly":
        state.readonly = true;
        break;
      case "required":
        state.required = true;
        break;
      case "default":
        if (state.value === null || state.value === undefined) {
          // value или expression — просто возьмём value
          const v = (attrRule as any).value;
          if (v !== undefined) {
            state.value = v;
            state.defaultValue = v;
          }
        }
        break;
      case "allowed":
        // Проверяем constraint
        const constraint = (attrRule as any).constraint;
        if (constraint && typeof constraint === "string") {
          const { ast } = parseRql(`!rql ${constraint}`);
          if (ast) {
            const res = evaluate(ast, ctx);
            if (!Boolean(res.value)) {
              state.validationError = "Значение недопустимо";
            }
          }
        }
        break;
    }
  }

  return base;
}

// =========================================================================

function extractCondition(condition: unknown): string {
  if (condition === true) return "true";
  if (typeof condition === "string")
    return condition.replace(/^!rql\s*/i, "").trim();
  if (condition && typeof condition === "object") {
    const c = condition as any;
    if (typeof c.value === "string") return c.value.trim();
  }
  return "";
}

function entityMatches(
  ruleEntity: string,
  entity: ResolvedEntity,
  domain: DomainSchema,
): boolean {
  const slash = ruleEntity.indexOf("/");
  const ruleEntityId = slash === -1 ? ruleEntity : ruleEntity.slice(slash + 1);
  return ruleEntityId === entity.entity.id;
}

function isRequiredByConstraint(attr: any): boolean {
  return (attr.constraints ?? []).some((c: any) => c.kind === "required");
}

function validateValue(attr: any, value: any): string | null {
  if (value === null || value === undefined) {
    const required = isRequiredByConstraint(attr);
    return required ? "Обязательное поле не заполнено" : null;
  }

  for (const c of attr.constraints ?? []) {
    switch (c.kind) {
      case "range":
        if (typeof value === "number") {
          if (c.min !== undefined && value < c.min)
            return `Значение меньше минимума (${c.min})`;
          if (c.max !== undefined && value > c.max)
            return `Значение больше максимума (${c.max})`;
        }
        break;
      case "length":
        if (typeof value === "string") {
          if (c.min !== undefined && value.length < c.min)
            return `Слишком короткое (min ${c.min})`;
          if (c.max !== undefined && value.length > c.max)
            return `Слишком длинное (max ${c.max})`;
        }
        break;
      case "regexp":
        if (typeof value === "string" && c.regexp) {
          try {
            if (!new RegExp(c.regexp).test(value))
              return "Не соответствует шаблону";
          } catch {}
        }
        break;
    }
  }

  return null;
}

function detectConflicts(
  fields: Record<string, FieldState>,
  applications: RuleApplication[],
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const [attrId, state] of Object.entries(fields)) {
    if (!state.visible && state.required) {
      const rules = applications
        .filter((a) => a.applies && a.attributes.includes(attrId))
        .map((a) => a.ruleId);
      conflicts.push({
        attributeId: attrId,
        description: "Поле обязательно и одновременно скрыто",
        ruleIds: rules,
      });
    }
  }

  return conflicts;
}
