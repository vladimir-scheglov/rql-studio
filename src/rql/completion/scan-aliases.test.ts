import { describe, it, expect } from "vitest";
import { scanAliases } from "./scan-aliases";
import { buildSymbolTable } from "../../schema/symbol-table";
import type { DomainSchema } from "../../schema/types";

const domain: DomainSchema = {
  id: "test.domain",
  type: "domain",
  version: "1.0.0",
  name: "Test",
  entities: [
    { id: "Incident", attributes: [{ id: "subject", dataType: "String" }] },
    { id: "Ioc", attributes: [{ id: "value", dataType: "String" }] },
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

describe("scanAliases", () => {
  it("находит @e_X как сущность", () => {
    const text = `SELECT join('current', @Ioc, @e_Incident_Ioc, ON(...))`;
    const aliases = scanAliases(text, table, "test.domain");
    const e = aliases.find((a) => a.alias === "@e_Incident_Ioc");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("entity");
    expect(e!.entityFqid).toBe("test.domain/Ioc");
  });

  it("находит @link_X как связь", () => {
    const text = `SELECT join('current', @Incident_Ioc, @link_Incident_Ioc, ON(...))`;
    const aliases = scanAliases(text, table, "test.domain");
    const l = aliases.find((a) => a.alias === "@link_Incident_Ioc");
    expect(l).toBeDefined();
    expect(l!.kind).toBe("linkage");
    expect(l!.linkageFqid).toBe("test.domain/Incident_Ioc");
  });

  it("находит все псевдонимы: source + alias для каждой связи", () => {
    const text = `SELECT join('current', @Incident_Ioc, @link_Incident_Ioc, ON(...)), join('current', @Ioc, @e_Incident_Ioc, ON(...))`;
    const aliases = scanAliases(text, table, "test.domain");
    expect(aliases.length).toBe(4);

    const names = aliases.map((a) => a.alias).sort();
    expect(names).toEqual([
      "@Incident_Ioc",
      "@Ioc",
      "@e_Incident_Ioc",
      "@link_Incident_Ioc",
    ]);
  });

  it("оба псевдонима одной связи указывают на неё", () => {
    const text = `SELECT join('current', @Incident_Ioc, @link_Incident_Ioc, ON(...))`;
    const aliases = scanAliases(text, table, "test.domain");

    const source = aliases.find((a) => a.alias === "@Incident_Ioc");
    const alias = aliases.find((a) => a.alias === "@link_Incident_Ioc");

    expect(source?.linkageFqid).toBe("test.domain/Incident_Ioc");
    expect(alias?.linkageFqid).toBe("test.domain/Incident_Ioc");
  });
});
