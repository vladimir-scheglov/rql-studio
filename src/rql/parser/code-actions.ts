import * as monaco from "monaco-editor";
import type { QuickFix, SemanticDiagnostic } from "../semantics/resolver";

interface StoredFix {
  message: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  startOffset: number;
  endOffset: number;
  fixes: QuickFix[];
}

const storage = new Map<string, StoredFix[]>();

export function setQuickFixesForModel(
  model: monaco.editor.ITextModel,
  diagnostics: SemanticDiagnostic[],
) {
  const items: StoredFix[] = diagnostics
    .filter((d) => d.quickFixes && d.quickFixes.length > 0)
    .map((d) => ({
      message: d.message,
      startLine: d.startLine,
      startColumn: d.startColumn,
      endLine: d.endLine,
      endColumn: d.endColumn,
      startOffset: d.startOffset,
      endOffset: d.endOffset,
      fixes: d.quickFixes!,
    }));
  storage.set(model.uri.toString(), items);
}

export function registerRqlCodeActions(monacoInstance: typeof monaco) {
  return monacoInstance.languages.registerCodeActionProvider("rql", {
    provideCodeActions(model, range, context) {
      const items = storage.get(model.uri.toString()) ?? [];

      // Преобразуем range в offset'ы
      const rangeStartOffset = model.getOffsetAt({
        lineNumber: range.startLineNumber,
        column: range.startColumn,
      });
      const rangeEndOffset = model.getOffsetAt({
        lineNumber: range.endLineNumber,
        column: range.endColumn,
      });

      const actions: monaco.languages.CodeAction[] = [];

      for (const item of items) {
        // Совпадает ли диагностика с текущим range?
        // Условие: курсор стоит внутри диапазона диагностики,
        // либо выделение пересекается с ним.
        const intersects =
          item.startOffset <= rangeEndOffset &&
          item.endOffset >= rangeStartOffset;
        if (!intersects) continue;

        for (const fix of item.fixes) {
          const startPos = model.getPositionAt(fix.startOffset);
          const endPos = model.getPositionAt(fix.endOffset);

          actions.push({
            title: fix.title,
            kind: "quickfix",
            diagnostics: context.markers,
            isPreferred: true,
            edit: {
              edits: [
                {
                  resource: model.uri,
                  versionId: model.getVersionId(),
                  textEdit: {
                    range: new monacoInstance.Range(
                      startPos.lineNumber,
                      startPos.column,
                      endPos.lineNumber,
                      endPos.column,
                    ),
                    text: fix.replacement,
                  },
                },
              ],
            },
          });
        }
      }

      return { actions, dispose: () => {} };
    },
  });
}
