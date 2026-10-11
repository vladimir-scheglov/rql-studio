import { describe, it, expect } from "vitest";
import { getAvailableTransitions } from "./transitions";
import { buildPathRql } from "./build-rql";
import { buildSymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";
import type { PathModel } from "./types";

// =========================================================================
// Тестовая схема — воспроизводит пример из вопроса в упрощённом виде
// =========================================================================

const domain: DomainSchema = {
  id: "demo.audit",
  type: "domain",
  version: "1.0.0",
  name: "Audit",
  entities: [
    {
      id: "RequirementValues",
      attributes: [],
    },
    {
      id: "Audit",
      attributes: [
        {
          id: "scaleID",
          name: "Шкала",
          dataType: "Reference",
          entity: "Scale",
        },
      ],
    },
    {
      id: "Scale",
      attributes: [],
    },
    {
      id: "ScaleItem",
      attributes: [],
    },
  ],
  linkages: [
    {
      id: "Audits_RequirementValues",
      side1: "Audit",
      side2: "RequirementValues",
      type: "1_n",
      undirected: false,
      nameFrom: { side1: "requirement values", side2: "audit" },
    },
    {
      id: "Scale_ScaleItem",
      side1: "Scale",
      side2: "ScaleItem",
      type: "1_n",
      undirected: false,
      nameFrom: { side1: "items", side2: "scale" },
    },
  ],
};

const table = buildSymbolTable([domain]);

// =========================================================================
// getAvailableTransitions
// =========================================================================

describe("getAvailableTransitions", () => {
  it("находит linkage-переходы", () => {
    const transitions = getAvailableTransitions(
      "demo.audit/RequirementValues",
      table,
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0].kind).toBe("linkage");
    expect(transitions[0].targetEntityFqid).toBe("demo.audit/Audit");
  });

  it("находит reference-переходы", () => {
    const transitions = getAvailableTransitions("demo.audit/Audit", table);
    const refs = transitions.filter((t) => t.kind === "reference");
    expect(refs).toHaveLength(1);
    expect(refs[0].targetEntityFqid).toBe("demo.audit/Scale");
    expect(refs[0].attribute?.id).toBe("scaleID");
  });

  it("находит переходы обоих типов для одной сущности", () => {
    const transitions = getAvailableTransitions("demo.audit/Scale", table);
    expect(transitions.length).toBeGreaterThanOrEqual(1);
    expect(transitions.some((t) => t.kind === "linkage")).toBe(true);
  });
});

// =========================================================================
// buildPathRql
// =========================================================================

describe("buildPathRql", () => {
  it("генерирует RQL для пути из двух linkage-шагов", () => {
    const path: PathModel = {
      startEntityFqid: "demo.audit/RequirementValues",
      steps: [
        {
          id: "s1",
          kind: "linkage",
          linkageFqid: "demo.audit/Audits_RequirementValues",
          fromSide: "2",
          fromEntityFqid: "demo.audit/RequirementValues",
          toEntityFqid: "demo.audit/Audit",
        },
      ],
    };

    const { rql, error } = buildPathRql(path, table, "demo.audit");
    expect(error).toBeUndefined();
    expect(rql).toContain("SELECT array_agg");
    expect(rql).toContain("FROM('demo.audit', @Audit");
    expect(rql).toContain("join('demo.audit', @Audits_RequirementValues");
    expect(rql).toContain("WHERE");
    expect(rql).toContain("@doc.id");
  });

  it("генерирует RQL для пути linkage + reference + linkage", () => {
    const path: PathModel = {
      startEntityFqid: "demo.audit/RequirementValues",
      steps: [
        {
          id: "s1",
          kind: "linkage",
          linkageFqid: "demo.audit/Audits_RequirementValues",
          fromSide: "2",
          fromEntityFqid: "demo.audit/RequirementValues",
          toEntityFqid: "demo.audit/Audit",
        },
        {
          id: "s2",
          kind: "reference",
          attributeId: "scaleID",
          fromEntityFqid: "demo.audit/Audit",
          toEntityFqid: "demo.audit/Scale",
        },
        {
          id: "s3",
          kind: "linkage",
          linkageFqid: "demo.audit/Scale_ScaleItem",
          fromSide: "1",
          fromEntityFqid: "demo.audit/Scale",
          toEntityFqid: "demo.audit/ScaleItem",
        },
      ],
    };

    const { rql, error } = buildPathRql(path, table, "demo.audit");
    expect(error).toBeUndefined();

    // FROM — на ScaleItem
    expect(rql).toContain("@ScaleItem");

    // Три join'а — Scale_ScaleItem, Audit, Audits_RequirementValues
    const joinsCount = (rql.match(/join\(/g) ?? []).length;
    expect(joinsCount).toBe(3);

    // WHERE связывает с @doc
    expect(rql).toContain("@doc.id");

    // ScaleItem идёт через linkage side2 (в обратную сторону)
    expect(rql).toContain("side2");
  });

  it("возвращает ошибку для пустого пути", () => {
    const path: PathModel = {
      startEntityFqid: "demo.audit/RequirementValues",
      steps: [],
    };
    const { rql, error } = buildPathRql(path, table, "demo.audit");
    expect(error).toBeDefined();
    expect(rql).toBe("");
  });
});
