import { describe, it, expect } from "vitest";
import { RULE_TEMPLATES } from "./rule-templates";
import { serializeCondition } from "./serialize";
import { buildSymbolTable } from "../schema/symbol-table";
import type { DomainSchema } from "../schema/types";

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
        { id: "createdAt", dataType: "Timestamp" },
        { id: "closedAt", dataType: "Timestamp" },
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
const ctx = {
  table,
  domain: "test.domain",
  entityFqid: "test.domain/Incident",
};

describe("rule templates", () => {
  it("required-when-other-filled", () => {
    const t = RULE_TEMPLATES.find(
      (x) => x.id === "required-when-other-filled",
    )!;
    const root = t.build({ trigger: "closedAt", target: "subject" }, ctx);
    const rql = serializeCondition(root, table);
    expect(rql).toContain("closedAt IS NOT NULL");
  });

  it("required-for-status", () => {
    const t = RULE_TEMPLATES.find((x) => x.id === "required-for-status")!;
    const root = t.build(
      { statusAttr: "urgency", statusValue: "@IncUrgency.high" },
      ctx,
    );
    const rql = serializeCondition(root, table);
    expect(rql).toContain("urgency = @IncUrgency.high");
  });

  it("restrict-enum", () => {
    const t = RULE_TEMPLATES.find((x) => x.id === "restrict-enum")!;
    const root = t.build(
      { target: "urgency", values: "@IncUrgency.high, @IncUrgency.low" },
      ctx,
    );
    const rql = serializeCondition(root, table);
    expect(rql).toContain("IN");
    expect(rql).toContain("@IncUrgency.high");
    expect(rql).toContain("@IncUrgency.low");
  });

  it("date-not-in-past", () => {
    const t = RULE_TEMPLATES.find((x) => x.id === "date-not-in-past")!;
    const root = t.build({ target: "closedAt" }, ctx);
    const rql = serializeCondition(root, table);
    expect(rql).toContain("closedAt IS NOT NULL");
  });
});
