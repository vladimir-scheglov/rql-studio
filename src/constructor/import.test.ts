import { describe, it, expect } from "vitest";
import { importFromRql } from "./import";
import { parseRql } from "../rql/parser";
import { buildSymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";

const domain: DomainSchema = {
  id: "test.domain",
  type: "domain",
  version: "1.0.0",
  name: "Test",
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
  entities: [
    {
      id: "Incident",
      attributes: [
        { id: "subject", dataType: "String" },
        { id: "urgency", dataType: "IncUrgency" },
        { id: "createdAt", dataType: "Timestamp" },
      ],
    },
    {
      id: "Ioc",
      attributes: [
        { id: "value", dataType: "String" },
        { id: "type", dataType: "String" },
      ],
    },
  ],
  dataTypes: [
    {
      id: "IncUrgency",
      dataType: "Enum",
      values: [{ id: "high" }, { id: "low" }],
    },
  ],
};

const table = buildSymbolTable([domain]);

function run(rql: string) {
  const { ast, parseErrors } = parseRql(`!rql ${rql}`);
  if (!ast || parseErrors.length > 0) throw new Error("parse failed");
  return importFromRql(ast, table, "test.domain", "test.domain/Incident");
}

describe("importFromRql", () => {
  it("простое сравнение", () => {
    const { root, errors } = run("subject = 'test'");
    expect(errors).toEqual([]);
    expect(root).not.toBeNull();
    expect(root!.children).toHaveLength(1);
    const leaf = root!.children[0];
    expect(leaf.kind).toBe("leaf");
    if (leaf.kind === "leaf") {
      expect(leaf.attribute).toBe("subject");
      expect(leaf.operator).toBe("=");
      expect(leaf.value).toEqual({ kind: "string", value: "test" });
    }
  });

  it("AND из двух условий", () => {
    const { root, errors } = run(
      "subject = 'a' AND urgency = @IncUrgency.high",
    );
    expect(errors).toEqual([]);
    expect(root!.operator).toBe("AND");
    expect(root!.children).toHaveLength(2);
  });

  it("OR внутри AND", () => {
    const { root, errors } = run(
      "subject = 'a' AND (urgency = @IncUrgency.high OR urgency = @IncUrgency.low)",
    );
    expect(errors).toEqual([]);
    expect(root!.operator).toBe("AND");
    expect(root!.children).toHaveLength(2);
    const inner = root!.children[1];
    expect(inner.kind).toBe("group");
    if (inner.kind === "group") {
      expect(inner.operator).toBe("OR");
      expect(inner.children).toHaveLength(2);
    }
  });

  it("IN с массивом", () => {
    const { root, errors } = run("subject IN SELECT(UNNEST(ARRAY('a', 'b')))");
    expect(errors).toEqual([]);
    const leaf = root!.children[0];
    if (leaf.kind === "leaf") {
      expect(leaf.operator).toBe("IN");
      expect(leaf.values).toHaveLength(2);
    }
  });

  it("IS NULL", () => {
    const { root, errors } = run("subject IS NULL");
    expect(errors).toEqual([]);
    const leaf = root!.children[0];
    if (leaf.kind === "leaf") {
      expect(leaf.operator).toBe("IS NULL");
    }
  });

  it("NOT", () => {
    const { root, errors } = run("NOT subject = 'x'");
    expect(errors).toEqual([]);
    expect(root!.operator).toBe("NOT");
    expect(root!.children).toHaveLength(1);
    const inner = root!.children[0];
    expect(inner.kind).toBe("leaf");
  });

  it("неподдерживаемое выражение — ошибка", () => {
    const { root, errors } = run("count(subject) > 5");
    // count — не поддерживается как leaf
    expect(errors.length).toBeGreaterThan(0);
    expect(root).toBeNull();
  });
});

describe("importFromRql / linkage", () => {
  it("exists", () => {
    const rql = `SELECT(count(id), FROM('current', @Incident_Ioc, @link_Incident_Ioc), WHERE(eq(@link_Incident_Ioc.side1, @doc.id))) > 0`;
    const { root, errors } = run(rql);
    expect(errors).toEqual([]);
    expect(root).not.toBeNull();

    const node = root!.children[0];
    expect(node.kind).toBe("linkage");
    if (node.kind === "linkage") {
      expect(node.mode).toBe("exists");
      expect(node.side).toBe("1");
      expect(node.linkageFqid).toContain("Incident_Ioc");
    }
  });

  it("not-exists", () => {
    const rql = `SELECT(count(id), FROM('current', @Incident_Ioc, @link_Incident_Ioc), WHERE(eq(@link_Incident_Ioc.side1, @doc.id))) = 0`;
    const { root, errors } = run(rql);
    expect(errors).toEqual([]);
    const node = root!.children[0];
    if (node.kind === "linkage") {
      expect(node.mode).toBe("not-exists");
    } else {
      throw new Error("not a linkage");
    }
  });

  it("entity-attribute", () => {
    const rql = `SELECT join('current', @Incident_Ioc, @link_Incident_Ioc, ON(eq(@link_Incident_Ioc.side1, @doc.id))), join('current', @Ioc, @e_Incident_Ioc, ON(eq(@link_Incident_Ioc.side2, @e_Incident_Ioc.id))) WHERE @e_Incident_Ioc.value LIKE '%test%'`;
    const { root, errors } = run(rql);
    expect(errors).toEqual([]);
    const node = root!.children[0];
    expect(node.kind).toBe("linkage");
    if (node.kind === "linkage") {
      expect(node.mode).toBe("entity-attribute");
      expect(node.nested?.attribute).toBe("value");
      expect(node.nested?.operator).toBe("LIKE");
      expect(node.targetEntityFqid).toContain("Ioc");
    }
  });

  it("linkage-attribute", () => {
    const rql = `SELECT join('current', @Incident_Ioc, @link_Incident_Ioc, ON(eq(@link_Incident_Ioc.side1, @doc.id))) WHERE @link_Incident_Ioc.id = 'abc'`;
    const { root, errors } = run(rql);
    expect(errors).toEqual([]);
    const node = root!.children[0];
    if (node.kind === "linkage") {
      expect(node.mode).toBe("linkage-attribute");
      expect(node.nested?.attribute).toBe("id");
    } else {
      throw new Error("not a linkage");
    }
  });
});