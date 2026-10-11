import * as monaco from "monaco-editor";
import { useSchemaStore } from "../../store/useSchemaStore";
import { useEditorStore } from "../../store/useEditorStore";
import { RQL_FUNCTIONS } from "../functions";
import { SYSTEM_ALIASES } from "../aliases";
import { detectContext } from "./context";
import { resolveDataType } from "../../schema/resolve-data-type";
import { scanAliases } from "./scan-aliases";
import { resolveEntityFqid } from "../../schema/symbol-table";
import { SYSTEM_LINKAGE_ATTRIBUTES } from "../../schema/system-attributes";

export function registerRqlCompletion(monacoInstance: typeof monaco) {
  return monacoInstance.languages.registerCompletionItemProvider("rql", {
    triggerCharacters: ["@", ".", "(", " "],

    provideCompletionItems(model, position) {
      try {
        return provide(model, position, monacoInstance);
      } catch (e) {
        // Не роняем редактор молчаливой ошибкой — покажем в консоли
        // eslint-disable-next-line no-console
        console.error("[rql-completion] error:", e);
        return { suggestions: [] };
      }
    },
  });
}

function provide(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  monacoInstance: typeof monaco,
): monaco.languages.CompletionList {
  const textBefore = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const ctx = detectContext(textBefore);
  const schemaStore = useSchemaStore.getState();
  const symbolTable = schemaStore.symbolTable;

  if (!symbolTable) return { suggestions: [] };

  const suggestions: monaco.languages.CompletionItem[] = [];

  // Сканируем псевдонимы из текста до курсора
  const scannedAliases = scanAliases(
    textBefore,
    symbolTable,
    schemaStore.activeDomainId ?? "",
  );
  const aliasesMap = new Map(scannedAliases.map((a) => [a.alias, a]));

  // --- Контекст: после @ или @xxx ---
  if (ctx.type === "after-at") {
    const lineText = model.getLineContent(position.lineNumber);
    const textBeforeCursor = lineText.slice(0, position.column - 1);
    const atIdx = textBeforeCursor.lastIndexOf("@");

    if (atIdx === -1) return { suggestions: [] };

    // @ находится в column atIdx+1 (Monaco 1-based).
    // Начинаем range сразу после @, то есть с atIdx+2.
    const startColumn = atIdx + 2;
    const endColumn = position.column;

    const range: monaco.IRange = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn,
      endColumn: Math.max(startColumn, endColumn),
    };

    for (const alias of SYSTEM_ALIASES) {
      const insert = alias.name.slice(1);
      suggestions.push({
        label: alias.name,
        filterText: insert,
        kind: monacoInstance.languages.CompletionItemKind.Variable,
        detail: alias.description,
        insertText: insert,
        range,
      });
    }

    const currentDomain = schemaStore.activeDomainId ?? "";
    const entities = symbolTable.entitiesByDomain.get(currentDomain) ?? [];
    for (const e of entities) {
      const insert = e.entity.id;
      suggestions.push({
        label: `@${insert}`,
        filterText: insert,
        kind: monacoInstance.languages.CompletionItemKind.Class,
        detail: e.entity.name ?? insert,
        insertText: insert,
        range,
      });
    }

    return { suggestions };
  }

  // --- @link_X.<attr> — атрибуты связи ---
  if (ctx.type === "after-linkage-dot") {
    const alias = `@${ctx.linkageFqid}`;
    const declared = aliasesMap.get(alias);
    if (!declared || declared.kind !== "linkage" || !declared.linkageFqid) {
      return { suggestions: [] };
    }

    const linkage = symbolTable.linkages.get(declared.linkageFqid);
    if (!linkage) return { suggestions: [] };

    const word = model.getWordUntilPosition(position);
    const range: monaco.IRange = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    // Системные атрибуты связи
    for (const sys of SYSTEM_LINKAGE_ATTRIBUTES) {
      suggestions.push({
        label: sys.id,
        kind: monacoInstance.languages.CompletionItemKind.Field,
        detail: `${sys.name ?? sys.id} · ${sys.dataType}`,
        insertText: sys.id,
        range,
      });
    }

    // Собственные атрибуты связи
    for (const attr of linkage.attributes ?? []) {
      suggestions.push({
        label: attr.id,
        kind: monacoInstance.languages.CompletionItemKind.Field,
        detail: `${attr.name ?? attr.id} · ${attr.dataType}`,
        insertText: attr.id,
        range,
      });
    }

    return { suggestions };
  }

  // --- @e_X.<attr> — атрибуты связанной сущности ---
  if (ctx.type === "after-e-dot") {
    const alias = `@${ctx.entityFqid}`;
    const declared = aliasesMap.get(alias);
    if (!declared || declared.kind !== "entity" || !declared.entityFqid) {
      return { suggestions: [] };
    }

    const entity = symbolTable.entities.get(declared.entityFqid);
    if (!entity) return { suggestions: [] };

    const word = model.getWordUntilPosition(position);
    const range: monaco.IRange = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    for (const attr of entity.attributes.values()) {
      suggestions.push({
        label: attr.id,
        kind: monacoInstance.languages.CompletionItemKind.Field,
        detail: `${attr.name ?? attr.id} · ${attr.dataType}`,
        insertText: attr.id,
        range,
      });
    }

    return { suggestions };
  }

  // --- Обычный word-range для остальных контекстов ---
  const word = model.getWordUntilPosition(position);
  const range: monaco.IRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };

  // --- Контекст: после @doc. или @entity. ---
  if (ctx.type === "after-doc-dot" || ctx.type === "after-entity-dot") {
    const entityFqid =
      ctx.type === "after-doc-dot"
        ? ctx.entityFqid
        : resolveEntityFromAlias(ctx.entityFqid, symbolTable);

    if (!entityFqid) return { suggestions: [] };
    const resolved = symbolTable.entities.get(entityFqid);
    if (!resolved) return { suggestions: [] };

    for (const attr of resolved.attributes.values()) {
      suggestions.push({
        label: attr.id,
        kind: monacoInstance.languages.CompletionItemKind.Field,
        detail: `${attr.name ?? attr.id} · ${attr.dataType}`,
        insertText: attr.id,
        range,
      });
    }
    return { suggestions };
  }

  // --- Контекст: после = (значения перечисления) ---
  if (ctx.type === "after-equals") {
    const attributeRef = ctx.attributeRef;
    // Определяем, к какой сущности относится ссылка
    let entityFqid: string | undefined;
    let attributeId: string | undefined;

    if (attributeRef.startsWith("@doc.")) {
      attributeId = attributeRef.slice(5);
      const editorCtx = useEditorStore.getState().context;
      entityFqid = "entityFqid" in editorCtx ? editorCtx.entityFqid : undefined;
    } else if (attributeRef.startsWith("@")) {
      // @Entity.attr или @alias.attr — пока не поддерживаем
      return { suggestions: [] };
    } else {
      // Просто attr — берём сущность из контекста
      attributeId = attributeRef;
      const editorCtx = useEditorStore.getState().context;
      entityFqid = "entityFqid" in editorCtx ? editorCtx.entityFqid : undefined;
    }

    if (!entityFqid || !attributeId) return { suggestions: [] };
    const entity = symbolTable.entities.get(entityFqid);
    const attr = entity?.attributes.get(attributeId);
    if (!attr) return { suggestions: [] };

    // Резолвим тип — если Enum/Workflow, подсказываем значения
    const domain = schemaStore.activeDomainId ?? "";
    const resolved = resolveDataType(attr.dataType, domain, symbolTable);

    if (resolved.kind === "Enum" || resolved.kind === "Workflow") {
      const values = resolved.values ?? [];
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      for (const v of values) {
        suggestions.push({
          label: v.name ?? v.id,
          filterText: v.id,
          kind: monacoInstance.languages.CompletionItemKind.EnumMember,
          detail: v.id,
          insertText: `@${attr.dataType}.${v.id}`,
          range,
        });
      }
      return { suggestions };
    }

    // Для других типов — общий набор (функции, псевдонимы) не помешает
    // Но пока просто ничего не предлагаем
    return { suggestions: [] };
  }

  // --- Общий контекст: функции + системные псевдонимы ---
  if (ctx.type === "root" || ctx.type === "argument") {
    for (const fn of RQL_FUNCTIONS) {
      suggestions.push({
        label: fn.name,
        kind: monacoInstance.languages.CompletionItemKind.Function,
        detail: fn.signature,
        documentation:
          fn.description + (fn.example ? `\n\nПример: ${fn.example}` : ""),
        insertText: fn.name + "(",
        range,
      });
    }
    for (const alias of SYSTEM_ALIASES) {
      suggestions.push({
        label: alias.name,
        kind: monacoInstance.languages.CompletionItemKind.Variable,
        detail: alias.description,
        insertText: alias.name,
        range,
      });
    }
  }

  return { suggestions };
}

// --- helpers -------------------------------------------------------------

function resolveEntityFromAlias(alias: string, table: any): string | undefined {
  const { activeDomainId } = useSchemaStore.getState();
  if (!activeDomainId) return undefined;
  const candidates = table.entitiesByDomain.get(activeDomainId) ?? [];
  const found = candidates.find((e: any) => e.entity.id === alias);
  return found?.fqid;
}

function resolveEnumValues(dataType: string, entityFqid: string, table: any) {
  if (table.enums.has(dataType)) return table.enums.get(dataType);
  const domain = entityFqid.split("/")[0];
  const localFqid = `${domain}/${dataType}`;
  if (table.enums.has(localFqid)) return table.enums.get(localFqid);
  return undefined;
}
