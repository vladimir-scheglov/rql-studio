import type {
  DomainSchema,
  Entity,
  Attribute,
  Linkage,
  DataRule,
} from "../schema/types";
import type { SymbolTable, ResolvedEntity } from "../schema/symbol-table";
import { resolveEntityFqid } from "../schema/symbol-table";
import { marked } from "marked";
import DOMPurify from "dompurify";

export interface ReportOptions {
  includeToc?: boolean;
  includeOverview?: boolean;
  includeEntities?: boolean;
  includeLinkages?: boolean;
  includeEnums?: boolean;
  includeWorkflows?: boolean;
  includeTables?: boolean;
  includeRules?: boolean;
  includeActions?: boolean;
  includeMenus?: boolean;
  includeDiagram?: boolean;
  includeCrossRefs?: boolean;
  allDomains?: DomainSchema[];
}

const DEFAULTS: ReportOptions = {
  includeToc: true,
  includeOverview: true,
  includeEntities: true,
  includeLinkages: true,
  includeEnums: true,
  includeWorkflows: true,
  includeTables: true,
  includeRules: true,
  includeActions: true,
  includeMenus: true,
  includeDiagram: true,
  includeCrossRefs: true,
};

// =========================================================================

export function buildDomainReportMarkdown(
  domain: DomainSchema,
  table: SymbolTable,
  options: ReportOptions = {},
): string {
  const opts = { ...DEFAULTS, ...options };
  const lines: string[] = [];

  // --- Заголовок ---
  lines.push(`# ${domain.name}`);
  lines.push("");
  if (domain.description) {
    lines.push(`> ${domain.description}`);
    lines.push("");
  }

  // --- Метаданные ---
  if (opts.includeOverview) {
    lines.push("## Обзор");
    lines.push("");
    lines.push(`| Поле | Значение |`);
    lines.push(`|---|---|`);
    lines.push(`| **ID домена** | \`${domain.id}\` |`);
    lines.push(`| **Версия** | ${domain.version} |`);
    if (domain.status) lines.push(`| **Статус** | ${domain.status} |`);
    if (domain.author) lines.push(`| **Автор** | ${domain.author} |`);
    if (domain.date) lines.push(`| **Дата** | ${domain.date} |`);
    if (domain.tags?.length) {
      lines.push(
        `| **Теги** | ${domain.tags.map((t) => `\`${t}\``).join(", ")} |`,
      );
    }
    lines.push("");

    // Статистика
    const entitiesCount = domain.entities?.length ?? 0;
    const linkagesCount = domain.linkages?.length ?? 0;
    const rulesCount = domain.dataRules?.length ?? 0;
    const enumsCount = (domain.dataTypes ?? []).filter(
      (d) => d.dataType === "Enum",
    ).length;
    const workflowsCount = (domain.dataTypes ?? []).filter(
      (d) => d.dataType === "Workflow",
    ).length;

    lines.push("### Статистика");
    lines.push("");
    lines.push(`- **Сущностей:** ${entitiesCount}`);
    lines.push(`- **Связей:** ${linkagesCount}`);
    lines.push(`- **Правил данных:** ${rulesCount}`);
    if (enumsCount > 0) lines.push(`- **Перечислений:** ${enumsCount}`);
    if (workflowsCount > 0) lines.push(`- **Workflow:** ${workflowsCount}`);
    lines.push("");
  }

  // --- Сущности ---
  if (opts.includeEntities) {
    lines.push("## Сущности");
    lines.push("");

    for (const entity of domain.entities ?? []) {
      lines.push(`### ${entity.name ?? entity.id}`);
      lines.push("");
      if (entity.description) {
        lines.push(entity.description);
        lines.push("");
      }

      lines.push(`**ID:** \`${entity.id}\``);

      if (entity.label) {
        lines.push(`  `);
        lines.push(`**Лейбл:** \`${entity.label}\``);
      }

      if (entity.inherits) {
        lines.push(`  `);
        lines.push(`**Наследует:** \`${entity.inherits}\``);
      }

      lines.push("");
      lines.push("| Атрибут | ID | Тип | Ограничения |");
      lines.push("|---|---|---|---|");

      for (const attr of entity.attributes ?? []) {
        const flags = collectAttrFlags(attr);
        lines.push(
          `| ${attr.name ?? attr.id} | \`${attr.id}\` | ${formatType(attr)} | ${flags || "—"} |`,
        );
      }

      lines.push("");
    }
  }

  // --- Связи ---
  if (opts.includeLinkages) {
    lines.push("## Связи");
    lines.push("");

    if (!domain.linkages?.length) {
      lines.push("_Связей в домене нет._");
      lines.push("");
    } else {
      lines.push(
        "| ID | Название | Тип | Сторона 1 | Сторона 2 | Направление |",
      );
      lines.push("|---|---|---|---|---|---|");

      for (const linkage of domain.linkages) {
        const typeLabel =
          linkage.type === "1_1"
            ? "1-1"
            : linkage.type === "1_n"
              ? "1-N"
              : "N-N";
        const dir = linkage.undirected ? "↔ ненаправленная" : "→ направленная";

        lines.push(
          `| \`${linkage.id}\` | ${linkage.name ?? "—"} | ${typeLabel} | \`${linkage.side1}\` | \`${linkage.side2}\` | ${dir} |`,
        );
      }

      lines.push("");
    }
  }

  // --- Перечисления ---
  if (opts.includeEnums) {
    const enums = (domain.dataTypes ?? []).filter((d) => d.dataType === "Enum");
    if (enums.length > 0) {
      lines.push("## Перечисления");
      lines.push("");

      for (const e of enums) {
        lines.push(`### ${e.name ?? e.id}`);
        lines.push("");
        lines.push(`**ID:** \`${e.id}\``);
        if (e.description) {
          lines.push("");
          lines.push(e.description);
        }
        lines.push("");
        lines.push("| ID значения | Название |");
        lines.push("|---|---|");
        for (const v of e.values ?? []) {
          lines.push(`| \`${v.id}\` | ${v.name ?? "—"} |`);
        }
        lines.push("");
      }
    }
  }

  // --- Workflow ---
  if (opts.includeWorkflows) {
    const workflows = (domain.dataTypes ?? []).filter(
      (d) => d.dataType === "Workflow",
    );
    if (workflows.length > 0) {
      lines.push("## Workflow");
      lines.push("");

      for (const w of workflows) {
        lines.push(`### ${w.name ?? w.id}`);
        lines.push("");
        lines.push(`**ID:** \`${w.id}\``);
        if (w.description) {
          lines.push("");
          lines.push(w.description);
        }
        lines.push("");
        lines.push("| Статус | ID |");
        lines.push("|---|---|");
        for (const v of w.values ?? []) {
          lines.push(`| ${v.name ?? "—"} | \`${v.id}\` |`);
        }
        lines.push("");
      }
    }
  }

  // --- Табличные типы ---
  if (opts.includeTables) {
    const tables = (domain.dataTypes ?? []).filter(
      (d) => d.dataType === "Table",
    );
    if (tables.length > 0) {
      lines.push("## Табличные типы");
      lines.push("");

      for (const t of tables) {
        lines.push(`### ${t.name ?? t.id}`);
        lines.push("");
        lines.push(`**ID:** \`${t.id}\``);
        if (t.description) {
          lines.push("");
          lines.push(t.description);
        }
        lines.push("");
        lines.push("| Столбец | ID | Тип | Ограничения |");
        lines.push("|---|---|---|---|");
        for (const a of t.attributes ?? []) {
          lines.push(
            `| ${a.name ?? a.id} | \`${a.id}\` | ${formatType(a)} | ${collectAttrFlags(a) || "—"} |`,
          );
        }
        lines.push("");
      }
    }
  }

  // --- Правила данных ---
  if (opts.includeRules) {
    lines.push("## Правила данных");
    lines.push("");

    if (!domain.dataRules?.length) {
      lines.push("_Правил в домене нет._");
      lines.push("");
    } else {
      for (const rule of domain.dataRules) {
        lines.push(`### ${rule.name ?? rule.id}`);
        lines.push("");
        lines.push(`**ID:** \`${rule.id}\``);
        lines.push("");
        if (rule.entity) {
          lines.push(`**Сущность:** \`${rule.entity}\``);
          lines.push("");
        }
        if (rule.rule?.effect) {
          lines.push(`**Эффект:** \`${rule.rule.effect}\``);
          lines.push("");
        }

        const condition = extractCondition(rule.condition);
        if (condition) {
          lines.push("**Условие:**");
          lines.push("");
          lines.push("```rql");
          lines.push(`!rql ${condition}`);
          lines.push("```");
          lines.push("");
        } else {
          lines.push("**Условие:** применяется ко всем объектам");
          lines.push("");
        }

        if (rule.rule?.attributes?.length) {
          lines.push("**Атрибуты:**");
          lines.push("");
          for (const a of rule.rule.attributes) {
            lines.push(
              `- \`${a.attribute}\`${a.message ? ` — ${a.message}` : ""}`,
            );
          }
          lines.push("");
        }
      }
    }
  }

  // --- Действия ---
  if (opts.includeActions) {
    const actions = domain.actions ?? [];
    if (actions.length > 0) {
      lines.push("## Действия");
      lines.push("");
      lines.push("| ID | Название | Тип | Сущность |");
      lines.push("|---|---|---|---|");
      for (const a of actions) {
        const entity = (a as any).entity ?? "—";
        lines.push(
          `| \`${a.id}\` | ${a.name ?? "—"} | \`${a.type}\` | ${entity !== "—" ? `\`${entity}\`` : "—"} |`,
        );
      }
      lines.push("");
    }
  }

  // --- Меню ---
  if (opts.includeMenus) {
    const menus = domain.menus ?? [];
    if (menus.length > 0) {
      lines.push("## Меню");
      lines.push("");

      for (const menu of menus) {
        const typeLabel =
          menu.type === "root_group"
            ? "Корневая группа"
            : menu.type === "root_menu"
              ? "Корневой пункт"
              : "Подпункт";
        const placementLabel =
          menu.placement === "top"
            ? "главное меню"
            : menu.placement === "settings"
              ? "Настройки"
              : (menu.placement ?? "—");

        lines.push(`### ${menu.label ?? menu.id}`);
        lines.push("");
        lines.push(`- **Тип:** ${typeLabel}`);
        lines.push(`- **Route:** \`${menu.route}\``);
        lines.push(`- **Размещение:** ${placementLabel}`);
        if ((menu as any).view) {
          lines.push(`- **Представление:** \`${(menu as any).view}\``);
        }
        lines.push("");

        if (menu.items && menu.items.length > 0) {
          lines.push("**Подпункты:**");
          lines.push("");
          for (const item of menu.items) {
            lines.push(
              `- \`${item.route}\` — ${item.label ?? item.id} → \`${(item as any).view ?? "—"}\``,
            );
          }
          lines.push("");
        }
      }
    }
  }

  // --- Диаграмма связей (ASCII) ---
  if (opts.includeDiagram) {
    lines.push("## Диаграмма связей");
    lines.push("");
    lines.push("```");
    lines.push(buildAsciiDiagram(domain, table));
    lines.push("```");
    lines.push("");
  }

  // --- Кросс-доменные ссылки ---
  if (opts.includeCrossRefs) {
    const crossRefs = collectCrossDomainRefs(domain, opts.allDomains ?? []);
    if (crossRefs.length > 0) {
      lines.push("## Кросс-доменные ссылки");
      lines.push("");
      lines.push("Этот домен ссылается на сущности и типы из других доменов:");
      lines.push("");
      lines.push("| Откуда | Ссылается на | Домен |");
      lines.push("|---|---|---|");

      for (const r of crossRefs) {
        lines.push(`| ${r.from} | \`${r.ref}\` | \`${r.targetDomain}\` |`);
      }
      lines.push("");
    }

    // Входящие ссылки, если загружены другие домены
    const incoming = collectIncomingCrossRefs(domain, opts.allDomains ?? []);
    if (incoming.length > 0) {
      lines.push("### Входящие ссылки");
      lines.push("");
      lines.push("На этот домен ссылаются другие загруженные домены:");
      lines.push("");
      lines.push("| Из домена | Что ссылается | На что |");
      lines.push("|---|---|---|");

      for (const r of incoming) {
        lines.push(`| \`${r.fromDomain}\` | ${r.from} | \`${r.ref}\` |`);
      }
      lines.push("");
    }
  }

  // --- Footer ---
  lines.push("---");
  lines.push("");
  lines.push(`_Отчёт создан: ${new Date().toISOString()}_`);

  // --- Оглавление ---
  if (opts.includeToc) {
    const body = lines.join("\n");
    const toc = generateTableOfContents(body);
    if (toc) {
      // Вставляем после первой строки (# Заголовок)
      const [firstLine, ...rest] = lines;
      return [firstLine, "", toc, ...rest].join("\n");
    }
  }

  return lines.join("\n");
}

// =========================================================================
// Helpers
// =========================================================================

function collectAttrFlags(attr: Attribute): string {
  const flags: string[] = [];
  if (attr.readonly) flags.push("`readonly`");
  for (const c of attr.constraints ?? []) {
    switch (c.kind) {
      case "required":
        flags.push("`required`");
        break;
      case "unique":
        flags.push("`unique`");
        break;
      case "range":
        flags.push(`\`range: ${c.min ?? "−∞"}…${c.max ?? "+∞"}\``);
        break;
      case "length":
        flags.push(`\`length: ${c.min ?? "0"}…${c.max ?? "∞"}\``);
        break;
      case "regexp":
        flags.push(`\`regexp\``);
        break;
      case "mime_types":
        flags.push(`\`mime: ${(c.mimeTypes ?? []).join(", ")}\``);
        break;
      case "size":
        flags.push(`\`size: ${c.min ?? ""}…${c.max ?? ""}\``);
        break;
      default:
        flags.push(`\`${c.kind}\``);
    }
  }
  return flags.join(", ");
}

function formatType(attr: Attribute): string {
  if (attr.dataType === "Array" && attr.item) {
    const itemType = attr.item.entity
      ? `Reference(${shortRef(attr.item.entity)})`
      : attr.item.dataType;
    return `\`Array<${itemType}>\``;
  }
  if (attr.dataType === "Reference" && attr.entity) {
    return `\`Reference(${shortRef(attr.entity)})\``;
  }
  return `\`${attr.dataType}\``;
}

function shortRef(ref: string): string {
  const slash = ref.indexOf("/");
  return slash === -1 ? ref : ref.slice(slash + 1);
}

function extractCondition(condition: unknown): string {
  if (condition === true) return "";
  if (typeof condition === "string") {
    return condition.replace(/^!rql\s*/i, "").trim();
  }
  if (condition && typeof condition === "object") {
    const c = condition as any;
    if (typeof c.value === "string") return c.value.trim();
  }
  return "";
}

/**
 * Рисует простую ASCII-диаграмму связей домена.
 *
 * Формат:
 *   Incident ──[N:N]── Asset
 *   Incident ──[1:N]── Task
 */
function buildAsciiDiagram(domain: DomainSchema, table: SymbolTable): string {
  const lines: string[] = [];
  const entityIds = new Set((domain.entities ?? []).map((e) => e.id));

  lines.push(`Домен: ${domain.id}`);
  lines.push("");

  if (!domain.linkages?.length) {
    lines.push("(связей нет)");
    return lines.join("\n");
  }

  const maxIdLen = Math.max(...domain.linkages.map((l) => l.id.length));
  const maxSrcLen = Math.max(
    ...domain.linkages.map((l) => l.side1.split("/").pop()?.length ?? 0),
  );
  const maxTgtLen = Math.max(
    ...domain.linkages.map((l) => l.side2.split("/").pop()?.length ?? 0),
  );

  for (const linkage of domain.linkages) {
    const src = linkage.side1.split("/").pop() ?? linkage.side1;
    const tgt = linkage.side2.split("/").pop() ?? linkage.side2;
    const typeLabel =
      linkage.type === "1_1" ? "1:1" : linkage.type === "1_n" ? "1:N" : "N:N";
    const arrow = linkage.undirected ? "↔" : "→";
    const arrowLine = `──[${typeLabel}]${arrow}──`;

    const srcPad = " ".repeat(maxSrcLen - src.length);
    const tgtPad = " ".repeat(maxTgtLen - tgt.length);
    const idPad = " ".repeat(maxIdLen - linkage.id.length);

    lines.push(
      `${src}${srcPad} ${arrowLine} ${tgt}${tgtPad}   (${linkage.id}${idPad})`,
    );
  }

  return lines.join("\n");
}

// =========================================================================
// HTML-обёртка для Markdown
// =========================================================================

/**
 * Оборачивает markdown в простой HTML-шаблон с базовой подсветкой.
 * Использует минифицированный парсер markdown-it, если он установлен.
 * Если нет — возвращает <pre> с текстом.
 */

/**
 * Рендерит Markdown в HTML-документ с базовыми стилями.
 * Заголовки получают id для навигации по оглавлению.
 */
export function wrapMarkdownAsHtml(markdown: string, title: string): string {
  // Настраиваем marked: добавляем id заголовкам
  const renderer = new marked.Renderer();

  const slugifyForId = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");

  renderer.heading = ({ text, depth }) => {
    const id = slugifyForId(text);
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  const rawHtml = marked.parse(markdown, {
    renderer,
    gfm: true,
    breaks: false,
  }) as string;

  // Санитизация — оставляем только безопасные теги
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["id", "target"],
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "strong",
      "em",
      "del",
      "code",
      "pre",
      "ul",
      "ol",
      "li",
      "blockquote",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
      "span",
      "div",
    ],
  });

  // Помечаем inline-code с FQID
  const marked_html = safeHtml.replace(
    /<code>([a-z][\w.-]*\.[a-z]+\/[\w.-]+)<\/code>/gi,
    '<code class="cross-ref">$1</code>',
  );

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>${escapeHtmlTitle(title)}</title>
<style>
  html { scroll-behavior: smooth; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    max-width: 900px; margin: 40px auto; padding: 0 20px;
    color: #1f2937; line-height: 1.65;
  }
  h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; scroll-margin-top: 20px; }
  h2 { margin-top: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; color: #111827; scroll-margin-top: 20px; }
  h3 { margin-top: 24px; color: #374151; scroll-margin-top: 20px; }
  h4 { margin-top: 20px; color: #4b5563; }
  code {
    background: #f3f4f6; padding: 1px 6px; border-radius: 4px;
    font-size: 0.9em;
    font-family: "SF Mono", Monaco, Consolas, "Liberation Mono", monospace;
    color: #be185d;
  }
  pre {
    background: #1e293b; color: #e2e8f0;
    padding: 16px; border-radius: 8px;
    overflow-x: auto; font-size: 0.85em;
    line-height: 1.5;
  }
  pre code { background: transparent; color: inherit; padding: 0; }
  table {
    border-collapse: collapse; width: 100%;
    margin: 16px 0; font-size: 0.9em;
  }
  th, td {
    border: 1px solid #e5e7eb; padding: 8px 12px;
    text-align: left; vertical-align: top;
  }
  th { background: #f9fafb; font-weight: 600; }
  blockquote {
    border-left: 4px solid #d1d5db;
    padding-left: 16px; color: #6b7280;
    margin: 16px 0; font-style: italic;
  }
  ul, ol { padding-left: 24px; margin: 8px 0; }
  li { margin: 4px 0; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 32px 0; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code.cross-ref {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }
  @media print {
    body { margin: 0; max-width: none; padding: 20px; }
    h2 { page-break-after: avoid; }
    pre { white-space: pre-wrap; word-break: break-word; }
  }
</style>
</head>
<body>
${marked_html}
</body>
</html>`;
}

function escapeHtmlTitle(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// =========================================================================
// Кросс-доменные ссылки
// =========================================================================

interface CrossRef {
  from: string;
  ref: string;
  targetDomain: string;
}

function isExternalRef(ref: string, currentDomainId: string): boolean {
  if (!ref) return false;
  const slash = ref.indexOf("/");
  if (slash === -1) return false;
  return ref.slice(0, slash) !== currentDomainId;
}

function collectCrossDomainRefs(
  domain: DomainSchema,
  _allDomains: DomainSchema[],
): CrossRef[] {
  const refs: CrossRef[] = [];
  const currentDomainId = domain.id;

  const add = (from: string, ref: string) => {
    if (!isExternalRef(ref, currentDomainId)) return;
    refs.push({
      from,
      ref,
      targetDomain: ref.split("/")[0],
    });
  };

  // Наследование
  for (const entity of domain.entities ?? []) {
    if (entity.inherits) {
      add(`\`${entity.id}\` (inherits)`, entity.inherits);
    }
    for (const attr of entity.attributes ?? []) {
      if (attr.entity) {
        add(`\`${entity.id}.${attr.id}\``, attr.entity);
      }
      if (attr.item?.entity) {
        add(`\`${entity.id}.${attr.id}[]\``, attr.item.entity);
      }
    }
  }

  // Связи
  for (const linkage of domain.linkages ?? []) {
    add(`\`${linkage.id}\` (side1)`, linkage.side1);
    add(`\`${linkage.id}\` (side2)`, linkage.side2);
  }

  // Правила данных — ссылка на сущность
  for (const rule of domain.dataRules ?? []) {
    if (rule.entity) {
      add(`\`${rule.id}\` (rule.entity)`, rule.entity);
    }
  }

  return refs;
}

interface IncomingCrossRef {
  fromDomain: string;
  from: string;
  ref: string;
}

function collectIncomingCrossRefs(
  targetDomain: DomainSchema,
  allDomains: DomainSchema[],
): IncomingCrossRef[] {
  const incoming: IncomingCrossRef[] = [];
  const targetId = targetDomain.id;

  for (const other of allDomains) {
    if (other.id === targetId) continue;

    const push = (from: string, ref: string) => {
      if (!ref) return;
      const slash = ref.indexOf("/");
      if (slash === -1) return;
      if (ref.slice(0, slash) !== targetId) return;
      incoming.push({
        fromDomain: other.id,
        from,
        ref,
      });
    };

    for (const entity of other.entities ?? []) {
      if (entity.inherits) {
        push(`\`${entity.id}\` (inherits)`, entity.inherits);
      }
      for (const attr of entity.attributes ?? []) {
        if (attr.entity) push(`\`${entity.id}.${attr.id}\``, attr.entity);
        if (attr.item?.entity)
          push(`\`${entity.id}.${attr.id}[]\``, attr.item.entity);
      }
    }

    for (const linkage of other.linkages ?? []) {
      push(`\`${linkage.id}\` (side1)`, linkage.side1);
      push(`\`${linkage.id}\` (side2)`, linkage.side2);
    }
  }

  return incoming;
}

// =========================================================================
// Оглавление
// =========================================================================

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function generateTableOfContents(markdown: string): string {
  const headings: { level: number; text: string; anchor: string }[] = [];
  const used = new Map<string, number>();

  const lines = markdown.split("\n");
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();

    let anchor = slugify(text);
    // Разрешаем коллизии: два заголовка с одинаковым текстом
    const count = used.get(anchor) ?? 0;
    used.set(anchor, count + 1);
    if (count > 0) anchor = `${anchor}-${count}`;

    headings.push({ level, text, anchor });
  }

  if (headings.length === 0) return "";

  const toc = headings
    .map((h) => {
      const indent = "  ".repeat(h.level - 2);
      return `${indent}- [${h.text}](#${h.anchor})`;
    })
    .join("\n");

  return `## Содержание\n\n${toc}\n`;
}