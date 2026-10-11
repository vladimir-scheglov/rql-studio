import { describe, it, expect } from "vitest";
import { isIncompleteInput } from "./incomplete-input";

describe("isIncompleteInput", () => {
  // Незаконченный ввод
  it.each([
    "",
    "!rql",
    "!rql ",
    "!rql @",
    "!rql @doc",
    "!rql @doc.",
    "!rql @doc.incidentId = ",
    "!rql SELECT ",
    "!rql SELECT join(",
    "!rql SELECT join('current', ",
    "!rql @doc.a = 'abc",
    "!rql @doc.a = (",
    "!rql @doc.a = @doc.b AND ",
  ])("incomplete: %s", (text) => {
    expect(isIncompleteInput(text)).toBe(true);
  });

  // Законченный ввод
  it.each([
    "!rql @doc.incidentId",
    "!rql @doc.incidentId = 'x'",
    "!rql @doc.a = 1 AND @doc.b = 2",
    "!rql hasRole('admin')",
    "!rql SELECT join('current', @link, @l, ON(eq(@l.side1, @doc.id))) WHERE @l.side2 = 1",
  ])("complete: %s", (text) => {
    expect(isIncompleteInput(text)).toBe(false);
  });
});
