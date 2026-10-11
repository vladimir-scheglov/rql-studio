import type { GroupNode, ConditionNode } from '../../constructor/types';
import { emptyGroup, emptyLeaf, emptyLinkage, emptyPathNode, nextId } from '../../constructor/types';
import { useConstructorUiStore } from '../../store/useConstructorUiStore';
import { LeafEditor } from './LeafEditor';
import { LinkageEditor } from './LinkageEditor';
import {
    IconChevronRight, IconChevronDown, IconArrowUp, IconArrowDown, IconCopy, IconTrash,
} from '../icons';
import { PathNodeEditor } from './PathNodeEditor';

interface Props {
    node: GroupNode;
    depth: number;
    onUpdate: (n: GroupNode) => void;
    onRemove?: () => void;
}

export function GroupEditor({ node, depth, onUpdate, onRemove }: Props) {
    const collapsed = useConstructorUiStore(s => s.collapsed);
    const toggleCollapsed = useConstructorUiStore(s => s.toggleCollapsed);
    const isCollapsed = collapsed[node.id] === true;
    const selection = useConstructorUiStore(s => s.selection);
    const selectTreeNode = useConstructorUiStore(s => s.selectTreeNode);
    const isSelected = (id: string) =>
        selection?.kind === 'tree-node' && selection.id === id;
    const issues = useConstructorUiStore(s => s.issues);
    const nodeIssues = (id: string) => issues.get(id) ?? [];
    const hasError = (id: string) => nodeIssues(id).some(i => i.severity === 'error');
    const hasWarning = (id: string) => nodeIssues(id).some(i => i.severity === 'warning');

    const updateChild = (id: string, next: ConditionNode) => {
        onUpdate({
            ...node,
            children: node.children.map(c => (c.id === id ? next : c)),
        });
    };

    const removeChild = (id: string) => {
        onUpdate({ ...node, children: node.children.filter(c => c.id !== id) });
    };

    const duplicateChild = (id: string) => {
        const idx = node.children.findIndex(c => c.id === id);
        if (idx === -1) return;
        const copy = cloneNode(node.children[idx]);
        const next = [...node.children];
        next.splice(idx + 1, 0, copy);
        onUpdate({ ...node, children: next });
    };

    const moveChild = (id: string, direction: -1 | 1) => {
        const idx = node.children.findIndex(c => c.id === id);
        if (idx === -1) return;
        const target = idx + direction;
        if (target < 0 || target >= node.children.length) return;
        const next = [...node.children];
        [next[idx], next[target]] = [next[target], next[idx]];
        onUpdate({ ...node, children: next });
    };

    const addLeaf = () =>
        onUpdate({ ...node, children: [...node.children, emptyLeaf()] });

    const addLinkage = () =>
        onUpdate({ ...node, children: [...node.children, emptyLinkage()] });

    const addGroup = () =>
        onUpdate({
            ...node,
            children: [
                ...node.children,
                emptyGroup(node.operator === 'AND' ? 'OR' : 'AND'),
            ],
        });

    const addPath = () => {
        onUpdate({
            ...node,
            children: [...node.children, emptyPathNode()],
        });
    };
        
    const setOperator = (operator: GroupNode['operator']) =>
        onUpdate({ ...node, operator });

    const count = node.children.length;
    const isRoot = depth === 0;

    return (
        <div
            className={`rounded-md border-l-4 pl-3 py-2 ${node.operator === 'AND' ? 'border-blue-400'
                : node.operator === 'OR' ? 'border-amber-400'
                    : 'border-gray-400'
                } ${isSelected(node.id) ? 'bg-blue-50' : node.id ? 'bg-blue-50/40' : ''
                }`}
            onClick={(e) => {
                // Не выделяем, если клик по интерактивному элементу
                const target = e.target as HTMLElement;
                if (target.closest('button, select, input, textarea, a')) return;
                selectTreeNode(node.id);
            }}
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                {count > 0 ? (
                    <button
                        onClick={() => toggleCollapsed(node.id)}
                        title={isCollapsed ? 'Развернуть' : 'Свернуть'}
                        className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    >
                        {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
                    </button>
                ) : (
                    <div className="w-6 h-6" />
                )}

                <select
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    value={node.operator}
                    onChange={e => setOperator(e.target.value as GroupNode['operator'])}
                    title="Логический оператор"
                >
                    <option value="AND">И</option>
                    <option value="OR">ИЛИ</option>
                    <option value="NOT">НЕ</option>
                </select>

                {isCollapsed && count > 0 && (
                    <span className="text-xs text-gray-500">
                        {count} {pluralChildren(count)}
                    </span>
                )}

                {!isCollapsed && (
                    <>
                        <button
                            onClick={addLeaf}
                            className="text-xs text-blue-700 hover:text-blue-900 px-2 py-0.5 rounded hover:bg-blue-50"
                        >
                            + Условие
                        </button>
                        <button
                            onClick={addLinkage}
                            className="text-xs text-purple-700 hover:text-purple-900 px-2 py-0.5 rounded hover:bg-purple-50"
                        >
                            + Связь
                        </button>
                        <button
                            onClick={addGroup}
                            className="text-xs text-blue-700 hover:text-blue-900 px-2 py-0.5 rounded hover:bg-blue-50"
                        >
                            + Группа
                        </button>
                        <button
                            onClick={addPath}
                            className="text-xs text-purple-700 hover:text-purple-900 px-2 py-0.5 rounded hover:bg-purple-50"
                        >
                            + Путь
                        </button>
                    </>
                )}

                {!isRoot && onRemove && (
                    <button
                        onClick={onRemove}
                        title="Удалить группу"
                        className="ml-auto w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                    >
                        <IconTrash />
                    </button>
                )}
            </div>

            {/* Body */}
            {isCollapsed && (
                <div className="text-xs text-gray-400 italic pl-8">Свёрнуто</div>
            )}

            {!isCollapsed && (
                <>
                    {count === 0 && (
                        <div className="text-xs text-gray-400 py-2 pl-8">
                            Добавьте условие, связь или группу
                        </div>
                    )}

                    <div className="space-y-1.5">
                        {node.children.map((child, idx) => {
                            return (
                                <>
                                    <div
                                        key={child.id}
                                        className={`group/row flex items-stretch gap-1.5 rounded transition-colors
                                            ${isSelected(child.id) ? 'bg-blue-50/60 ring-1 ring-blue-300' : ''}
                                            ${hasError(child.id) ? 'ring-2 ring-red-300' : ''}
                                            ${hasWarning(child.id) ? 'ring-2 ring-amber-300' : ''}
`}
                                        onClick={(e) => {
                                            const target = e.target as HTMLElement;
                                            if (target.closest('button, select, input, textarea, a, optgroup, option')) return;
                                            selectTreeNode(child.id);
                                            e.stopPropagation();
                                        }}
                                    >
                                        <ChildControls
                                            isFirst={idx === 0}
                                            isLast={idx === count - 1}
                                            onMoveUp={() => moveChild(child.id, -1)}
                                            onMoveDown={() => moveChild(child.id, 1)}
                                            onDuplicate={() => duplicateChild(child.id)}
                                            onRemove={() => removeChild(child.id)}
                                        />

                                        <div className="flex-1 min-w-0">
                                            {child.kind === 'leaf' && (
                                                <LeafEditor
                                                    node={child}
                                                    onChange={next => updateChild(child.id, next)}
                                                />
                                            )}
                                            {child.kind === 'linkage' && (
                                                <LinkageEditor
                                                    node={child}
                                                    onChange={next => updateChild(child.id, next)}
                                                />
                                            )}
                                            {child.kind === 'group' && (
                                                <GroupEditor
                                                    node={child}
                                                    depth={depth + 1}
                                                    onUpdate={next => updateChild(child.id, next)}
                                                    onRemove={() => removeChild(child.id)}
                                                />
                                            )}
                                            {child.kind === 'path' && (
                                                <PathNodeEditor
                                                    node={child}
                                                    onChange={next => updateChild(child.id, next)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    {nodeIssues(child.id).length > 0 && (
                                        <span
                                            title={nodeIssues(child.id).map(i => i.message).join('\n')}
                                            className={`self-start mt-1 text-[10px] px-1 rounded ${hasError(child.id) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                                }`}
                                        >
                                            {hasError(child.id) ? '!' : '?'}
                                        </span>
                                    )}
                                </>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

interface ChildControlsProps {
    isFirst: boolean;
    isLast: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
}

function ChildControls({
    isFirst, isLast, onMoveUp, onMoveDown, onDuplicate, onRemove,
}: ChildControlsProps) {
    return (
        <div className="flex flex-col justify-start pt-1 gap-0.5 opacity-40 group-hover/row:opacity-100 transition-opacity">
            <ControlButton
                onClick={onMoveUp}
                disabled={isFirst}
                title="Переместить вверх"
            >
                <IconArrowUp />
            </ControlButton>
            <ControlButton
                onClick={onMoveDown}
                disabled={isLast}
                title="Переместить вниз"
            >
                <IconArrowDown />
            </ControlButton>
            <ControlButton onClick={onDuplicate} title="Дублировать">
                <IconCopy />
            </ControlButton>
            <ControlButton onClick={onRemove} title="Удалить" danger>
                <IconTrash />
            </ControlButton>
        </div>
    );
}

interface ControlButtonProps {
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    title: string;
    children: React.ReactNode;
}

function ControlButton({ onClick, disabled, danger, title, children }: ControlButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`w-5 h-5 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed ${danger ? 'hover:text-red-600 hover:bg-red-50 hover:border-red-200' : 'hover:text-gray-900 hover:bg-gray-50'
                }`}
        >
            {children}
        </button>
    );
}

function cloneNode(node: ConditionNode): ConditionNode {
    if (node.kind === 'leaf') {
        return {
            ...node,
            id: nextId('l'),
            value: node.value ? { ...node.value } : null,
            values: node.values.map(v => ({ ...v })),
        };
    }
    if (node.kind === 'linkage') {
        return {
            ...node,
            id: nextId('lk'),
            nested: node.nested ? cloneNode(node.nested) as any : null,
        };
    }
    if (node.kind === 'path') {
        // PathNode — глубокая копия пути
        return {
            ...node,
            id: nextId('pn'),
            path: {
                startEntityFqid: node.path.startEntityFqid,
                steps: node.path.steps.map(s => ({ ...s })),
            },
        };
    }
    return {
        ...node,
        id: nextId('g'),
        children: node.children.map(cloneNode),
    };
}

function pluralChildren(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'условие';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'условия';
    return 'условий';
}