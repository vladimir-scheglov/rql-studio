import { describe, it, expect } from "vitest";
import { serializeCondition, serializeValue } from "./serialize";
import { buildSymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";
import type { GroupNode, LeafNode, LinkageNode } from "./types";

// Минимальная схема для тестов
const domain: DomainSchema = {
  id: "test.domain",
  type: "domain",
  version: "1.0.0",
  name: "Test",
  entities: [
    {
      id: "Incident",
      attributes: [
        { id: "subject", dataType: "String" },
        { id: "urgency", dataType: "IncUrgency" },
        { id: "id", dataType: "Identifier" },
      ],
    },
    {
      id: "Ioc",
      attributes: [
        { id: "value", dataType: "String" },
        { id: "type", dataType: "enumIocTypes" },
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
    {
      id: "enumIocTypes",
      dataType: "Enum",
      values: [
        { id: "Account", name: "Аккаунт" },
        { id: "File", name: "Файл" },
      ],
    },
  ],
  linkages: [
    {
      id: "Incident_Ioc",
      side1: "Incident",
      side2: "Ioc",
      type: "n_n",
      undirected: true,
      nameFrom: { side1: "содержит", side2: "связан" },
    },
  ],
};

const table = buildSymbolTable([domain]);

function leaf(attr: string, op: LeafNode["operator"], value?: any): LeafNode {
  return {
    id: "l1",
    kind: "leaf",
    attribute: attr,
    operator: op,
    value: value ?? null,
    values: [],
  };
}

describe("serializeCondition", () => {
  it("пустая группа — пустая строка", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [],
    };
    expect(serializeCondition(root, table)).toBe("");
  });

  it("одиночный leaf с простым значением", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [leaf("subject", "=", { kind: "string", value: "test" })],
    };
    expect(serializeCondition(root, table)).toBe("subject = 'test'");
  });

  it("два leaf через AND", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [
        leaf("subject", "=", { kind: "string", value: "test" }),
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "high",
        }),
      ],
    };
    expect(serializeCondition(root, table)).toBe(
      "subject = 'test' AND urgency = @IncUrgency.high",
    );
  });

  it("вложенная группа OR внутри AND", () => {
    const inner: GroupNode = {
      id: "g2",
      kind: "group",
      operator: "OR",
      children: [
        leaf("subject", "=", { kind: "string", value: "a" }),
        leaf("subject", "=", { kind: "string", value: "b" }),
      ],
    };
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
        inner,
      ],
    };
    expect(serializeCondition(root, table)).toBe(
      "urgency = @IncUrgency.high AND (subject = 'a' OR subject = 'b')",
    );
  });

  it("IS NULL", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [leaf("subject", "IS NULL")],
    };
    expect(serializeCondition(root, table)).toBe("subject IS NULL");
  });

  it("LIKE со спецсимволами", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [leaf("subject", "LIKE", { kind: "string", value: "%test%" })],
    };
    expect(serializeCondition(root, table)).toBe("subject LIKE '%test%'");
  });

  it("escape одинарной кавычки в значении", () => {
    expect(serializeValue({ kind: "string", value: "It's" })).toBe("'It''s'");
  });

  it("пустой leaf — пропускается", () => {
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [leaf("subject", "=")],
    };
    expect(serializeCondition(root, table)).toBe("");
  });
});

describe("serializeCondition / linkage", () => {
  it("exists", () => {
    const node: LinkageNode = {
      id: "lk",
      kind: "linkage",
      linkageFqid: "test.domain/Incident_Ioc",
      side: "1",
      targetEntityFqid: "test.domain/Ioc",
      mode: "exists",
      nested: null,
    };
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [node],
    };
    expect(serializeCondition(root, table)).toBe(
      "SELECT(count(id), FROM('current', @Incident_Ioc, @link_Incident_Ioc), WHERE(eq(@link_Incident_Ioc.side1, @doc.id))) > 0",
    );
  });

  it("not-exists", () => {
    const node: LinkageNode = {
      id: "lk",
      kind: "linkage",
      linkageFqid: "test.domain/Incident_Ioc",
      side: "1",
      targetEntityFqid: "test.domain/Ioc",
      mode: "not-exists",
      nested: null,
    };
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [node],
    };
    expect(serializeCondition(root, table)).toBe(
      "SELECT(count(id), FROM('current', @Incident_Ioc, @link_Incident_Ioc), WHERE(eq(@link_Incident_Ioc.side1, @doc.id))) = 0",
    );
  });

  it("entity-attribute", () => {
    const node: LinkageNode = {
      id: "lk",
      kind: "linkage",
      linkageFqid: "test.domain/Incident_Ioc",
      side: "1",
      targetEntityFqid: "test.domain/Ioc",
      mode: "entity-attribute",
      nested: leaf("value", "LIKE", { kind: "string", value: "%test%" }),
    };
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [node],
    };
    const result = serializeCondition(root, table);
    expect(result).toContain(
      "join('current', @Incident_Ioc, @link_Incident_Ioc, ON(eq(@link_Incident_Ioc.side1, @doc.id)))",
    );
    expect(result).toContain(
      "join('current', @Ioc, @e_Incident_Ioc, ON(eq(@link_Incident_Ioc.side2, @e_Incident_Ioc.id)))",
    );
    expect(result).toContain("WHERE @e_Incident_Ioc.value LIKE '%test%'");
  });

  it("linkage без FQID — пропускается", () => {
    const node: LinkageNode = {
      id: "lk",
      kind: "linkage",
      linkageFqid: "",
      side: "1",
      targetEntityFqid: "",
      mode: "exists",
      nested: null,
    };
    const root: GroupNode = {
      id: "g",
      kind: "group",
      operator: "AND",
      children: [node],
    };
    expect(serializeCondition(root, table)).toBe("");
  });
});
