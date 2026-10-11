import { describe, it, expect } from "vitest";
import { validateTree, countIssues } from "./validate";
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
        { id: "subject", dataType: "String" },
        { id: "urgency", dataType: "IncUrgency" },
        { id: "count", dataType: "Integer" },
        { id: "tags", dataType: "Array", item: { dataType: "String" } },
      ],
    },
    {
      id: "Ioc",
      name: "Индикатор",
      attributes: [{ id: "value", dataType: "String" }],
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
      attributes: [{ id: "confidence", dataType: "Integer" }],
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
  operator: LeafNode["operator"] = "=",
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
  opts: Partial<LinkageNode> = {},
): LinkageNode {
  return {
    id: nextId("lk"),
    kind: "linkage",
    linkageFqid: "test.domain/Incident_Ioc",
    side: "1",
    targetEntityFqid: "test.domain/Ioc",
    mode,
    nested: null,
    ...opts,
  };
}

function run(root: ConditionNode) {
  return validateTree(root, table, domainId, entityFqid);
}

// --- Валидные деревья ----------------------------------------------------

describe("validateTree: valid trees", () => {
  it("пустое дерево — без проблем", () => {
    expect(run(group([])).size).toBe(0);
  });

  it("простое валидное условие", () => {
    expect(
      run(group([leaf("subject", "=", { kind: "string", value: "test" })]))
        .size,
    ).toBe(0);
  });

  it("AND из двух валидных условий", () => {
    expect(
      run(
        group([
          leaf("subject", "=", { kind: "string", value: "a" }),
          leaf("count", ">", { kind: "number", value: 5 }),
        ]),
      ).size,
    ).toBe(0);
  });

  it("enum-значение валидно", () => {
    expect(
      run(
        group([
          leaf("urgency", "=", {
            kind: "enum",
            enumId: "IncUrgency",
            valueId: "high",
          }),
        ]),
      ).size,
    ).toBe(0);
  });

  it("linkage exists валиден", () => {
    expect(run(group([linkage("exists")])).size).toBe(0);
  });

  it("entity-attribute с валидным атрибутом", () => {
    expect(
      run(
        group([
          linkage("entity-attribute", {
            nested: leaf("value", "LIKE", { kind: "string", value: "%test%" }),
          }),
        ]),
      ).size,
    ).toBe(0);
  });

  it("linkage-attribute с валидным атрибутом связи", () => {
    expect(
      run(
        group([
          linkage("linkage-attribute", {
            nested: leaf("confidence", ">", { kind: "number", value: 50 }),
          }),
        ]),
      ).size,
    ).toBe(0);
  });
});

// --- Атрибуты ------------------------------------------------------------

describe("validateTree: attribute issues", () => {
  it("пустой атрибут — warning", () => {
    const issues = run(group([leaf("", "=")]));
    expect(issues.size).toBe(1);
    const list = [...issues.values()][0];
    expect(list[0].severity).toBe("warning");
    expect(list[0].message).toContain("не выбран");
  });

  it("несуществующий атрибут — error", () => {
    const issues = run(
      group([leaf("wrongName", "=", { kind: "string", value: "x" })]),
    );
    expect(issues.size).toBe(1);
    const list = [...issues.values()][0];
    expect(list[0].severity).toBe("error");
    expect(list[0].message).toContain("wrongName");
  });

  it("несуществующий атрибут у связанной сущности — error", () => {
    const issues = run(
      group([
        linkage("entity-attribute", {
          nested: leaf("nonexistent", "=", { kind: "string", value: "x" }),
        }),
      ]),
    );
    // Ошибка должна быть привязана к nested (leaf), не к linkage
    expect(issues.size).toBe(1);
    const list = [...issues.values()][0];
    expect(list[0].severity).toBe("error");
  });

  it("несуществующий атрибут связи — error", () => {
    const issues = run(
      group([
        linkage("linkage-attribute", {
          nested: leaf("wrongattr", "=", { kind: "string", value: "x" }),
        }),
      ]),
    );
    expect(issues.size).toBe(1);
    const list = [...issues.values()][0];
    expect(list[0].severity).toBe("error");
  });
});

// --- Значения enum -------------------------------------------------------

describe("validateTree: enum value issues", () => {
  it("несуществующее значение enum — error", () => {
    const issues = run(
      group([
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "wrong",
        }),
      ]),
    );
    const all = [...issues.values()].flat();
    expect(
      all.some((i) => i.severity === "error" && i.message.includes("wrong")),
    ).toBe(true);
  });

  it("валидное значение enum — без проблем", () => {
    expect(
      run(
        group([
          leaf("urgency", "=", {
            kind: "enum",
            enumId: "IncUrgency",
            valueId: "high",
          }),
        ]),
      ).size,
    ).toBe(0);
  });

  it("несуществующее значение в IN — error", () => {
    const n = leaf("urgency", "IN");
    n.values = [
      { kind: "enum", enumId: "IncUrgency", valueId: "high" },
      { kind: "enum", enumId: "IncUrgency", valueId: "wrong" },
    ];
    const issues = run(group([n]));
    const all = [...issues.values()].flat();
    expect(
      all.some((i) => i.severity === "error" && i.message.includes("wrong")),
    ).toBe(true);
  });
});

// --- Связи ---------------------------------------------------------------

describe("validateTree: linkage issues", () => {
  it("linkage без FQID — warning", () => {
    const issues = run(group([linkage("exists", { linkageFqid: "" })]));
    const all = [...issues.values()].flat();
    expect(all[0].severity).toBe("warning");
    expect(all[0].message).toContain("не выбрана");
  });

  it("несуществующая связь — error", () => {
    const issues = run(
      group([linkage("exists", { linkageFqid: "test.domain/WrongLink" })]),
    );
    const all = [...issues.values()].flat();
    expect(all[0].severity).toBe("error");
    expect(all[0].message).toContain("WrongLink");
  });

  it("entity-attribute без targetEntityFqid — error", () => {
    const issues = run(
      group([
        linkage("entity-attribute", {
          targetEntityFqid: "",
          nested: leaf("value", "=", { kind: "string", value: "x" }),
        }),
      ]),
    );
    const all = [...issues.values()].flat();
    expect(
      all.some(
        (i) => i.severity === "error" && i.message.includes("целевая сущность"),
      ),
    ).toBe(true);
  });

  it("entity-attribute с несуществующей сущностью — error", () => {
    const issues = run(
      group([
        linkage("entity-attribute", {
          targetEntityFqid: "test.domain/Wrong",
          nested: leaf("value", "=", { kind: "string", value: "x" }),
        }),
      ]),
    );
    const all = [...issues.values()].flat();
    expect(
      all.some((i) => i.severity === "error" && i.message.includes("Wrong")),
    ).toBe(true);
  });
});

// --- Вложенные группы ----------------------------------------------------

describe("validateTree: nested groups", () => {
  it("проблемы находятся во вложенных группах", () => {
    const issues = run(
      group([
        leaf("subject", "=", { kind: "string", value: "x" }),
        group([leaf("wrongName", "=", { kind: "string", value: "y" })], "OR"),
      ]),
    );
    expect(issues.size).toBe(1);
  });

  it("несколько проблем — все в карте", () => {
    const issues = run(
      group([
        leaf("wrong1", "=", { kind: "string", value: "a" }),
        leaf("wrong2", "=", { kind: "string", value: "b" }),
      ]),
    );
    expect(issues.size).toBe(2);
  });
});

// --- countIssues ---------------------------------------------------------

describe("countIssues", () => {
  it("пустая карта — нули", () => {
    expect(countIssues(new Map())).toEqual({
      errors: 0,
      warnings: 0,
      total: 0,
    });
  });

  it("подсчёт errors и warnings", () => {
    const issues = run(
      group([
        leaf("", "="), // warning
        leaf("wrong", "=", { kind: "string", value: "x" }), // error
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "wrong",
        }), // error
      ]),
    );
    const c = countIssues(issues);
    expect(c.errors).toBe(2);
    expect(c.warnings).toBe(1);
    expect(c.total).toBe(3);
  });
});
