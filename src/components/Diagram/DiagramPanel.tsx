import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    useReactFlow,
    MarkerType,
    type Node,
    type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toSvg } from 'html-to-image';

import { useSchemaStore } from '../../store/useSchemaStore';
import { useSchemaUiStore } from '../../store/useSchemaUiStore';
import { useConstructorUiStore } from '../../store/useConstructorUiStore';
import { useEditorStore } from '../../store/useEditorStore';
import { resolveEntityFqid } from '../../schema/symbol-table';
import { EntityNode } from './EntityNode';
import { LinkageEdge } from './LinkageEdge';
import { DomainGroupNode } from './DomainGroupNode';
import { layoutGraph, layoutWithGroups } from './layout';
import {
    IconRefresh, IconDownload, IconSearch, IconX, IconLayoutHorizontal,
    IconLayoutVertical,
    IconGroupFrame,
} from '../icons';
import { showToast } from '../Toast';
import { ExportMenu } from './ExportMenu';

const nodeTypes = {
    entity: EntityNode,
    domainGroup: DomainGroupNode,
};
const edgeTypes = { linkage: LinkageEdge };

const POSITIONS_KEY = 'rql-studio-diagram-positions';
const VIEWPORT_KEY = 'rql-studio-diagram-viewport';

type HoverInfo =
    | { kind: 'entity'; fqid: string; x: number; y: number }
    | { kind: 'linkage'; fqid: string; x: number; y: number }
    | null;

// =========================================================================

export function DiagramPanel() {
    return (
        <ReactFlowProvider>
            <DiagramPanelInner />
        </ReactFlowProvider>
    );
}

function DiagramPanelInner() {
    const table = useSchemaStore(s => s.symbolTable);
    const domains = useSchemaStore(s => s.domains);
    const activeDomainId = useSchemaStore(s => s.activeDomainId);

    const focusOn = useSchemaUiStore(s => s.focusOn);
    const setExplorerMode = useSchemaUiStore(s => s.setExplorerMode);

    const selectLinkage = useConstructorUiStore(s => s.selectLinkage);

    const setContext = useEditorStore(s => s.setContext);
    const setActiveTab = useEditorStore(s => s.setActiveTab);

    const reactFlow = useReactFlow();

    const [direction, setDirection] = useState<'LR' | 'TB'>('LR');
    const [selectedDomain, setSelectedDomain] = useState<string>('all');
    const [selectedLinkage, setSelectedLinkage] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [grouped, setGrouped] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const diagramRef = useRef<HTMLDivElement>(null);
    const hoverTimer = useRef<number | null>(null);
    const [hover, setHover] = useState<HoverInfo>(null);

    const scheduleHover = (info: HoverInfo) => {
        if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
        if (!info) {
            setHover(null);
            return;
        }
        hoverTimer.current = window.setTimeout(() => setHover(info), 300);
    };

    const hideHover = () => {
        if (hoverTimer.current) {
            window.clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
        }
        setHover(null);
    };

    // --- Построение узлов и рёбер ---
    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
        if (!table) return { nodes: [], edges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        const domainFilter = selectedDomain === 'all' ? null : selectedDomain;

        for (const entity of table.entities.values()) {
            if (domainFilter && entity.domain !== domainFilter) continue;
            nodes.push({
                id: entity.fqid,
                type: 'entity',
                position: { x: 0, y: 0 },
                data: {
                    label: entity.entity.name ?? entity.entity.id,
                    fqid: entity.fqid,
                    domainId: entity.domain,
                    attributesCount: entity.attributes.size,
                    isActive: entity.domain === activeDomainId,
                    dimmed: false,
                    highlighted: false,
                },
            });
        }

        const nodeIds = new Set(nodes.map(n => n.id));

        for (const linkage of table.linkages.values()) {
            if (domainFilter && linkage.domain !== domainFilter) continue;
            const side1Fqid = resolveEntityFqid(linkage.side1, linkage.domain, table);
            const side2Fqid = resolveEntityFqid(linkage.side2, linkage.domain, table);
            if (!side1Fqid || !side2Fqid) continue;
            if (!nodeIds.has(side1Fqid) || !nodeIds.has(side2Fqid)) continue;

            edges.push({
                id: linkage.fqid,
                source: side1Fqid,
                target: side2Fqid,
                type: 'linkage',
                markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
                data: {
                    label: linkage.name ?? linkage.id,
                    type: linkage.type,
                    undirected: linkage.undirected === true,
                    linkageId: linkage.id,
                },
            });
        }

        // Раскладка
        let laid: Node[];

        if (grouped) {
            laid = layoutWithGroups(
                nodes,
                edges,
                direction,
                n => (n.data as any).domainId as string,
                (domainId, count) => {
                    const domain = domains.find(d => d.id === domainId);
                    const name = domain?.name ?? domainId;
                    return `${name} (${count})`;
                },
            );
        } else {
            laid = layoutGraph(nodes, edges, direction);

            // Применяем сохранённые позиции только для плоского режима
            const saved = loadPositions();
            laid = laid.map(n => {
                const s = saved.get(n.id);
                return s ? { ...n, position: s } : n;
            });
        }

        return { nodes: laid, edges };
    }, [table, selectedDomain, activeDomainId, direction, grouped, domains]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    // --- Соседи выделенного узла ---
    const neighbors = useMemo(() => {
        const set = new Set<string>();
        if (!selectedNodeId) return set;
        set.add(selectedNodeId);
        for (const e of edges) {
            if (e.source === selectedNodeId) set.add(e.target);
            if (e.target === selectedNodeId) set.add(e.source);
        }
        return set;
    }, [selectedNodeId, edges]);

    const styledNodes = useMemo(
        () =>
            nodes.map(n => {
                if (n.type !== 'entity') return n;
                const isSelf = n.id === selectedNodeId;
                const isNeighbor = neighbors.has(n.id);
                const dimmed = selectedNodeId !== null && !isNeighbor;
                return {
                    ...n,
                    data: {
                        ...n.data,
                        dimmed,
                        highlighted: isSelf,
                    },
                };
            }),
        [nodes, selectedNodeId, neighbors],
    );

    const styledEdges = useMemo(
        () =>
            edges.map(e => {
                const isSelected = e.id === selectedLinkage;
                const touchesSelected =
                    selectedNodeId !== null &&
                    (e.source === selectedNodeId || e.target === selectedNodeId);
                const dimmed = selectedNodeId !== null && !touchesSelected;
                return {
                    ...e,
                    selected: isSelected,
                    animated: touchesSelected,
                    style: {
                        ...e.style,
                        opacity: dimmed ? 0.15 : 1,
                    },
                };
            }),
        [edges, selectedLinkage, selectedNodeId],
    );

    // --- Обработчики ---
    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: Node) => {
            if (node.type !== 'entity') return;
            // Если уже выбран — снимаем выделение, иначе устанавливаем
            setSelectedNodeId(prev => (prev === node.id ? null : node.id));
        },
        [],
    );

    const onNodeDoubleClick = useCallback(
        (_: React.MouseEvent, node: Node) => {
            if (node.type !== 'entity') return;
            const t = useSchemaStore.getState().symbolTable;
            if (!t) return;
            const entity = t.entities.get(node.id);
            if (!entity) return;

            focusOn({ kind: 'entity', fqid: node.id });
            setContext({ kind: 'condition', entityFqid: node.id });
            setActiveTab('builder');
            showToast(
                `Открыт контекст для «${entity.entity.name ?? entity.entity.id}»`,
            );
        },
        [focusOn, setContext, setActiveTab],
    );

    const onEdgeClick = useCallback(
        (_: React.MouseEvent, edge: Edge) => {
            setSelectedLinkage(prev => (prev === edge.id ? null : edge.id));
            selectLinkage(edge.id);
            setExplorerMode('entities');
        },
        [selectLinkage, setExplorerMode],
    );

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedLinkage(null);
        selectLinkage(null);
    }, [selectLinkage]);

    const relayout = () => {
        if (!grouped) {
            localStorage.removeItem(POSITIONS_KEY);
        }
        const laid = grouped
            ? layoutWithGroups(
                nodes.filter(n => n.type === 'entity'),
                edges,
                direction,
                n => (n.data as any).domainId as string,
                (domainId, count) => {
                    const domain = domains.find(d => d.id === domainId);
                    return `${domain?.name ?? domainId} (${count})`;
                },
            )
            : layoutGraph(
                nodes.filter(n => n.type === 'entity'),
                edges,
                direction,
            );

        setNodes(laid);
        showToast('Раскладка пересобрана');
    };

    // --- Поиск ---
    const doSearch = (query: string) => {
        setSearchQuery(query);
        if (!query.trim()) return;

        const needle = query.toLowerCase();
        const target = nodes.find(
            n =>
                n.type === 'entity' &&
                ((n.data as any).label?.toLowerCase().includes(needle) ||
                    ((n.data as any).fqid as string).toLowerCase().includes(needle) ||
                    n.id.toLowerCase().includes(needle)),
        );

        if (!target) {
            showToast('Ничего не найдено');
            return;
        }

        const x = target.position.x + 110;
        const y = target.position.y + 45;
        reactFlow.setCenter(x, y, { zoom: 1, duration: 500 });
        setSelectedNodeId(target.id);
    };

    // --- Экспорт ---
    const downloadImage = async (format: 'png' | 'svg') => {
        const el = diagramRef.current;
        if (!el) return;

        const fn = format === 'png' ? toPng : toSvg;

        try {
            const flowEl = (el.querySelector('.react-flow') as HTMLElement) ?? el;

            const toHide = [
                el.querySelector('.react-flow__controls'),
                el.querySelector('.react-flow__minimap'),
                el.querySelector('.react-flow__attribution'),
            ].filter(Boolean) as HTMLElement[];

            const prev = toHide.map(n => n.style.display);
            toHide.forEach(n => (n.style.display = 'none'));

            const dataUrl = await fn(flowEl, {
                backgroundColor: '#ffffff',
                quality: 1,
            });

            toHide.forEach((n, i) => (n.style.display = prev[i]));

            const link = document.createElement('a');
            link.download = `diagram-${Date.now()}.${format}`;
            link.href = dataUrl;
            link.click();
            showToast(`Экспорт в ${format.toUpperCase()} выполнен`);
        } catch (e) {
            console.error('[diagram] export error:', e);
            showToast('Не удалось экспортировать диаграмму');
        }
    };

    if (!table || table.entities.size === 0) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Загрузите схему, чтобы увидеть диаграмму связей
            </div>
        );
    }

    const entityCount = nodes.filter(n => n.type === 'entity').length;

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Тулбар */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
                {/* Слева: фильтры и настройки */}
                <div className="flex items-center gap-2">
                    <select
                        value={selectedDomain}
                        onChange={e => setSelectedDomain(e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 max-w-[160px] bg-white"
                        title="Фильтр по домену"
                    >
                        <option value="all">Все домены</option>
                        {domains.map(d => (
                            <option key={d.id} value={d.id}>
                                {d.name}
                            </option>
                        ))}
                    </select>

                    <div className="border-l border-gray-200 h-4" />

                    <SegmentedControl
                        value={direction}
                        onChange={setDirection}
                        options={[
                            {
                                id: 'LR',
                                icon: <IconLayoutHorizontal className="w-3.5 h-3.5" />,
                                title: 'Горизонтальная раскладка',
                            },
                            {
                                id: 'TB',
                                icon: <IconLayoutVertical className="w-3.5 h-3.5" />,
                                title: 'Вертикальная раскладка',
                            },
                        ]}
                    />

                    <button
                        onClick={() => setGrouped(g => !g)}
                        title={grouped ? 'Отключить группировку' : 'Группировать по домену'}
                        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${grouped
                            ? 'bg-gray-800 text-white border-gray-800'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        <IconGroupFrame className="w-3 h-3" />
                        Группы
                    </button>

                    <button
                        onClick={relayout}
                        className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                        title="Пересобрать раскладку и сбросить позиции"
                    >
                        <IconRefresh className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* По центру: поиск */}
                <div className="flex-1 flex justify-center">
                    <div className="relative max-w-md w-full">
                        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Найти сущность по имени или FQID..."
                            value={searchQuery}
                            onChange={e => doSearch(e.target.value)}
                            className="w-full text-xs pl-8 pr-8 py-1.5 border border-gray-300 rounded focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700"
                            >
                                <IconX className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Справа: экспорт и статистика */}
                <div className="flex items-center gap-2">
                    <ExportMenu onExport={downloadImage} />
                    <div className="border-l border-gray-200 h-4" />
                    <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                        {entityCount} сущностей · {edges.length} связей
                        {selectedNodeId && (
                            <>
                                {' · '}
                                <button
                                    onClick={() => setSelectedNodeId(null)}
                                    className="text-blue-600 hover:text-blue-800"
                                >
                                    снять
                                </button>
                            </>
                        )}
                    </span>
                </div>
            </div>

            {/* Граф */}
            <div className="flex-1 min-h-0 relative" ref={diagramRef}>
                <ReactFlow
                    nodes={styledNodes}
                    edges={styledEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    onNodeDoubleClick={onNodeDoubleClick}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={onPaneClick}
                    onNodeMouseEnter={(e, node) => {
                        if (node.type !== 'entity') return;
                        scheduleHover({
                            kind: 'entity',
                            fqid: node.id,
                            x: e.clientX,
                            y: e.clientY,
                        });
                    }}
                    onNodeMouseLeave={hideHover}
                    onEdgeMouseEnter={(e, edge) =>
                        scheduleHover({
                            kind: 'linkage',
                            fqid: edge.id,
                            x: e.clientX,
                            y: e.clientY,
                        })
                    }
                    onEdgeMouseLeave={hideHover}
                    onNodeDragStop={() => {
                        if (!grouped) savePositions(nodes);
                    }}
                    onMoveEnd={(_, viewport) => saveViewport(viewport)}
                    onInit={instance => {
                        const vp = loadViewport();
                        if (vp) instance.setViewport(vp);
                    }}
                    fitView={!loadViewport()}
                    fitViewOptions={{ padding: 0.15 }}
                    minZoom={0.1}
                    maxZoom={2}
                    proOptions={{ hideAttribution: true }}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                >
                    <Background gap={16} size={1} color="#e5e7eb" />
                    <Controls showInteractive={false} />
                    <MiniMap
                        pannable
                        zoomable
                        className="!bg-white !border !border-gray-200"
                        nodeColor={n =>
                            (n.data as any)?.isActive ? '#93c5fd' : '#e5e7eb'
                        }
                    />
                </ReactFlow>
            </div>

            {/* Hover-тултип */}
            {hover &&
                createPortal(
                    <div
                        style={{
                            position: 'fixed',
                            left: hover.x + 12,
                            top: hover.y + 12,
                            zIndex: 1000,
                            pointerEvents: 'none',
                        }}
                    >
                        {hover.kind === 'entity' ? (
                            <EntityHoverTooltip fqid={hover.fqid} />
                        ) : (
                            <LinkageHoverTooltip fqid={hover.fqid} />
                        )}
                    </div>,
                    document.body,
                )}
        </div>
    );
}

// =========================================================================
// Сохранение
// =========================================================================

function loadPositions(): Map<string, { x: number; y: number }> {
    try {
        const raw = localStorage.getItem(POSITIONS_KEY);
        if (!raw) return new Map();
        const list = JSON.parse(raw) as { id: string; x: number; y: number }[];
        return new Map(list.map(p => [p.id, { x: p.x, y: p.y }]));
    } catch {
        return new Map();
    }
}

function savePositions(nodes: Node[]) {
    try {
        const list = nodes
            .filter(n => n.type === 'entity')
            .map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
        localStorage.setItem(POSITIONS_KEY, JSON.stringify(list));
    } catch {
        // ignore
    }
}

function loadViewport(): { x: number; y: number; zoom: number } | null {
    try {
        const raw = localStorage.getItem(VIEWPORT_KEY);
        if (!raw) return null;
        const vp = JSON.parse(raw);
        if (
            typeof vp?.x === 'number' &&
            typeof vp?.y === 'number' &&
            typeof vp?.zoom === 'number'
        ) {
            return vp;
        }
        return null;
    } catch {
        return null;
    }
}

function saveViewport(vp: { x: number; y: number; zoom: number }) {
    try {
        localStorage.setItem(VIEWPORT_KEY, JSON.stringify(vp));
    } catch {
        // ignore
    }
}

// =========================================================================
// Тултипы (без изменений)
// =========================================================================

function EntityHoverTooltip({ fqid }: { fqid: string }) {
    const table = useSchemaStore(s => s.symbolTable);
    if (!table) return null;
    const entity = table.entities.get(fqid);
    if (!entity) return null;

    const attrs = [...entity.attributes.values()].slice(0, 12);
    const more = entity.attributes.size - attrs.length;

    return (
        <div className="w-72 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl p-3">
            <div className="font-medium text-gray-100 text-sm mb-1">
                {entity.entity.name ?? entity.entity.id}
            </div>
            <div className="text-[10px] font-mono text-gray-400 mb-2 truncate">
                {fqid}
            </div>
            <div className="border-t border-gray-700 pt-2 space-y-0.5">
                {attrs.map(a => (
                    <div key={a.id} className="flex justify-between gap-2 text-[11px]">
                        <span className="text-gray-300 truncate">{a.name ?? a.id}</span>
                        <span className="font-mono text-gray-500 text-[10px] shrink-0">
                            {a.dataType}
                        </span>
                    </div>
                ))}
                {more > 0 && (
                    <div className="text-[10px] text-gray-500 italic mt-1">
                        и ещё {more}...
                    </div>
                )}
            </div>
        </div>
    );
}

function LinkageHoverTooltip({ fqid }: { fqid: string }) {
    const table = useSchemaStore(s => s.symbolTable);
    if (!table) return null;
    const linkage = table.linkages.get(fqid);
    if (!linkage) return null;

    const typeLabel =
        linkage.type === '1_1' ? '1-1'
            : linkage.type === '1_n' ? '1-N'
                : 'N-N';
    const dir = linkage.undirected ? 'ненаправленная' : 'направленная';

    const side1Fqid = resolveEntityFqid(linkage.side1, linkage.domain, table);
    const side2Fqid = resolveEntityFqid(linkage.side2, linkage.domain, table);
    const side1Entity = side1Fqid ? table.entities.get(side1Fqid) : undefined;
    const side2Entity = side2Fqid ? table.entities.get(side2Fqid) : undefined;

    return (
        <div className="w-72 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl p-3 space-y-2">
            <div className="space-y-0.5">
                <div className="font-mono text-[11px] text-purple-300 break-all">
                    {linkage.id}
                </div>
                {linkage.name && (
                    <div className="text-gray-200 text-sm leading-tight">
                        {linkage.name}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 text-[11px]">
                <span className="text-gray-400">Тип</span>
                <span className="text-blue-300">
                    {typeLabel}, {dir}
                </span>
            </div>

            <div className="border-t border-gray-700 pt-2 space-y-1 text-[11px]">
                <div className="text-gray-500 text-[10px] uppercase tracking-wide">
                    Направление
                </div>
                <div className="text-gray-300">
                    {side1Entity?.entity.name ?? linkage.side1}
                    <span className="mx-1 text-gray-500">
                        {linkage.undirected ? '↔' : '→'}
                    </span>
                    {side2Entity?.entity.name ?? linkage.side2}
                </div>
            </div>

            {linkage.attributes && linkage.attributes.length > 0 && (
                <div className="border-t border-gray-700 pt-2 text-[10px] text-gray-400">
                    Атрибутов связи: {linkage.attributes.length}
                </div>
            )}
        </div>
    );
}

function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { id: T; icon: React.ReactNode; title: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="inline-flex rounded border border-gray-300 overflow-hidden">
            {options.map(o => (
                <button
                    key={o.id}
                    onClick={() => onChange(o.id)}
                    title={o.title}
                    className={`px-2 py-1 text-gray-600 transition-colors ${value === o.id
                        ? 'bg-gray-800 text-white'
                        : 'bg-white hover:bg-gray-50'
                        } ${options.indexOf(o) > 0 ? 'border-l border-gray-300' : ''}`}
                >
                    {o.icon}
                </button>
            ))}
        </div>
    );
}