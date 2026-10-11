import { useCallback, useRef, useState } from 'react';
import { useSchemaStore } from '../store/useSchemaStore';
import { IconFileText, IconPlus2, IconX } from './icons';
import { useYamlEditorStore } from '../store/useYamlEditorStore';
import { DEMO_SCHEMA_FILES } from '../schema/demo-data';
import { IconSparkles } from './icons';
import { showToast } from './Toast';

export function SchemaUploader() {
    const loadFiles = useSchemaStore(s => s.loadFiles);
    const removeFile = useSchemaStore(s => s.removeFile);
    const rawFiles = useSchemaStore(s => s.rawFiles);
    const errors = useSchemaStore(s => s.errors);
    const domains = useSchemaStore(s => s.domains);
    const activeDomainId = useSchemaStore(s => s.activeDomainId);

    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const handleFiles = useCallback(
        async (files: File[]) => {
            const yamlFiles = files.filter(f =>
                f.name.endsWith('.yaml') || f.name.endsWith('.yml'),
            );
            if (yamlFiles.length === 0) return;

            const payload = await Promise.all(
                yamlFiles.map(async f => ({ name: f.name, content: await f.text() })),
            );

            // Добавляем к уже загруженным (не заменяем)
            const existing = new Map(
                useSchemaStore.getState().rawFiles.map(f => [f.name, f]),
            );
            for (const f of payload) existing.set(f.name, f);
            loadFiles([...existing.values()]);
        },
        [loadFiles],
    );

    const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length > 0) await handleFiles(files);
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) await handleFiles(files);
    };

    const openFile = useYamlEditorStore(s => s.openFile);

    const handleLoadDemo = () => {
        if (rawFiles.length > 0) {
            const confirmed = window.confirm(
                'У вас уже загружены схемы. Заменить их демонстрационной?',
            );
            if (!confirmed) return;
        }
        loadFiles(DEMO_SCHEMA_FILES);
        showToast('Демонстрационная схема загружена');
    };

    return (
        <div
            className={`flex flex-col border-b border-gray-200 ${dragging ? 'bg-blue-50' : ''
                }`}
            onDragOver={e => {
                e.preventDefault();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
        >
            {/* Заголовок */}
            <div className="flex items-center justify-between px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                    Схемы
                </div>
                <div className="flex items-center gap-1">
                    {rawFiles.length === 0 && (
                        <button
                            onClick={handleLoadDemo}
                            title="Загрузить демонстрационную схему"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded text-blue-700 hover:bg-blue-50 border border-blue-200"
                        >
                            <IconSparkles className="w-3 h-3" />
                            Пример
                        </button>
                    )}
                    <button
                        onClick={() => inputRef.current?.click()}
                        title="Добавить YAML-файл"
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-blue-700 hover:bg-blue-50"
                    >
                        <IconPlus2 />
                    </button>
                </div>
            </div>

            {/* Список файлов */}
            {rawFiles.length > 0 ? (
                <ul className="px-2 pb-2 space-y-0.5">
                    {rawFiles.map(f => {
                        const isActive =
                            domains.length === 1 && activeDomainId === domains[0]?.id
                            || false; // активный домен может быть из любого файла
                        return (
                            <li
                                key={f.name}
                                className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50"
                            >
                                <IconFileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <button
                                    onClick={() => openFile(f.name)}
                                    className="text-xs text-gray-700 truncate flex-1 text-left hover:text-blue-700"
                                    title={`Открыть ${f.name} в редакторе`}
                                >
                                    {f.name}
                                </button>
                                <button
                                    onClick={() => removeFile(f.name)}
                                    title="Удалить файл"
                                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                                >
                                    <IconX />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <>
                    <button
                        onClick={() => inputRef.current?.click()}
                        className="mx-2 mb-2 px-3 py-4 rounded border-2 border-dashed border-gray-300 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 text-center"
                    >
                        Перетащите .yaml файлы сюда
                        <br />
                        или нажмите, чтобы выбрать
                    </button>
                    <div className="mx-2 mb-3 text-center">
                        <button
                            onClick={handleLoadDemo}
                            className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
                        >
                            Загрузить демонстрационную схему
                        </button>
                    </div>
                </>
            )}

            {/* Ошибки */}
            {errors.length > 0 && (
                <div className="mx-2 mb-2 px-2 py-1.5 rounded bg-red-50 border border-red-200">
                    <div className="text-[10px] uppercase tracking-wide text-red-700 font-medium mb-1">
                        Ошибки парсинга
                    </div>
                    <ul className="space-y-0.5">
                        {errors.slice(0, 3).map((e, i) => (
                            <li key={i} className="text-[11px] text-red-700 leading-snug">
                                <span className="font-medium">{e.file}:</span> {e.message}
                            </li>
                        ))}
                        {errors.length > 3 && (
                            <li className="text-[11px] text-red-600 italic">
                                и ещё {errors.length - 3}...
                            </li>
                        )}
                    </ul>
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                multiple
                accept=".yaml,.yml"
                onChange={onInputChange}
                className="hidden"
            />
        </div>
    );
}