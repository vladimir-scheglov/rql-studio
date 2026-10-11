import * as monaco from "monaco-editor";
import { RQL_SNIPPETS } from "../snippets";

export function registerRqlSnippets(monacoInstance: typeof monaco) {
  return monacoInstance.languages.registerCompletionItemProvider("rql", {
    // Не триггерим по символам — сниппеты появляются только при явном вводе префикса
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = RQL_SNIPPETS.map((sn) => ({
        label: {
          label: sn.prefix,
          description: sn.label,
          detail: ` [${sn.category}]`,
        },
        kind: monacoInstance.languages.CompletionItemKind.Snippet,
        detail: sn.description,
        documentation: {
          value: `**${sn.label}**\n\n${sn.description}\n\n\`\`\`rql\n${sn.body.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d+/g, "")}\n\`\`\``,
        },
        insertText: sn.body,
        insertTextRules:
          monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: "z_" + sn.prefix, // сниппеты идут после функций и полей
      }));

      return { suggestions };
    },
  });
}
