import * as monaco from "monaco-editor";
import { parseRql } from "./index";
import { resolveAst } from "../semantics/resolver";
import { useSchemaStore } from "../../store/useSchemaStore";
import { useEditorStore } from "../../store/useEditorStore";
import { setQuickFixesForModel } from "./code-actions";
import { isIncompleteInput } from "./incomplete-input";

export function registerRqlDiagnostics(monacoInstance: typeof monaco) {
  const modelToDisposable = new Map<string, monaco.IDisposable>();

  const updateDiagnostics = (model: monaco.editor.ITextModel) => {
    try {
      const text = model.getValue();
      if (isIncompleteInput(text)) {
        monacoInstance.editor.setModelMarkers(model, "rql", []);
        return;
      }
      const { ast, lexErrors, parseErrors } = parseRql(text);

      const markers: monaco.editor.IMarkerData[] = [];

      if (model.getLanguageId() !== "rql") {
        monacoInstance.editor.setModelMarkers(model, "rql", []);
        return;
      }

      // 1. Лексические ошибки
      for (const e of lexErrors) {
        markers.push({
          severity: monacoInstance.MarkerSeverity.Error,
          message: `Лексическая ошибка: ${e.message}`,
          startLineNumber: e.line ?? 1,
          startColumn: e.column ?? 1,
          endLineNumber: e.line ?? 1,
          endColumn: (e.column ?? 1) + 1,
        });
      }

      // 2. Синтаксические ошибки
      for (const e of parseErrors) {
        const tok = e.token;
        const len = tok?.image?.length ?? 1;
        markers.push({
          severity: monacoInstance.MarkerSeverity.Error,
          message: e.message,
          startLineNumber: tok?.startLine ?? 1,
          startColumn: tok?.startColumn ?? 1,
          endLineNumber: tok?.endLine ?? 1,
          endColumn: (tok?.startColumn ?? 1) + len,
        });
      }

      // 3. Семантические ошибки
      if (ast) {
        const schemaStore = useSchemaStore.getState();
        const editorStore = useEditorStore.getState();
        const symbolTable = schemaStore.symbolTable;

        if (symbolTable) {
          const entityFqid =
            "entityFqid" in editorStore.context &&
            editorStore.context.entityFqid
              ? editorStore.context.entityFqid
              : "";

          const diagnostics = resolveAst(ast, {
            symbolTable,
            entityFqid,
            domain: schemaStore.activeDomainId ?? "",
          });
          setQuickFixesForModel(model, diagnostics);

          for (const d of diagnostics) {
            markers.push({
              severity:
                d.severity === "error"
                  ? monacoInstance.MarkerSeverity.Error
                  : d.severity === "warning"
                    ? monacoInstance.MarkerSeverity.Warning
                    : monacoInstance.MarkerSeverity.Info,
              message: d.message,
              startLineNumber: d.startLine,
              startColumn: d.startColumn,
              endLineNumber: d.endLine,
              endColumn: d.endColumn,
            });
          }
        }
      }

      monacoInstance.editor.setModelMarkers(model, "rql", markers);
    } catch (e) {
      console.error("[rql-diagnostics] error:", e);
      // Гарантированно очищаем маркеры при любой ошибке
      monacoInstance.editor.setModelMarkers(model, "rql", []);
    }
  };

  monacoInstance.editor.onDidCreateModel((model) => {
    updateDiagnostics(model);
    const sub = model.onDidChangeContent(() => updateDiagnostics(model));
    modelToDisposable.set(model.uri.toString(), sub);
  });

  monacoInstance.editor.onWillDisposeModel((model) => {
    modelToDisposable.get(model.uri.toString())?.dispose();
    modelToDisposable.delete(model.uri.toString());
  });

  monacoInstance.editor.onDidCreateModel((model) => {
    if (model.getLanguageId() !== "rql") return;
    updateDiagnostics(model);
    const sub = model.onDidChangeContent(() => updateDiagnostics(model));
    modelToDisposable.set(model.uri.toString(), sub);
  });
}