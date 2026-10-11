import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor, { loader } from '@monaco-editor/react';
import YAML from 'yaml';
import { useSchemaStore } from '../store/useSchemaStore';
import { useYamlEditorStore } from '../store/useYamlEditorStore';
import { parseSchemaFiles } from '../schema/parse';
import { showToast } from './Toast';
import { IconCheck, IconDownload, IconSave, IconX } from './icons';
import type * as Monaco from 'monaco-editor';

// --- Регистрация языка YAML в Monaco --------------------------------

let yamlLangRegistered = false;

loader.init().then((monaco) => {
    if (yamlLangRegistered) return;
    yamlLangRegistered = true;

    if (monaco.languages.getLanguages().some((l: any) => l.id === 'yaml')) return;

    monaco.languages.register({ id: 'yaml' });

    monaco.languages.setMonarchTokensProvider('yaml', {
        tokenizer: {
            root: [
                // Комментарии
                [/#.*$/, 'comment'],
                // Теги !rql, !include и т.п.
                [/!\w+/, 'tag'],
                // Строки в кавычках
                [/"[^"]*"/, 'string'],
                [/'[^']*'/, 'string'],
                // Ключ: значение
                [/^(\s*)([a-zA-Z_][\w.-]*)(\s*:)/, ['', 'key', 'delimiter']],
                // Списки
                [/^\s*-\s/, 'delimiter'],
                // Числа
                [/\b\d+(\.\d+)?\b/, 'number'],
                // Булевы и null
                [/\b(true|false|null|yes|no)\b/, 'keyword'],
                // Прочие слова
                [/[a-zA-Z_][\w.-]*/, 'identifier'],
            ],
        },
    });

    monaco.languages.setLanguageConfiguration('yaml', {
        comments: { lineComment: '#' },
        brackets: [['[', ']'], ['{', '}']],
        autoClosingPairs: [
            { open: '"', close: '"' },
            { open: "'", close: "'" },
            { open: '[', close: ']' },
            { open: '{', close: '}' },
        ],
    });
});

// --- Компонент ------------------------------------------------------

export function YamlEditorModal() {
    const openFileName = useYamlEditorStore(s => s.openFileName);
    const closeFile = useYamlEditorStore(s => s.closeFile);
    const rawFiles = useSchemaStore(s => s.rawFiles);
    const loadFiles = useSchemaStore(s => s.loadFiles);

    const originalContent = useMemo(() => {
        if (!openFileName) return '';
        return rawFiles.find(f => f.name === openFileName)?.content ?? '';
    }, [openFileName, rawFiles]);

    const [draft, setDraft] = useState(originalContent);
    const editorRef = useRef<any>(null);

    // При открытии нового файла — сбрасываем черновик
    useEffect(() => {
        setDraft(originalContent);
    }, [originalContent, openFileName]);

    const isDirty = draft !== originalContent;

    // --- Диагностика ---
    const issues = useMemo(() => {
        if (!draft.trim()) return [];
        return analyzeYaml(draft);
    }, [draft]);

    const hasErrors = issues.some(i => i.severity === 'error');

    // --- Установка маркеров в Monaco ---
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const model = editor.getModel();
        if (!model) return;

        const markers = issues
            .filter(i => i.line && i.column)
            .map(i => ({
                severity:
                    i.severity === 'error'
                        ? 8 // MarkerSeverity.Error
                        : 4, // Warning
                message: i.message,
                startLineNumber: i.line!,
                startColumn: i.column!,
                endLineNumber: i.endLine ?? i.line!,
                endColumn: i.endColumn ?? (i.column! + 1),
            }));

        // Импортируем setModelMarkers через loader
        loader.init().then(monaco => {
            monaco.editor.setModelMarkers(model, 'yaml', markers);
        });
    }, [issues]);

    // --- Закрытие по Escape ---
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') tryClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    });

    // --- Действия ---

    const apply = () => {
        if (hasErrors) {
            showToast('Исправьте ошибки перед применением');
            return;
        }

        // Обновляем содержимое файла в store
        const next = rawFiles.map(f =>
            f.name === openFileName ? { ...f, content: draft } : f,
        );
        loadFiles(next);
        showToast('Файл применён');
    };

    const download = () => {
        if (!openFileName) return;
        const blob = new Blob([draft], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = openFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const tryClose = () => {
        if (isDirty) {
            const confirmed = window.confirm(
                'Есть несохранённые изменения. Закрыть без сохранения?',
            );
            if (!confirmed) return;
        }
        closeFile();
    };

    if (!openFileName) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 bg-white">
                <div className="flex items-center gap-3">
                    <div className="text-sm font-medium text-gray-900">
                        {openFileName}
                    </div>
                    {isDirty && (
                        <span className="text-xs text-amber-600">● не сохранено</span>
                    )}
                    {hasErrors && (
                        <span className="text-xs text-red-600">
                            ⛔ {issues.filter(i => i.severity === 'error').length} ошибок
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={download}
                        title="Скачать файл"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                        <IconDownload className="w-3.5 h-3.5" />
                        Скачать
                    </button>
                    <button
                        onClick={apply}
                        disabled={hasErrors}
                        title={
                            hasErrors
                                ? 'Исправьте ошибки перед применением'
                                : 'Применить изменения к схеме'
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        <IconCheck className="w-3.5 h-3.5" />
                        Применить
                    </button>
                    <button
                        onClick={tryClose}
                        title="Закрыть"
                        className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100"
                    >
                        <IconX />
                    </button>
                </div>
            </div>

            {/* Monaco + диагностика снизу */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0">
                    <Editor
                        height="100%"
                        defaultLanguage="yaml"
                        value={draft}
                        onChange={v => setDraft(v ?? '')}
                        onMount={editor => {
                            editorRef.current = editor;
                        }}
                        options={{
                            fontSize: 13,
                            minimap: { enabled: true },
                            lineNumbers: 'on',
                            wordWrap: 'off',
                            tabSize: 2,
                            scrollBeyondLastLine: false,
                        }}
                    />
                </div>

                {issues.length > 0 && (
                    <div className="border-t border-gray-200 max-h-[180px] overflow-auto bg-gray-50">
                        <div className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200">
                            Проблемы ({issues.length})
                        </div>
                        <ul className="divide-y divide-gray-100">
                            {issues.map((issue, i) => (
                                <li
                                    key={i}
                                    className="px-4 py-1.5 flex items-start gap-2 text-xs hover:bg-white cursor-pointer"
                                    onClick={() => {
                                        const editor = editorRef.current;
                                        if (!editor || !issue.line) return;
                                        editor.revealLineInCenter(issue.line);
                                        editor.setPosition({
                                            lineNumber: issue.line,
                                            column: issue.column ?? 1,
                                        });
                                        editor.focus();
                                    }}
                                >
                                    <span
                                        className={
                                            issue.severity === 'error'
                                                ? 'text-red-600 shrink-0'
                                                : 'text-amber-600 shrink-0'
                                        }
                                    >
                                        {issue.severity === 'error' ? '⛔' : '⚠'}
                                    </span>
                                    <span className="text-gray-700 flex-1">
                                        {issue.message}
                                    </span>
                                    {issue.line && (
                                        <span className="text-gray-400 shrink-0 font-mono text-[10px]">
                                            {issue.line}:{issue.column ?? 1}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

// --- Анализ YAML -----------------------------------------------------

interface YamlIssue {
    severity: 'error' | 'warning';
    message: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
}

function analyzeYaml(text: string): YamlIssue[] {
    const issues: YamlIssue[] = [];

    // Фильтр: убираем предупреждения про наш кастомный тег !rql
    const isRqlTagWarning = (msg: string): boolean => {
        if (!msg) return false;
        const lower = msg.toLowerCase();
        return lower.includes('!rql') && lower.includes('unresolved tag');
    };

    // 1. Синтаксис YAML
    let doc: YAML.Document.Parsed | null = null;
    try {
        doc = YAML.parseDocument(text);
    } catch (e: any) {
        issues.push({
            severity: 'error',
            message: 'YAML не удалось разобрать: ' + (e.message ?? String(e)),
        });
        return issues;
    }

    // errors
    if (doc.errors && doc.errors.length > 0) {
        for (const err of doc.errors) {
            if (isRqlTagWarning(err.message)) continue;
            const pos = err.linePos?.[0];
            const endPos = err.linePos?.[1];
            issues.push({
                severity: 'error',
                message: err.message,
                line: pos?.line,
                column: pos?.col,
                endLine: endPos?.line,
                endColumn: endPos?.col,
            });
        }
    }

    // warnings
    if (doc.warnings && doc.warnings.length > 0) {
        for (const w of doc.warnings) {
            if (isRqlTagWarning(w.message)) continue;
            const pos = w.linePos?.[0];
            issues.push({
                severity: 'warning',
                message: w.message,
                line: pos?.line,
                column: pos?.col,
            });
        }
    }

    // 2. Валидация схемы — только если нет реальных error'ов
    const realErrors = issues.filter(i => i.severity === 'error').length;
    if (realErrors === 0) {
        try {
            const { errors } = parseSchemaFiles([{ name: 'inline', content: text }]);
            for (const e of errors) {
                if (isRqlTagWarning(e.message)) continue;
                issues.push({
                    severity: 'error',
                    message: e.message,
                });
            }
        } catch (e: any) {
            issues.push({
                severity: 'error',
                message: 'Ошибка валидации: ' + (e.message ?? String(e)),
            });
        }
    }

    return issues;
}