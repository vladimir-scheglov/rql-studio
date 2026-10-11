import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 90;

const GROUP_PADDING = 40;
const GROUP_HEADER = 34;
const GROUP_GAP = 60;

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR",
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

/**
 * Раскладывает узлы с группировкой по доменам.
 * Возвращает массив с parent-узлами + дочерними.
 *
 * Родители идут первыми в массиве — этого требует React Flow.
 */
export function layoutWithGroups(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR",
  groupOf: (node: Node) => string,
  labelOf: (groupId: string, count: number) => string,
): Node[] {
  // Группируем
  const groups = new Map<string, Node[]>();
  for (const n of nodes) {
    const key = groupOf(n);
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }

  const laidGroups: {
    id: string;
    width: number;
    height: number;
    children: Node[];
  }[] = [];

  for (const [groupId, groupNodes] of groups) {
    const groupNodeIds = new Set(groupNodes.map((n) => n.id));
    const groupEdges = edges.filter(
      (e) => groupNodeIds.has(e.source) && groupNodeIds.has(e.target),
    );

    const laid = layoutGraph(groupNodes, groupEdges, direction);

    // Bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of laid) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
    }

    const width = maxX - minX + GROUP_PADDING * 2;
    const height = maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER;

    // Нормализуем: сдвигаем к левому верхнему углу с отступом
    const normalized = laid.map((n) => ({
      ...n,
      position: {
        x: n.position.x - minX + GROUP_PADDING,
        y: n.position.y - minY + GROUP_PADDING + GROUP_HEADER,
      },
    }));

    laidGroups.push({
      id: groupId,
      width,
      height,
      children: normalized,
    });
  }

  // Раскладываем группы в колонку
  const result: Node[] = [];
  let cursorY = 0;

  for (const g of laidGroups) {
    const parentId = `group_${g.id}`;

    // Родитель
    result.push({
      id: parentId,
      type: "domainGroup",
      position: { x: 0, y: cursorY },
      data: {
        label: labelOf(g.id, g.children.length),
        domainId: g.id,
      },
      style: { width: g.width, height: g.height },
      draggable: true,
    });

    cursorY += g.height + GROUP_GAP;
  }

  // Дети — во второй проход, после всех родителей
  for (const g of laidGroups) {
    const parentId = `group_${g.id}`;
    for (const child of g.children) {
      result.push({
        ...child,
        parentId,
        extent: "parent" as const,
      });
    }
  }

  return result;
}
