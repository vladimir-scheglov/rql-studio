import * as monaco from "monaco-editor";
import { RQL_FUNCTIONS } from "../functions";
import { SYSTEM_ALIASES } from "../aliases";
import { useSchemaStore } from "../../store/useSchemaStore";
import { useEditorStore } from "../../store/useEditorStore";
import { scanAliases, type ScannedAlias } from "../completion/scan-aliases";
import { SYSTEM_LINKAGE_ATTRIBUTES } from "../../schema/system-attributes";

/** Описания системных псевдонимов для hover */
export const SYSTEM_ALIAS_DESCRIPTIONS: Record<string, string> = {
  "@doc":
    "Текущий объект (экземпляр сущности). Через него доступны атрибуты и связи.",
  "@row":
    "Текущая строка таблицы. Доступна внутри правил данных для атрибутов типа Table.",
  "@index":
    "Индекс текущего элемента массива или строки таблицы. Нумерация с 0.",
  "@CurrentUser": "Текущий аутентифицированный пользователь.",
  "@CurrentUser.id": "ID текущего пользователя.",
  "@CurrentUser.username": "Имя текущего пользователя.",
  "@CurrentDate": "Текущая дата.",
  "@CurrentTime": "Текущее время.",
  "@CurrentTimestamp": "Текущая дата и время.",
  "@CurrentDateTime": "Синоним @CurrentTimestamp.",
  "@CurrentDayOfWeek":
    "Название текущего дня недели на английском (monday, tuesday, ...).",
};

export function registerRqlHover(monacoInstance: typeof monaco) {
  return monacoInstance.languages.registerHoverProvider("rql", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const lineContent = model.getLineContent(position.lineNumber);
      const beforeWord = lineContent.slice(0, word.startColumn - 1);
      const beforeTrimmed = beforeWord.replace(/\s+$/, "");
      const charBefore = beforeTrimmed[beforeTrimmed.length - 1] ?? "";

      // --- Случай 1: @-псевдоним ---
      if (charBefore === "@") {
        const aliasText = "@" + word.word;
        const hover = buildAliasHover(
          monacoInstance,
          model,
          position,
          word,
          aliasText,
        );
        if (hover) return hover;
      }

      // --- Случай 2: поле после @xxx. ---
      // Ищем что-то вида @xxx.field до курсора
      const attrHover = buildAttributeHover(
        monacoInstance,
        model,
        position,
        word,
      );
      if (attrHover) return attrHover;

      // --- Случай 3: функция ---
      const fn = RQL_FUNCTIONS.find(
        (f) => f.name.toUpperCase() === word.word.toUpperCase(),
      );
      if (fn) {
        return {
          range: new monacoInstance.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          ),
          contents: [
            { value: `**${fn.signature}**` },
            { value: fn.description },
            ...(fn.example
              ? [{ value: "```rql\n" + fn.example + "\n```" }]
              : []),
          ],
        };
      }

      // --- Случай 4: системный псевдоним без @ (для случая, когда слово начинается с @) ---
      const alias = SYSTEM_ALIASES.find(
        (a) => a.name.toUpperCase() === ("@" + word.word).toUpperCase(),
      );
      if (alias) {
        return {
          range: new monacoInstance.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          ),
          contents: [
            { value: `**${alias.signature}**` },
            { value: alias.description },
          ],
        };
      }

      return null;
    },
  });
}

// --- @-псевдонимы --------------------------------------------------------

function buildAliasHover(
  monacoInstance: typeof monaco,
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  word: monaco.editor.IWordAtPosition,
  aliasText: string,
): monaco.languages.Hover | null {
  const range = new monacoInstance.Range(
    position.lineNumber,
    word.startColumn - 1, // включаем @
    position.lineNumber,
    word.endColumn,
  );

  // 1. Системные
  const sysDesc = SYSTEM_ALIAS_DESCRIPTIONS[aliasText];
  if (sysDesc) {
    return {
      range,
      contents: [{ value: `**${aliasText}**` }, { value: sysDesc }],
    };
  }

  // 2. Объявленные во FROM/JOIN
  const schemaStore = useSchemaStore.getState();
  const table = schemaStore.symbolTable;
  const domain = schemaStore.activeDomainId ?? "";
  if (!table) return null;

  const aliases = scanAliases(model.getValue(), table, domain);
  const declared = aliases.find((a) => a.alias === aliasText);
  if (declared) {
    return buildScannedAliasHover(monacoInstance, range, declared, table);
  }

  // 3. @enumX.Y / @workflowX.Y
  if (
    word.word &&
    !word.word.startsWith("e_") &&
    !word.word.startsWith("link_")
  ) {
    const localFqid = `${domain}/${word.word}`;
    const enumValues = table.enums.get(localFqid) ?? table.enums.get(word.word);
    if (enumValues) {
      return {
        range,
        contents: [
          { value: `**@${word.word}** — перечисление` },
          { value: `Значений: ${enumValues.length}` },
        ],
      };
    }
    const workflowValues =
      table.workflows.get(localFqid) ?? table.workflows.get(word.word);
    if (workflowValues) {
      return {
        range,
        contents: [
          { value: `**@${word.word}** — workflow` },
          { value: `Статусов: ${workflowValues.length}` },
        ],
      };
    }
  }

  return null;
}

function buildScannedAliasHover(
  monacoInstance: typeof monaco,
  range: monaco.IRange,
  declared: ScannedAlias,
  table: ReturnType<typeof useSchemaStore.getState>["symbolTable"],
): monaco.languages.Hover | null {
  if (!table) return null;

  if (declared.kind === "linkage" && declared.linkageFqid) {
    const linkage = table.linkages.get(declared.linkageFqid);
    if (!linkage) {
      return {
        range,
        contents: [
          {
            value: `**${declared.alias}** — связь \`${declared.linkageFqid}\``,
          },
        ],
      };
    }

    const typeLabel =
      linkage.type === "1_1" ? "1-1" : linkage.type === "1_n" ? "1-N" : "N-N";
    const dir = linkage.undirected ? "ненаправленная" : "направленная";

    return {
      range,
      contents: [
        {
          value: `**${declared.alias}** — связь «${linkage.name ?? linkage.id}»`,
        },
        { value: `Направление: \`${linkage.side1}\` → \`${linkage.side2}\`` },
        { value: `Тип: ${typeLabel}, ${dir}` },
        { value: `FQID: \`${linkage.fqid}\`` },
      ],
    };
  }

  if (declared.kind === "entity" && declared.entityFqid) {
    const entity = table.entities.get(declared.entityFqid);
    const name = entity?.entity.name ?? declared.entityFqid;
    return {
      range,
      contents: [
        { value: `**${declared.alias}** — псевдоним сущности «${name}»` },
        { value: `FQID: \`${declared.entityFqid}\`` },
        { value: `Атрибутов: ${entity?.attributes.size ?? 0}` },
      ],
    };
  }

  return {
    range,
    contents: [{ value: `Псевдоним \`${declared.alias}\`` }],
  };
}

// --- Атрибуты после @xxx. -----------------------------------------------

function buildAttributeHover(
  monacoInstance: typeof monaco,
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  word: monaco.editor.IWordAtPosition,
): monaco.languages.Hover | null {
  const lineContent = model.getLineContent(position.lineNumber);
  const beforeWord = lineContent.slice(0, word.startColumn - 1);
  const dotMatch = beforeWord.match(/@([\w.]+)\.$/);
  if (!dotMatch) return null;

  const aliasHead = "@" + dotMatch[1]; // '@doc', '@e_Incident_Ioc', '@link_Incident_Ioc'
  const attrId = word.word;

  const schemaStore = useSchemaStore.getState();
  const table = schemaStore.symbolTable;
  const domain = schemaStore.activeDomainId ?? "";
  if (!table) return null;

  const range = new monacoInstance.Range(
    position.lineNumber,
    word.startColumn,
    position.lineNumber,
    word.endColumn,
  );

  // @doc.attr — атрибут текущей сущности
  if (aliasHead === "@doc") {
    const editorStore = useEditorStore.getState();
    const entityFqid =
      "entityFqid" in editorStore.context ? editorStore.context.entityFqid : "";
    if (!entityFqid) return null;
    const entity = table.entities.get(entityFqid);
    const attr = entity?.attributes.get(attrId);
    if (!attr) return null;
    return {
      range,
      contents: [
        { value: `**${attr.id}**${attr.name ? " — " + attr.name : ""}` },
        { value: `Тип: \`${attr.dataType}\`` },
        ...(attr.description ? [{ value: attr.description }] : []),
      ],
    };
  }

  // @e_X.attr или @link_X.attr — определяем по префиксу и scope
  const aliases = scanAliases(model.getValue(), table, domain);
  const declared = aliases.find((a) => a.alias === aliasHead);
  if (!declared) return null;

  if (declared.kind === "entity" && declared.entityFqid) {
    const entity = table.entities.get(declared.entityFqid);
    const attr = entity?.attributes.get(attrId);
    if (!attr) return null;
    return {
      range,
      contents: [
        { value: `**${attr.id}**${attr.name ? " — " + attr.name : ""}` },
        { value: `Сущность: «${entity?.entity.name ?? entity?.entity.id}»` },
        { value: `Тип: \`${attr.dataType}\`` },
      ],
    };
  }

  if (declared.kind === "linkage" && declared.linkageFqid) {
    const linkage = table.linkages.get(declared.linkageFqid);
    if (!linkage) return null;

    const own = linkage.attributes?.find((a) => a.id === attrId);
    const sys = SYSTEM_LINKAGE_ATTRIBUTES.find((a) => a.id === attrId);
    const found = own ?? sys;
    if (!found) return null;

    return {
      range,
      contents: [
        { value: `**${found.id}**${found.name ? " — " + found.name : ""}` },
        { value: `Атрибут связи «${linkage.name ?? linkage.id}»` },
        { value: `Тип: \`${found.dataType}\`` },
      ],
    };
  }

  return null;
}
