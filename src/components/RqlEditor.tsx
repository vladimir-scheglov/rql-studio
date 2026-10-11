import { useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { useEditorStore } from '../store/useEditorStore';
import { useConstructorUiStore } from '../store/useConstructorUiStore';
import { useSchemaStore } from '../store/useSchemaStore';
import { registerRqlCompletion } from '../rql/completion/provider';
import { registerRqlDiagnostics } from '../rql/parser/diagnostics';
import { registerRqlHover } from '../rql/parser/hover';
import { registerRqlSnippets } from '../rql/completion/snippets-provider';
import { registerRqlCodeActions } from '../rql/parser/code-actions';
import { formatRql } from '../rql/parser/formatter';
import type { CodeToken } from '../store/useConstructorUiStore';
import type * as Monaco from 'monaco-editor';

// --- Регистрация языка и провайдеров — один раз на весь модуль ---

let setupDone = false;

loader.init().then((monaco) => {
    if (setupDone) return;
    setupDone = true;

    monaco.languages.register({ id: 'rql' });

    monaco.languages.setMonarchTokensProvider('rql', {
        keywords: [
            'SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'JOIN',
            'INNER', 'LEFT', 'RIGHT', 'FULL', 'ON', 'AS', 'AND', 'OR', 'NOT',
            'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'ASC', 'DESC', 'WITH', 'FILL',
        ],
        tokenizer: {
            root: [
                [/!rql/, 'keyword.directive'],
                [/@\w+(\.\w+)*/, 'variable.alias'],
                [/'([^']|'')*'/, 'string'],
                [/\b\d+(\.\d+)?\b/, 'number'],
                [/[A-Z_][A-Z0-9_]*/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                }],
                [/[a-z_][a-z0-9_]*/, 'identifier'],
                [/[().,=<>!+\-*/]/, 'operator'],
            ],
        },
    });

    monaco.languages.setLanguageConfiguration('rql', {
        brackets: [['(', ')']],
        autoClosingPairs: [
            { open: '(', close: ')' },
            { open: "'", close: "'" },
        ],
    });

    registerRqlCompletion(monaco);
    registerRqlDiagnostics(monaco);
    registerRqlHover(monaco);
    registerRqlSnippets(monaco);
    registerRqlCodeActions(monaco);

    monaco.languages.registerDocumentFormattingEditProvider('rql', {
        provideDocumentFormattingEdits(model: Monaco.editor.ITextModel) {
            const text = model.getValue();
            const formatted = formatRql(text);
            return [{ range: model.getFullModelRange(), text: formatted }];
        },
    });
});

// --- Компонент -------------------------------------------------------

export function RqlEditor() {
    const value = useEditorStore(s => s.value);
    const setValue = useEditorStore(s => s.setValue);

    const usageResults = useConstructorUiStore(s => s.usageResults);
    const usageActiveIndex = useConstructorUiStore(s => s.usageActiveIndex);
    const selectCodeToken = useConstructorUiStore(s => s.selectCodeToken);

    const editorRef = useRef<any>(null);

    // Синхронизация внешнего value → Monaco
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if (editor.getValue() !== value) {
            editor.setValue(value);
        }
    }, [value]);

    // Навигация по активному вхождению
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if (usageActiveIndex < 0) return;

        const usage = usageResults[usageActiveIndex];
        if (!usage) return;

        const position = { lineNumber: usage.line, column: usage.column };
        editor.revealPositionInCenter(position);
        editor.setPosition(position);

        const endColumn = usage.column + usage.matchedText.length;
        editor.setSelection({
            startLineNumber: usage.line,
            startColumn: usage.column,
            endLineNumber: usage.line,
            endColumn,
        });

        editor.focus();
    }, [usageActiveIndex, usageResults]);

    // Обработка клика: определяем, по какому токену кликнули
    const handleMouseDown = (e: React.MouseEvent) => {
        const editor = editorRef.current;
        if (!editor) return;

        const target = editor.getTargetAtClientPoint(e.clientX, e.clientY);
        if (!target?.position) {
            selectCodeToken(null);
            return;
        }

        const model = editor.getModel();
        if (!model) return;

        const position = target.position;
        const word = model.getWordAtPosition(position);
        if (!word) {
            selectCodeToken(null);
            return;
        }

        const lineContent = model.getLineContent(position.lineNumber);
        const charBefore = lineContent[word.startColumn - 2] ?? '';

        const table = useSchemaStore.getState().symbolTable;
        const context = useEditorStore.getState().context;
        const entityFqid = 'entityFqid' in context ? context.entityFqid ?? '' : '';

        const token = inferTokenFromClick(
            position,
            word,
            charBefore,
            lineContent,
            { table, entityFqid },
        );

        selectCodeToken(token);
    };

    return (
        <div className="h-full" onMouseDown={handleMouseDown}>
            <Editor
                height="100%"
                defaultLanguage="rql"
                value={value}
                onChange={v => setValue(v ?? '')}
                onMount={editor => {
                    editorRef.current = editor;
                    // При монтировании сразу подставляем актуальное значение
                    if (editor.getValue() !== value) {
                        editor.setValue(value);
                    }
                }}
                options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: true,
                    lightbulb: { enabled: 'on' as Monaco.editor.ShowLightbulbIconMode },
                }}
            />
        </div>
    );
}

// --- Определение токена по клику -------------------------------------

const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL',
    'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'AS',
    'AND', 'OR', 'NOT', 'IN', 'IS', 'LIKE', 'BETWEEN', 'ASC', 'DESC',
]);

interface InferCtx {
    table: ReturnType<typeof useSchemaStore.getState>['symbolTable'];
    entityFqid: string;
}

function inferTokenFromClick(
    position: any,
    word: { word: string; startColumn: number; endColumn: number },
    charBefore: string,
    lineContent: string,
    ctx: InferCtx,
): CodeToken | null {
    // 1. @-псевдоним
    if (charBefore === '@') {
        return { alias: '@' + word.word };
    }

    // 2. @xxx.attr
    const beforeWord = lineContent.slice(0, word.startColumn - 1);
    const dotMatch = beforeWord.match(/@([\w.]+)\.$/);
    if (dotMatch) {
        return { alias: '@' + dotMatch[1], attribute: word.word };
    }

    // 3. SQL-ключевое слово
    const upper = word.word.toUpperCase();
    if (SQL_KEYWORDS.has(upper)) {
        return { functionName: upper };
    }

    // 4. Функция — имя с последующей (
    const afterWord = lineContent.slice(word.endColumn - 1);
    if (/^\s*\(/.test(afterWord)) {
        return { functionName: word.word };
    }

    // 5. Голый атрибут текущей сущности
    if (ctx.table && ctx.entityFqid) {
        const entity = ctx.table.entities.get(ctx.entityFqid);
        if (entity?.attributes.has(word.word)) {
            return { alias: '@doc', attribute: word.word };
        }
    }

    return null;
}