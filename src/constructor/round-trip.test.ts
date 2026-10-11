import { describe, it, expect } from "vitest";
import { serializeCondition } from "./serialize";
import { importFromRql } from "./import";
import { parseRql } from "../rql/parser";
import { buildSymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";
import type { GroupNode, LeafNode, LinkageNode, ConditionNode } from "./types";

// --- Тестовая схема ------------------------------------------------------

const domain: DomainSchema = {
  id: "test.domain",
  type: "domain",
  version: "1.0.0",
  name: "Test",
  entities: [
    {
      id: "Incident",
      name: "Инцидент",
      attributes: [
        { id: "subject", name: "Тема", dataType: "String" },
        { id: "urgency", name: "Срочность", dataType: "IncUrgency" },
        { id: "createdAt", dataType: "Timestamp" },
        { id: "count", dataType: "Integer" },
        { id: "tags", dataType: "Array", item: { dataType: "String" } },
      ],
    },
    {
      id: "Ioc",
      name: "Индикатор",
      attributes: [{ id: "value", name: "Значение", dataType: "String" }],
    },
  ],
  dataTypes: [
    {
      id: "IncUrgency",
      dataType: "Enum",
      values: [
        { id: "high", name: "Высокая" },
        { id: "low", name: "Низкая" },
      ],
    },
  ],
  linkages: [
    {
      id: "Incident_Ioc",
      name: "Инцидент связан с индикатором",
      side1: "Incident",
      side2: "Ioc",
      type: "n_n",
      undirected: true,
      nameFrom: { side1: "содержит", side2: "связан" },
      attributes: [
        { id: "confidence", name: "Уверенность", dataType: "Integer" },
      ],
    },
  ],
};

const table = buildSymbolTable([domain]);
const domainId = "test.domain";
const entityFqid = "test.domain/Incident";

// --- Хелперы -------------------------------------------------------------

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++idCounter}`;
}

function group(
  children: ConditionNode[],
  operator: GroupNode["operator"] = "AND",
): GroupNode {
  return { id: nextId("g"), kind: "group", operator, children };
}

function leaf(
  attribute: string,
  operator: LeafNode["operator"],
  value?: LeafNode["value"],
): LeafNode {
  return {
    id: nextId("l"),
    kind: "leaf",
    attribute,
    operator,
    value: value ?? null,
    values: [],
  };
}

function linkage(
  mode: LinkageNode["mode"],
  nested: LeafNode | null = null,
  side: "1" | "2" = "1",
): LinkageNode {
  return {
    id: nextId("lk"),
    kind: "linkage",
    linkageFqid: "test.domain/Incident_Ioc",
    side,
    targetEntityFqid: "test.domain/Ioc",
    mode,
    nested,
  };
}

/**
 * Round-trip: serialize → parse → import → serialize.
 * Возвращает вторую сериализацию для сравнения.
 */
function roundTrip(root: GroupNode): string {
  const rql1 = serializeCondition(root, table);
  const { ast, parseErrors } = parseRql(`!rql ${rql1}`);

  if (!ast || parseErrors.length > 0) {
    const msgs = parseErrors.map((e: any) => e.message ?? String(e)).join("\n");
    throw new Error(`Parse failed for RQL:\n${rql1}\n\nErrors:\n${msgs}`);
  }

  const { root: imported, errors } = importFromRql(
    ast,
    table,
    domainId,
    entityFqid,
  );

  if (!imported) {
    throw new Error(
      `Import failed for RQL:\n${rql1}\n\nErrors:\n${errors.join("\n")}`,
    );
  }

  return serializeCondition(imported, table);
}

function expectRoundTrip(root: GroupNode): void {
  const rql1 = serializeCondition(root, table);
  const rql2 = roundTrip(root);
  expect(rql2).toBe(rql1);
}

// --- Leaf-условия --------------------------------------------------------

describe("round-trip: leaf conditions", () => {
  it("string equality", () => {
    expectRoundTrip(
      group([leaf("subject", "=", { kind: "string", value: "test" })]),
    );
  });

  it("escape single quote", () => {
    expectRoundTrip(
      group([leaf("subject", "=", { kind: "string", value: "O'Brien" })]),
    );
  });

  it("numeric comparison", () => {
    expectRoundTrip(
      group([leaf("count", ">", { kind: "number", value: 100 })]),
    );
  });

  it("enum value", () => {
    expectRoundTrip(
      group([
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "high",
        }),
      ]),
    );
  });

  it("LIKE", () => {
    expectRoundTrip(
      group([leaf("subject", "LIKE", { kind: "string", value: "%test%" })]),
    );
  });

  it("IS NULL", () => {
    expectRoundTrip(group([leaf("subject", "IS NULL")]));
  });

  it("IS NOT NULL", () => {
    expectRoundTrip(group([leaf("subject", "IS NOT NULL")]));
  });

  it("HAS", () => {
    expectRoundTrip(
      group([leaf("tags", "HAS", { kind: "string", value: "urgent" })]),
    );
  });

  it("BETWEEN", () => {
    const n = leaf("count", "BETWEEN");
    n.values = [
      { kind: "number", value: 1 },
      { kind: "number", value: 100 },
    ];
    expectRoundTrip(group([n]));
  });

  it("IN with strings", () => {
    const n = leaf("subject", "IN");
    n.values = [
      { kind: "string", value: "a" },
      { kind: "string", value: "b" },
    ];
    expectRoundTrip(group([n]));
  });

  it("IN with enum", () => {
    const n = leaf("urgency", "IN");
    n.values = [
      { kind: "enum", enumId: "IncUrgency", valueId: "high" },
      { kind: "enum", enumId: "IncUrgency", valueId: "low" },
    ];
    expectRoundTrip(group([n]));
  });
});

// --- Группы --------------------------------------------------------------

describe("round-trip: groups", () => {
  it("AND with two leaves", () => {
    expectRoundTrip(
      group([
        leaf("subject", "=", { kind: "string", value: "a" }),
        leaf("subject", "=", { kind: "string", value: "b" }),
      ]),
    );
  });

  it("OR with two leaves", () => {
    expectRoundTrip(
      group(
        [
          leaf("subject", "=", { kind: "string", value: "a" }),
          leaf("subject", "=", { kind: "string", value: "b" }),
        ],
        "OR",
      ),
    );
  });

  it("AND with nested OR", () => {
    expectRoundTrip(
      group([
        leaf("subject", "=", { kind: "string", value: "x" }),
        group(
          [
            leaf("urgency", "=", {
              kind: "enum",
              enumId: "IncUrgency",
              valueId: "high",
            }),
            leaf("urgency", "=", {
              kind: "enum",
              enumId: "IncUrgency",
              valueId: "low",
            }),
          ],
          "OR",
        ),
      ]),
    );
  });

  it("NOT on leaf", () => {
    expectRoundTrip(
      group([leaf("subject", "=", { kind: "string", value: "x" })], "NOT"),
    );
  });
});

// --- Связи ---------------------------------------------------------------

describe("round-trip: linkage", () => {
  it("exists", () => {
    expectRoundTrip(group([linkage("exists")]));
  });

  it("not-exists", () => {
    expectRoundTrip(group([linkage("not-exists")]));
  });

  it("entity-attribute with LIKE", () => {
    expectRoundTrip(
      group([
        linkage(
          "entity-attribute",
          leaf("value", "LIKE", { kind: "string", value: "%test%" }),
        ),
      ]),
    );
  });

  it("entity-attribute with IS NULL", () => {
    expectRoundTrip(
      group([linkage("entity-attribute", leaf("value", "IS NULL"))]),
    );
  });

  it("linkage-attribute with >", () => {
    const lk = linkage(
      "linkage-attribute",
      leaf("confidence", ">", { kind: "number", value: 50 }),
    );
    lk.targetEntityFqid = "";
    expectRoundTrip(group([lk]));
  });
});

// --- Комбинации ----------------------------------------------------------

describe("round-trip: combinations", () => {
  it("leaf AND linkage", () => {
    expectRoundTrip(
      group([
        leaf("subject", "=", { kind: "string", value: "x" }),
        linkage("exists"),
      ]),
    );
  });

  it("linkage with nested AND leaf with enum", () => {
    expectRoundTrip(
      group([
        linkage(
          "entity-attribute",
          leaf("value", "=", { kind: "string", value: "evil.com" }),
        ),
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "high",
        }),
      ]),
    );
  });

  it("OR of two linkages", () => {
    expectRoundTrip(group([linkage("exists"), linkage("not-exists")], "OR"));
  });

  it("NOT over linkage", () => {
    expectRoundTrip(group([linkage("exists")], "NOT"));
  });
});
