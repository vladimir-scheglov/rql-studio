import { describe, it, expect } from "vitest";
import { describeCondition } from "./describe";
import { buildSymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";
import type { GroupNode, LeafNode } from "./types";

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
      ],
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
};

const table = buildSymbolTable([domain]);
const entityFqid = "test.domain/Incident";

function leaf(attr: string, op: any, value?: any): LeafNode {
  return {
    id: "l1",
    kind: "leaf",
    attribute: attr,
    operator: op,
    value: value ?? null,
    values: [],
  };
}

describe("describeCondition", () => {
  it("простое сравнение", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [leaf("subject", "=", { kind: "string", value: "test" })],
    };
    const text = describeCondition(root, table, "test.domain", entityFqid);
    expect(text).toContain("Тема: «test»");
  });

  it("enum-значение — берём name", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "high",
        }),
      ],
    };
    const text = describeCondition(root, table, "test.domain", entityFqid);
    expect(text).toContain("Высокая");
    expect(text).not.toContain("high");
  });

  it("AND из двух условий", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [
        leaf("subject", "=", { kind: "string", value: "a" }),
        leaf("subject", "=", { kind: "string", value: "b" }),
      ],
    };
    const text = describeCondition(root, table, "test.domain", entityFqid);
    expect(text).toContain("Все условия");
    expect(text.split("\n").length).toBeGreaterThan(2);
  });

  it("OR однотипных условий схлопывается в одну строку", () => {
    const inner: GroupNode = {
      id: "g2",
      kind: "group",
      operator: "OR",
      children: [
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
    };
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [
        leaf("subject", "LIKE", { kind: "string", value: "%urgent%" }),
        inner,
      ],
    };
    const text = describeCondition(root, table, "test.domain", entityFqid);
    expect(text).toContain("Все условия");
    expect(text).toContain("Срочность: «Высокая» или «Низкая»");
    expect(text).not.toContain("Хотя бы одно");
  });

  it("OR разнотипных условий не схлопывается", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "OR",
      children: [
        leaf("subject", "=", { kind: "string", value: "a" }),
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "high",
        }),
      ],
    };
    const text = describeCondition(root, table, "test.domain", entityFqid);
    expect(text).toContain("Хотя бы одно");
  });
});

it("= через двоеточие", () => {
  const root: GroupNode = {
    id: "g",
    kind: "group",
    operator: "AND",
    children: [leaf("subject", "=", { kind: "string", value: "test" })],
  };
  const text = describeCondition(root, table, "test.domain", entityFqid);
  expect(text).toContain("Тема: «test»");
});

it("enum через двоеточие", () => {
  const root: GroupNode = {
    id: "g",
    kind: "group",
    operator: "AND",
    children: [
      leaf("urgency", "=", {
        kind: "enum",
        enumId: "IncUrgency",
        valueId: "high",
      }),
    ],
  };
  const text = describeCondition(root, table, "test.domain", entityFqid);
  expect(text).toContain("Срочность: «Высокая»");
});

it("OR однотипных LIKE схлопывается", () => {
  const root: GroupNode = {
    id: "g",
    kind: "group",
    operator: "OR",
    children: [
      leaf("subject", "LIKE", { kind: "string", value: "%a%" }),
      leaf("subject", "LIKE", { kind: "string", value: "%b%" }),
    ],
  };
  const text = describeCondition(root, table, "test.domain", entityFqid);
  expect(text).toContain("Тема содержит «%a%» или «%b%»");
  expect(text).not.toContain("Хотя бы одно");
});

it("OR разнотипных условий не схлопывается", () => {
  const root: GroupNode = {
    id: "g",
    kind: "group",
    operator: "OR",
    children: [
      leaf("subject", "=", { kind: "string", value: "a" }),
      leaf("urgency", "=", {
        kind: "enum",
        enumId: "IncUrgency",
        valueId: "high",
      }),
    ],
  };
  const text = describeCondition(root, table, "test.domain", entityFqid);
  expect(text).toContain("Хотя бы одно");
});