import { describe, it, expect } from "vitest";
import { buildDataRuleYaml } from "./export-yaml";
import { buildSymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";
import type { GroupNode, LeafNode } from "./types";

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

function leaf(
  attr: string,
  op: LeafNode["operator"],
  value?: LeafNode["value"],
): LeafNode {
  return {
    id: "l",
    kind: "leaf",
    attribute: attr,
    operator: op,
    value: value ?? null,
    values: [],
  };
}

function group(children: any[]): GroupNode {
  return { id: "g", kind: "group", operator: "AND", children };
}

describe("buildDataRuleYaml", () => {
  it("простое правило required на атрибут", () => {
    const yaml = buildDataRuleYaml(
      group([leaf("subject", "=", { kind: "string", value: "test" })]),
      table,
      "iocs.test",
      "iocs.test/Incident",
      {
        id: "rule_1",
        name: "Обязательная тема",
        effect: "required",
        attribute: "subject",
        message: "Укажите тему",
      },
    );

    expect(yaml).toContain("dataRules:");
    expect(yaml).toContain("- id: rule_1");
    expect(yaml).toContain("name: Обязательная тема");
    expect(yaml).toContain("target: entity");
    expect(yaml).toContain("entity: Incident");
    expect(yaml).toContain("condition: !rql subject = 'test'");
    expect(yaml).toContain("effect: required");
    expect(yaml).toContain("- attribute: subject");
    expect(yaml).toContain("message: Укажите тему");
  });

  it("правило без атрибута (на сущность целиком)", () => {
    const yaml = buildDataRuleYaml(
      group([leaf("subject", "=", { kind: "string", value: "a" })]),
      table,
      "iocs.test",
      "iocs.test/Incident",
      { id: "rule_2", effect: "hidden" },
    );

    expect(yaml).toContain("effect: hidden");
    expect(yaml).not.toContain("attributes:");
    expect(yaml).not.toContain("- attribute:");
  });

  it("длинное condition — блочный скаляр", () => {
    const long = "a".repeat(150);
    const yaml = buildDataRuleYaml(
      group([leaf("subject", "=", { kind: "string", value: long })]),
      table,
      "iocs.test",
      "iocs.test/Incident",
      { id: "rule_3", effect: "required", attribute: "subject" },
    );

    expect(yaml).toContain("condition: !rql |");
    // Содержимое с отступом
    expect(yaml).toMatch(/\n {6}[^\s]/);
  });

  it("эффект allowed", () => {
    const yaml = buildDataRuleYaml(
      group([
        leaf("urgency", "=", {
          kind: "enum",
          enumId: "IncUrgency",
          valueId: "high",
        }),
      ]),
      table,
      "iocs.test",
      "iocs.test/Incident",
      { id: "rule_4", effect: "allowed", attribute: "urgency" },
    );

    expect(yaml).toContain("effect: allowed");
    expect(yaml).toContain("- attribute: urgency");
  });

  it("короткое название без кавычек", () => {
    const yaml = buildDataRuleYaml(
      group([leaf("subject", "=", { kind: "string", value: "x" })]),
      table,
      "iocs.test",
      "iocs.test/Incident",
      {
        id: "rule_5",
        name: "Простое",
        effect: "required",
        attribute: "subject",
      },
    );

    expect(yaml).toContain("name: Простое");
    expect(yaml).not.toContain('name: "Простое"');
  });

  it("название с двоеточием — в кавычках", () => {
    const yaml = buildDataRuleYaml(
      group([leaf("subject", "=", { kind: "string", value: "x" })]),
      table,
      "iocs.test",
      "iocs.test/Incident",
      {
        id: "rule_6",
        name: "Правило: важное",
        effect: "required",
        attribute: "subject",
      },
    );

    expect(yaml).toContain('name: "Правило: важное"');
  });
});
