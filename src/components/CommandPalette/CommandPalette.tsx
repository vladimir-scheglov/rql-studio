import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommandPaletteStore } from '../../store/useCommandPaletteStore';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useSchemaUiStore } from '../../store/useSchemaUiStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useYamlEditorStore } from '../../store/useYamlEditorStore';
import { fuzzyMatch } from './fuzzy';
import {
    IconGrid,
    IconLink,
    IconShield,
    IconFileText,
    IconLayoutHorizontal,
    IconHelp,
} from '../icons';
import { usePathBuilderStore } from '../../store/usePathBuilderStore';

// =========================================================================

type CommandKind = 'entity' | 'linkage' | 'rule' | 'file' | 'action';

interface Command {
    id: string;
    kind: CommandKind;
    label: string;
    hint?: string;
    /** Подстрока, по которой идёт поиск */
    searchText: string;
    run: () => void;
}

// =========================================================================

export function CommandPalette() {
    const open = useCommandPaletteStore(s => s.open);
    const close = useCommandPaletteStore(s => s.closePalette);

    const domains = useSchemaStore(s => s.domains);
    const table = useSchemaStore(s => s.symbolTable);
    const setActiveDomain = useSchemaStore(s => s.setActiveDomain);

    const focusOn = useSchemaUiStore(s => s.focusOn);
    const setExplorerMode = useSchemaUiStore(s => s.setExplorerMode);

    const setActiveTab = useEditorStore(s => s.setActiveTab);
    const setContext = useEditorStore(s => s.setContext);

    const openYamlFile = useYamlEditorStore(s => s.openFile);

    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Сброс при открытии
    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIdx(0);
            // Фокус после монтирования
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    // Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, close]);

    // Собираем команды
    const commands = useMemo<Command[]>(() => {
        const result: Command[] = [];

        // Сущности
        if (table) {
            for (const entity of table.entities.values()) {
                const label = entity.entity.name ?? entity.entity.id;
                result.push({
                    id: `entity:${entity.fqid}`,
                    kind: 'entity',
                    label,
                    hint: entity.fqid,
                    searchText: `${label} ${entity.entity.id} ${entity.fqid}`,
                    run: () => {
                        setActiveDomain(entity.domain);
                        focusOn({ kind: 'entity', fqid: entity.fqid });
                        setExplorerMode('entities');
                    },
                });
            }

            // Связи
            for (const linkage of table.linkages.values()) {
                const label = linkage.name ?? linkage.id;
                result.push({
                    id: `linkage:${linkage.fqid}`,
                    kind: 'linkage',
                    label,
                    hint: linkage.fqid,
                    searchText: `${label} ${linkage.id} ${linkage.fqid}`,
                    run: () => {
                        setActiveDomain(linkage.domain);
                        focusOn({ kind: 'linkage', fqid: linkage.fqid });
                        setExplorerMode('linkages');
                    },
                });
            }
        }

        // Правила данных
        for (const domain of domains) {
            for (const rule of domain.dataRules ?? []) {
                const label = rule.name ?? rule.id;
                result.push({
                    id: `rule:${domain.id}:${rule.id}`,
                    kind: 'rule',
                    label,
                    hint: `${domain.id} · ${rule.rule?.effect ?? '—'}`,
                    searchText: `${label} ${rule.id} ${domain.id} ${rule.entity ?? ''}`,
                    run: () => {
                        setActiveDomain(domain.id);
                        setExplorerMode('rules');
                    },
                });
            }
        }

        // Файлы
        for (const domain of domains) {
            result.push({
                id: `file:${domain.id}`,
                kind: 'file',
                label: domain.name,
                hint: `${domain.id}.yaml`,
                searchText: `${domain.name} ${domain.id} yaml`,
                run: () => {
                    // Открыть редактор YAML для этого файла
                    const file = useSchemaStore.getState().rawFiles.find(f =>
                        f.name.includes(domain.id),
                    );
                    if (file) {
                        openYamlFile(file.name);
                    } else {
                        setActiveDomain(domain.id);
                    }
                },
            });
        }

        // Действия
        result.push({
            id: 'action:builder',
            kind: 'action',
            label: 'Открыть конструктор',
            searchText: 'конструктор builder condition',
            run: () => setActiveTab('builder'),
        });
        result.push({
            id: 'action:diagram',
            kind: 'action',
            label: 'Открыть диаграмму связей',
            searchText: 'диаграмма diagram graph связей',
            run: () => setActiveTab('diagram'),
        });
        result.push({
            id: 'action:simulator',
            kind: 'action',
            label: 'Открыть симулятор правил',
            searchText: 'симулятор simulator правила',
            run: () => setActiveTab('simulator'),
        });
        result.push({
            id: 'action:editor',
            kind: 'action',
            label: 'Открыть редактор RQL',
            searchText: 'редактор editor код code rql',
            run: () => setActiveTab('code'),
        });
        result.push({
            id: 'action:guide',
            kind: 'action',
            label: 'Открыть руководство пользователя',
            searchText: 'справка помощь руководство help guide документация',
            run: () => {
                // Открыть руководство через event или через store
                window.dispatchEvent(new CustomEvent('rql-studio:open-guide'));
            },
        });
        result.push({
            id: 'action:path-builder',
            kind: 'action',
            label: 'Построить путь связей',
            searchText: 'путь path transitive цепочка связей builder',
            run: () => {
                const ctx = useEditorStore.getState().context;
                const entityFqid = 'entityFqid' in ctx ? ctx.entityFqid ?? '' : '';
                usePathBuilderStore.getState().openBuilder(entityFqid);
            },
        });

        return result;
    }, [domains, table, setActiveDomain, focusOn, setExplorerMode, setActiveTab, openYamlFile]);

    // Фильтрация
    const filtered = useMemo(() => {
        if (!query.trim()) {
            // Без запроса — показываем действия и файлы
            return commands.toSorted((a, b) => {
                const priority = (c: Command) => (c.kind === 'action' || c.kind === 'file') ? 0 : 1;
                return priority(a) - priority(b);
            });
        }

        return commands
            .map(c => {
                const match = fuzzyMatch(query, c.searchText);
                return match ? { cmd: c, score: match.score } : null;
            })
            .filter((x): x is { cmd: Command; score: number } => x !== null)
            .sort((a, b) => a.score - b.score)
            .slice(0, 30)
            .map(x => x.cmd);
    }, [commands, query]);

    // Ограничиваем activeIdx
    useEffect(() => {
        if (activeIdx >= filtered.length) setActiveIdx(0);
    }, [filtered.length, activeIdx]);

    // Скролл к активному
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(
            `[data-index="${activeIdx}"]`,
        );
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIdx]);

    // Навигация
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const cmd = filtered[activeIdx];
            if (cmd) {
                cmd.run();
                close();
            }
        }
    };

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40"
            onClick={close}
        >
            <div
                className="w-[640px] max-w-[95vw] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '70vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Поиск */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
                    <svg
                        className="w-4 h-4 text-gray-400 shrink-0"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                    >
                        <circle cx="7" cy="7" r="5" />
                        <path d="M11 11 L14 14" strokeLinecap="round" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setActiveIdx(0);
                        }}
                        onKeyDown={onKeyDown}
                        placeholder="Найти сущность, связь, правило, файл или действие..."
                        className="flex-1 text-sm outline-none bg-transparent"
                    />
                    <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                        Esc
                    </kbd>
                </div>

                {/* Список */}
                <div ref={listRef} className="flex-1 overflow-auto py-1">
                    {filtered.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs text-gray-400">
                            Ничего не найдено
                        </div>
                    ) : (
                        filtered.map((cmd, i) => (
                            <CommandRow
                                key={cmd.id}
                                cmd={cmd}
                                active={i === activeIdx}
                                query={query}
                                onClick={() => {
                                    cmd.run();
                                    close();
                                }}
                                onMouseEnter={() => setActiveIdx(i)}
                            />
                        ))
                    )}
                </div>

                {/* Подвал с подсказками */}
                <div className="flex items-center gap-3 px-4 py-1.5 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1">
                        <kbd className="border border-gray-300 rounded px-1">↑</kbd>
                        <kbd className="border border-gray-300 rounded px-1">↓</kbd>
                        навигация
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="border border-gray-300 rounded px-1">↵</kbd>
                        открыть
                    </span>
                    <span className="ml-auto">
                        найдено: {filtered.length}
                    </span>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// =========================================================================

function CommandRow({
    cmd,
    active,
    query,
    onClick,
    onMouseEnter,
}: {
    cmd: Command;
    active: boolean;
    query: string;
    onClick: () => void;
    onMouseEnter: () => void;
}) {
    const icon = kindIcon(cmd.kind);

    return (
        <div
            data-index={cmd.id}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${active ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
        >
            <span className={`shrink-0 ${kindColor(cmd.kind)}`}>{icon}</span>

            <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 truncate">
                    <Highlighted text={cmd.label} query={query} />
                </div>
                {cmd.hint && (
                    <div className="text-[10px] text-gray-400 truncate font-mono">
                        {cmd.hint}
                    </div>
                )}
            </div>

            <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                {kindLabel(cmd.kind)}
            </span>
        </div>
    );
}

function Highlighted({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return <>{text}</>;

    const match = fuzzyMatch(query, text);
    if (!match) return <>{text}</>;

    const indices = new Set(match.matchedIndices);

    return (
        <>
            {[...text].map((ch, i) => (
                <span
                    key={i}
                    className={indices.has(i) ? 'text-blue-600 font-medium' : undefined}
                >
                    {ch}
                </span>
            ))}
        </>
    );
}

function kindIcon(kind: CommandKind) {
    switch (kind) {
        case 'entity': return <IconGrid className="w-4 h-4" />;
        case 'linkage': return <IconLink className="w-4 h-4" />;
        case 'rule': return <IconShield className="w-4 h-4" />;
        case 'file': return <IconFileText className="w-4 h-4" />;
        case 'action': return <IconHelp className="w-4 h-4" />;
    }
}

function kindColor(kind: CommandKind): string {
    switch (kind) {
        case 'entity': return 'text-gray-500';
        case 'linkage': return 'text-purple-500';
        case 'rule': return 'text-emerald-500';
        case 'file': return 'text-amber-600';
        case 'action': return 'text-blue-500';
    }
}

function kindLabel(kind: CommandKind): string {
    switch (kind) {
        case 'entity': return 'сущность';
        case 'linkage': return 'связь';
        case 'rule': return 'правило';
        case 'file': return 'файл';
        case 'action': return 'действие';
    }
}