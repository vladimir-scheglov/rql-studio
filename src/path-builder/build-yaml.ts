import type { SymbolTable } from "../schema/symbol-table";
import type { DataRuleEffect } from "../constructor/export-yaml";
import type { PathModel } from "./types";
import { buildPathRql } from "./build-rql";

export interface PathYamlOptions {
  id: string;
  name?: string;
  entityId: string;
  effect?: DataRuleEffect;
  message?: string;
  /** Пользовательский condition для dataRules.condition */
  condition?: string;
}

export function buildPathYaml(
  path: PathModel,
  table: SymbolTable,
  domain: string,
  options: PathYamlOptions,
): { yaml: string; error?: string } {
  const { rql, error } = buildPathRql(path, table, domain);
  if (error) return { yaml: "", error };

  // Находим первое linkage в пути — оно пойдёт в linkages[].linkage
  const firstLinkage = path.steps.find((s) => s.kind === "linkage");
  if (!firstLinkage || firstLinkage.kind !== "linkage") {
    return {
      yaml: "",
      error:
        "Путь не содержит ни одной связи. Для linkages[] нужна хотя бы одна связь.",
    };
  }

  const linkage = table.linkages.get(firstLinkage.linkageFqid);
  if (!linkage) {
    return { yaml: "", error: `Связь не найдена: ${firstLinkage.linkageFqid}` };
  }

  const effect = options.effect ?? "allowed";

  const lines: string[] = [];
  lines.push("dataRules:");
  lines.push(`  - id: ${options.id}`);
  if (options.name) {
    lines.push(`    name: ${yamlString(options.name)}`);
  }
  lines.push(`    target: entity`);
  lines.push(`    entity: ${options.entityId}`);
  if (options.message) {
    lines.push(`    message: ${yamlString(options.message)}`);
  }
  if (options.condition) {
    lines.push(`    condition: !rql ${options.condition}`);
  } else {
    lines.push(`    condition: true`);
  }
  lines.push(`    rule:`);
  lines.push(`      effect: ${effect}`);
  lines.push(`      linkages:`);
  lines.push(`        - linkage: ${linkage.id}`);
  lines.push(`          expression: !rql |`);

  // Многострочный RQL с отступом
  const rqlLines = rql.split("\n");
  for (const line of rqlLines) {
    lines.push(`            ${line}`);
  }

  return { yaml: lines.join("\n") };
}

function yamlString(value: string): string {
  if (
    /[:#[\]{}|>&*!?'",%@`]/.test(value) ||
    /^[\s-]/.test(value) ||
    /\s$/.test(value)
  ) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
