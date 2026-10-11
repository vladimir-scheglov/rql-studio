import type { SimulationPlaybook, PlaybookStep } from "./playbook-types";
import type { DomainSchema } from "../schema/types";
import type { SymbolTable, ResolvedEntity } from "../schema/symbol-table";
import { simulateRules } from "./simulate";

export interface PlaybookExportInput {
  playbook: SimulationPlaybook;
  entity: ResolvedEntity;
  table: SymbolTable;
  domain: DomainSchema;
}

export function buildPlaybookMarkdown(input: PlaybookExportInput): string {
  const { playbook, entity, table, domain } = input;
  const entityName = entity.entity.name ?? entity.entity.id;
  const lines: string[] = [];

  // --- Заголовок ---
  lines.push(`# Плейбук: ${playbook.name}`);
  lines.push("");
  if (playbook.description) {
    lines.push(`> ${playbook.description}`);
    lines.push("");
  }
  lines.push(`- **Сущность:** ${entityName} (\`${entity.entity.id}\`)`);
  lines.push(`- **Домен:** \`${domain.id}\``);
  lines.push(`- **Шагов:** ${playbook.steps.length}`);
  lines.push(`- **Создан:** ${formatDate(playbook.createdAt)}`);
  lines.push("");

  // --- Оглавление ---
  if (playbook.steps.length > 1) {
    lines.push("## Содержание");
    lines.push("");
    playbook.steps.forEach((step, i) => {
      const anchor = slugify(`${i + 1}. ${step.name}`);
      lines.push(`${i + 1}. [${step.name}](#${anchor})`);
    });
    lines.push("");
  }

  // --- Шаги ---
  for (let i = 0; i < playbook.steps.length; i++) {
    const step = playbook.steps[i];

    lines.push(`## ${i + 1}. ${step.name}`);
    lines.push("");
    lines.push(
      `**Пользователь:** ${step.username} (роли: ${step.roles.join(", ") || "—"})`,
    );
    lines.push("");
    lines.push(`**Дата:** ${formatDate(step.currentDate)}`);
    lines.push("");

    if (step.notes) {
      lines.push(`_${step.notes}_`);
      lines.push("");
    }

    // JSON объекта
    lines.push("**Входной объект:**");
    lines.push("");
    lines.push("```json");
    lines.push(step.objectJson.trim());
    lines.push("```");
    lines.push("");

    // Симуляция
    let result = null;
    try {
      const obj = JSON.parse(step.objectJson || "{}");
      const rules = (domain.dataRules ?? []).filter((r) =>
        step.selectedRuleIds.includes(r.id),
      );
      result = simulateRules({
        obj,
        rules,
        entity,
        table,
        domain,
        currentUser: {
          id: "user-1",
          username: step.username,
          roles: step.roles,
        },
        currentDate: new Date(step.currentDate),
        linkages: step.linkages ?? {},
      });
    } catch (e) {
      lines.push("⚠ Не удалось вычислить состояние");
      lines.push("");
    }

    if (result) {
      // Сработавшие правила
      const applied = result.rules.filter((r) => r.applies);
      lines.push(`**Сработавшие правила:** ${applied.length}`);
      lines.push("");
      if (applied.length > 0) {
        for (const r of applied) {
          lines.push(`- \`${r.ruleId}\`${r.effect ? ` [${r.effect}]` : ""}`);
          if (
            r.conditionDescription &&
            r.conditionDescription !== "применяется ко всем объектам"
          ) {
            lines.push(`  - Если: ${r.conditionDescription}`);
          }
          if (r.effectDescription) {
            lines.push(`  - То: ${r.effectDescription}`);
          }
        }
        lines.push("");
      }

      // Состояние ключевых атрибутов
      const interestingAttrs = [...entity.attributes.values()].filter(
        (attr) => {
          const s = result.fields[attr.id];
          if (!s) return false;
          return !s.visible || s.readonly || s.required || s.validationError;
        },
      );

      if (interestingAttrs.length > 0) {
        lines.push("**Состояние ключевых атрибутов:**");
        lines.push("");
        lines.push("| Атрибут | Значение | Состояние |");
        lines.push("|---|---|---|");
        for (const attr of interestingAttrs) {
          const state = result.fields[attr.id];
          const badges: string[] = [];
          if (!state.visible) badges.push("скрыто");
          if (state.readonly) badges.push("readonly");
          if (state.required) badges.push("обязательное");
          if (state.validationError) badges.push(`⛔ ${state.validationError}`);
          lines.push(
            `| ${attr.name ?? attr.id} | \`${formatValue(state.value)}\` | ${badges.join(", ")} |`,
          );
        }
        lines.push("");
      }
    }

    // --- Различия со следующим шагом ---
    if (i < playbook.steps.length - 1) {
      const next = playbook.steps[i + 1];
      const diffs = collectStepDiffs(step, next, entity, table, domain);
      if (diffs.length > 0) {
        lines.push(`**Изменения к следующему шагу («${next.name}»):**`);
        lines.push("");
        for (const d of diffs) {
          lines.push(`- ${d}`);
        }
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  lines.push(`_Документ создан: ${formatDate(new Date().toISOString())}_`);

  return lines.join("\n");
}

// =========================================================================

interface StepResult {
  fields: Record<string, any>;
  appliedRules: Set<string>;
}

function runStep(
  step: PlaybookStep,
  entity: ResolvedEntity,
  table: SymbolTable,
  domain: DomainSchema,
): StepResult | null {
  try {
    const obj = JSON.parse(step.objectJson || "{}");
    const rules = (domain.dataRules ?? []).filter((r) =>
      step.selectedRuleIds.includes(r.id),
    );
    const result = simulateRules({
      obj,
      rules,
      entity,
      table,
      domain,
      currentUser: { id: "user-1", username: step.username, roles: step.roles },
      currentDate: new Date(step.currentDate),
      linkages: step.linkages ?? {},
    });
    return {
      fields: result.fields,
      appliedRules: new Set(
        result.rules.filter((r) => r.applies).map((r) => r.ruleId),
      ),
    };
  } catch {
    return null;
  }
}

export function collectStepDiffs(
  from: PlaybookStep,
  to: PlaybookStep,
  entity: ResolvedEntity,
  table: SymbolTable,
  domain: DomainSchema,
): string[] {
  const diffs: string[] = [];
  const fromResult = runStep(from, entity, table, domain);
  const toResult = runStep(to, entity, table, domain);
  if (!fromResult || !toResult) return diffs;

  // Различия в сработавших правилах
  for (const ruleId of toResult.appliedRules) {
    if (!fromResult.appliedRules.has(ruleId)) {
      diffs.push(`✅ начало срабатывать правило \`${ruleId}\``);
    }
  }
  for (const ruleId of fromResult.appliedRules) {
    if (!toResult.appliedRules.has(ruleId)) {
      diffs.push(`❌ перестало срабатывать правило \`${ruleId}\``);
    }
  }

  // Различия в состоянии полей
  for (const attr of entity.attributes.values()) {
    const a = fromResult.fields[attr.id];
    const b = toResult.fields[attr.id];
    if (!a || !b) continue;

    const changes: string[] = [];
    if (a.visible !== b.visible) {
      changes.push(b.visible ? "стало видимым" : "стало скрытым");
    }
    if (a.readonly !== b.readonly) {
      changes.push(b.readonly ? "стало readonly" : "снова редактируемо");
    }
    if (a.required !== b.required) {
      changes.push(b.required ? "стало обязательным" : "стало необязательным");
    }
    if (a.validationError !== b.validationError) {
      if (b.validationError) changes.push(`ошибка: ${b.validationError}`);
      else changes.push("ошибка исчезла");
    }
    if (JSON.stringify(a.value) !== JSON.stringify(b.value)) {
      changes.push(
        `значение: \`${formatValue(a.value)}\` → \`${formatValue(b.value)}\``,
      );
    }

    if (changes.length > 0) {
      diffs.push(`«${attr.name ?? attr.id}» — ${changes.join(", ")}`);
    }
  }

  return diffs;
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
