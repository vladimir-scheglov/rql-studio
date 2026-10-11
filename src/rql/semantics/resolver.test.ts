import { describe, it, expect } from "vitest";
import { parseRql } from "../parser";
import { resolveAst } from "./resolver";
import { buildSymbolTable } from "../../schema/symbol-table";
import type { DomainSchema } from "../../schema/types";

const domain: DomainSchema = {
  id: "iocs.test",
  type: "domain",
  version: "1.0.0",
  name: "IOCs",
  entities: [
    {
      id: "Incident",
      attributes: [
        { id: "subject", dataType: "String" },
        { id: "urgency", dataType: "IncUrgency" },
        {
          id: "tags",
          dataType: "Array",
          item: { dataType: "String" },
        },
      ],
    },
    {
      id: "Ioc",
      attributes: [{ id: "value", dataType: "String" }],
    },
  ],
  dataTypes: [
    {
      id: "IncUrgency",
      dataType: "Enum",
      values: [{ id: "high" }, { id: "low" }],
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

function run(rql: string, entityFqid = "iocs.test/Incident") {
  const { ast, parseErrors } = parseRql(`!rql ${rql}`);
  if (parseErrors.length > 0 || !ast) {
    throw new Error(
      `Parse failed: ${parseErrors.map((e: any) => e.message).join(", ")}`,
    );
  }
  return resolveAst(ast, {
    symbolTable: table,
    entityFqid,
    domain: "iocs.test",
  });
}

describe("resolver / aliases", () => {
  it("валидный @doc.attribute — без ошибок", () => {
    expect(run("@doc.subject = 'test'")).toHaveLength(0);
  });

  it("опечатка в атрибуте — ошибка с quick fix", () => {
    const diags = run("@doc.subjec = 'test'");
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain('нет атрибута "subjec"');
    expect(diags[0].quickFixes?.[0].replacement).toBe("@doc.subject");
  });

  it("неизвестный псевдоним — warning без quick fix", () => {
    const diags = run("@unknown.id = 1");
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].quickFixes).toBeUndefined();
  });

  it("значение enum — валидное", () => {
    expect(run("@doc.urgency = @IncUrgency.high")).toHaveLength(0);
  });

  it("значение enum — опечатка с quick fix", () => {
    const diags = run("@doc.urgency = @IncUrgency.hihg");
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('нет значения "hihg"');
    expect(
      diags[0].quickFixes?.some((f) => f.replacement === "@IncUrgency.high"),
    ).toBe(true);
  });

  it("системные псевдонимы — без ошибок", () => {
    expect(run("@CurrentUser.username = 'admin'")).toHaveLength(0);
    expect(run("@CurrentDate >= '2025-01-01'")).toHaveLength(0);
  });
});

describe("resolver / calls", () => {
  it("валидная функция — без ошибок", () => {
    expect(run("hasRole('admin')")).toHaveLength(0);
  });

  it("опечатка в функции — warning с quick fix", () => {
    const diags = run("hasRol('admin')");
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].message).toContain('Неизвестная функция "hasRol"');
    expect(diags[0].quickFixes?.some((f) => f.replacement === "hasRole")).toBe(
      true,
    );
  });

  it("слишком мало аргументов — ошибка", () => {
    const diags = run("hasRole()");
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("минимум 1");
  });

  it("слишком много аргументов — ошибка", () => {
    const diags = run("hasRole('a', 'b')");
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("не более 1");
  });
});

describe("resolver / linkage scope", () => {
  const bigQuery = `
    SELECT
      join('current', @Incident_Ioc, @link_Incident_Ioc,
           ON(eq(@link_Incident_Ioc.side1, @doc.id))),
      join('current', @Ioc, @e_Incident_Ioc,
           ON(eq(@link_Incident_Ioc.side2, @e_Incident_Ioc.id)))
    WHERE @e_Incident_Ioc.value LIKE '%test%'
  `;

  it("валидный запрос со связями — без ошибок", () => {
    expect(run(bigQuery)).toHaveLength(0);
  });

  it("опечатка в атрибуте связанной сущности", () => {
    const query = bigQuery.replace(
      "@e_Incident_Ioc.value",
      "@e_Incident_Ioc.valu",
    );
    const diags = run(query);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('нет атрибута "valu"');
    expect(diags[0].quickFixes?.[0].replacement).toBe("@e_Incident_Ioc.value");
  });

  it("опечатка в атрибуте связи", () => {
    const query = bigQuery.replace("side1", "side3");
    const diags = run(query);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(
      'У связи "Incident_Ioc" нет атрибута "side3"',
    );
  });

  it("валидный системный атрибут связи — без ошибок", () => {
    expect(run(bigQuery)).toHaveLength(0);
  });

  it("сравнение атрибута связанной сущности со строкой — валидно", () => {
    const query = bigQuery.replace(
      "@e_Incident_Ioc.value",
      "@e_Incident_Ioc.value = 'a'",
    );
    // Убираем дублирование: заменяем всю WHERE-часть
    const q = `
    SELECT
      join('current', @Incident_Ioc, @link_Incident_Ioc,
           ON(eq(@link_Incident_Ioc.side1, @doc.id))),
      join('current', @Ioc, @e_Incident_Ioc,
           ON(eq(@link_Incident_Ioc.side2, @e_Incident_Ioc.id)))
    WHERE @e_Incident_Ioc.value = 'test'
  `;
    expect(run(q)).toHaveLength(0);
  });

  it("сравнение string-атрибута связанной сущности с числом — ошибка", () => {
    const q = `
    SELECT
      join('current', @Incident_Ioc, @link_Incident_Ioc,
           ON(eq(@link_Incident_Ioc.side1, @doc.id))),
      join('current', @Ioc, @e_Incident_Ioc,
           ON(eq(@link_Incident_Ioc.side2, @e_Incident_Ioc.id)))
    WHERE @e_Incident_Ioc.value = 42
  `;
    const diags = run(q);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Несовместимые типы");
  });

  it("системный атрибут связи side1 сравнивается со строкой — валидно", () => {
    // side1 — Reference, сравним со строкой (id объекта)
    const q = `
    SELECT join('current', @Incident_Ioc, @link_Incident_Ioc,
                ON(eq(@link_Incident_Ioc.side1, @doc.id)))
    WHERE @link_Incident_Ioc.side1 = 'some-id'
  `;
    expect(run(q)).toHaveLength(0);
  });

  it("системный атрибут связи createdAt сравнивается со строкой — валидно", () => {
    const q = `
    SELECT join('current', @Incident_Ioc, @link_Incident_Ioc,
                ON(eq(@link_Incident_Ioc.side1, @doc.id)))
    WHERE @link_Incident_Ioc.createdAt >= '2025-01-01'
  `;
    expect(run(q)).toHaveLength(0);
  });

  it("системный атрибут связи createdAt сравнивается с числом — ошибка", () => {
    const q = `
    SELECT join('current', @Incident_Ioc, @link_Incident_Ioc,
                ON(eq(@link_Incident_Ioc.side1, @doc.id)))
    WHERE @link_Incident_Ioc.createdAt = 42
  `;
    const diags = run(q);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Несовместимые типы");
  });
});

describe("resolver / типы", () => {
  it("сравнение строки с числом — ошибка", () => {
    const diags = run("@doc.subject = 42");
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Несовместимые типы");
  });

  it("сравнение enum с числом — ошибка", () => {
    const diags = run("@doc.urgency = 42");
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Несовместимые типы");
  });
});

describe("resolver / IN и BETWEEN", () => {
  it("IN с несовместимым типом — warning", () => {
    const diags = run("@doc.subject IN SELECT(UNNEST(ARRAY(42, 43)))");
    // Если у тебя правило ещё не подключено — тест покажет
    expect(diags.length).toBeGreaterThan(0);
  });

  it("BETWEEN с несовместимым типом — warning", () => {
    const diags = run("@doc.subject BETWEEN 1 AND 100");
    expect(diags.length).toBeGreaterThan(0);
  });

  it("has() на скалярном атрибуте — warning", () => {
    const diags = run("has(@doc.subject, 'x')");
    expect(diags.length).toBeGreaterThan(0);
  });
});

describe("resolver / has()", () => {
  it("has() на массивном атрибуте с совместимым значением — без ошибок", () => {
    // Предполагаем, что в тестовой схеме есть атрибут-массив строк
    // Если его нет, добавь в entities.Incident: { id: 'tags', dataType: 'Array', item: { dataType: 'String' } }
    const diags = run("has(@doc.tags, 'urgent')");
    expect(diags).toHaveLength(0);
  });

  it("has() на скалярном атрибуте — warning", () => {
    const diags = run("has(@doc.subject, 'x')");
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].message).toContain("ожидает массив");
  });

  it("has() с несовместимым типом элемента — warning", () => {
    const diags = run("has(@doc.tags, 42)");
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some((d) => d.message.includes("Несовместимые типы"))).toBe(
      true,
    );
  });
});

describe("resolver / IN", () => {
  it("IN с совместимыми типами — без ошибок", () => {
    const diags = run("@doc.subject IN SELECT(UNNEST(ARRAY('a', 'b')))");
    expect(diags).toHaveLength(0);
  });

  it("IN с числом при string-атрибуте — warning", () => {
    const diags = run("@doc.subject IN SELECT(UNNEST(ARRAY(42, 43)))");
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].message).toContain("Несовместимые типы в IN");
  });

  it("IN с enum и правильными значениями — без ошибок", () => {
    const diags = run(
      "@doc.urgency IN SELECT(UNNEST(ARRAY(@IncUrgency.high, @IncUrgency.low)))",
    );
    expect(diags).toHaveLength(0);
  });

  it("IN с enum и числом — warning", () => {
    const diags = run("@doc.urgency IN SELECT(UNNEST(ARRAY(42, 43)))");
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Несовместимые типы");
  });
});