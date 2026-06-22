import { describe, expect, it } from "vitest";
import { formatJson, formatJsonWithoutIds, parseJson } from "./json.js";
import type { Rule, RuleGroup } from "../types.js";

const query: RuleGroup = {
  id: "g1",
  combinator: "and",
  rules: [
    { id: "r1", field: "name", operator: "=", value: "Alice" },
    { id: "r2", field: "age", operator: ">", value: 30 },
  ],
};

describe("formatJson", () => {
  it("produces valid JSON", () => {
    expect(() => JSON.parse(formatJson(query))).not.toThrow();
  });

  it("round-trips through parseJson", () => {
    expect(parseJson(formatJson(query))).toMatchObject(query);
  });

  it("preserves ids in output", () => {
    expect(formatJson(query)).toContain("g1");
    expect(formatJson(query)).toContain("r1");
  });
});

describe("formatJsonWithoutIds", () => {
  it("produces valid JSON", () => {
    expect(() => JSON.parse(formatJsonWithoutIds(query))).not.toThrow();
  });

  it("strips id fields from groups and rules", () => {
    const parsed = JSON.parse(formatJsonWithoutIds(query));
    expect(parsed.id).toBeUndefined();
    expect(parsed.rules[0].id).toBeUndefined();
  });

  it("preserves structural data (field, operator, value)", () => {
    const parsed = JSON.parse(formatJsonWithoutIds(query));
    const r = parsed.rules[0] as Rule;
    expect(r.field).toBe("name");
    expect(r.operator).toBe("=");
    expect(r.value).toBe("Alice");
  });

  it("handles IC groups (combinator strings)", () => {
    const ic = {
      id: "ic1",
      rules: [
        { id: "r1", field: "f", operator: "=", value: "v" },
        "and",
        { id: "r2", field: "g", operator: "=", value: "w" },
      ],
    };
    const parsed = JSON.parse(formatJsonWithoutIds(ic as never));
    expect(parsed.rules[1]).toBe("and");
  });
});

describe("parseJson", () => {
  it("parses JSON back to a query object", () => {
    const json = JSON.stringify(query);
    const parsed = parseJson(json);
    expect(parsed).toMatchObject(query);
  });
});
