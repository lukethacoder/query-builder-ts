import { describe, expect, it } from "vitest";
import { formatJsonLogic } from "./jsonlogic.js";
import type { RuleGroup } from "../types.js";

const rule = (field: string, operator: string, value: unknown) => ({
  field,
  operator,
  value,
});

const q = (...rules: ReturnType<typeof rule>[]): RuleGroup => ({
  combinator: "and",
  rules: rules as RuleGroup["rules"],
});

// ─── Comparison operators ─────────────────────────────────────────────────────

describe("formatJsonLogic — comparison operators", () => {
  it("= maps to ==", () => {
    expect(formatJsonLogic(q(rule("age", "=", 30)))).toEqual({
      and: [{ "==": [{ var: "age" }, 30] }],
    });
  });

  it("!= maps to !=", () => {
    expect(formatJsonLogic(q(rule("age", "!=", 30)))).toEqual({
      and: [{ "!=": [{ var: "age" }, 30] }],
    });
  });

  it("< maps to <", () => {
    expect(formatJsonLogic(q(rule("age", "<", 18)))).toEqual({
      and: [{ "<": [{ var: "age" }, 18] }],
    });
  });

  it("> maps to >", () => {
    expect(formatJsonLogic(q(rule("age", ">", 65)))).toEqual({
      and: [{ ">": [{ var: "age" }, 65] }],
    });
  });

  it("<= maps to <=", () => {
    expect(formatJsonLogic(q(rule("score", "<=", 100)))).toEqual({
      and: [{ "<=": [{ var: "score" }, 100] }],
    });
  });

  it(">= maps to >=", () => {
    expect(formatJsonLogic(q(rule("score", ">=", 0)))).toEqual({
      and: [{ ">=": [{ var: "score" }, 0] }],
    });
  });
});

// ─── Unary operators ──────────────────────────────────────────────────────────

describe("formatJsonLogic — unary operators", () => {
  it("null produces { ==: [field, null] }", () => {
    expect(formatJsonLogic(q(rule("email", "null", null)))).toEqual({
      and: [{ "==": [{ var: "email" }, null] }],
    });
  });

  it("notNull produces { !=: [field, null] }", () => {
    expect(formatJsonLogic(q(rule("email", "notNull", null)))).toEqual({
      and: [{ "!=": [{ var: "email" }, null] }],
    });
  });
});

// ─── in / notIn ───────────────────────────────────────────────────────────────

describe("formatJsonLogic — in / notIn", () => {
  it("in produces { in: [field, [values]] }", () => {
    expect(formatJsonLogic(q(rule("status", "in", "a,b,c")))).toEqual({
      and: [{ in: [{ var: "status" }, ["a", "b", "c"]] }],
    });
  });

  it("notIn wraps in { ! }", () => {
    const result = formatJsonLogic(q(rule("status", "notIn", "a,b"))) as Record<string, unknown[]>;
    const inner = result["and"]?.[0] as Record<string, unknown>;
    expect(inner).toHaveProperty("!");
  });
});

// ─── between / notBetween ────────────────────────────────────────────────────

describe("formatJsonLogic — between / notBetween", () => {
  it("between produces { <=: [lo, field, hi] }", () => {
    expect(formatJsonLogic(q(rule("age", "between", "18,65")))).toEqual({
      and: [{ "<=": ["18", { var: "age" }, "65"] }],
    });
  });

  it("notBetween wraps between in { ! }", () => {
    const result = formatJsonLogic(q(rule("age", "notBetween", "18,65"))) as Record<string, unknown[]>;
    const inner = result["and"]?.[0] as Record<string, unknown>;
    expect(inner).toHaveProperty("!");
  });

  it("between with insufficient values is dropped", () => {
    expect(formatJsonLogic(q(rule("age", "between", "")))).toEqual({ "==": [1, 1] });
  });
});

// ─── String operators ─────────────────────────────────────────────────────────

describe("formatJsonLogic — string operators", () => {
  it("contains", () => {
    expect(formatJsonLogic(q(rule("name", "contains", "li")))).toEqual({
      and: [{ in: ["li", { var: "name" }] }],
    });
  });

  it("doesNotContain wraps in !", () => {
    const result = formatJsonLogic(q(rule("name", "doesNotContain", "li"))) as Record<string, unknown[]>;
    const inner = result["and"]?.[0] as Record<string, unknown>;
    expect(inner).toHaveProperty("!");
  });

  it("beginsWith produces startsWith", () => {
    expect(formatJsonLogic(q(rule("name", "beginsWith", "Al")))).toEqual({
      and: [{ startsWith: [{ var: "name" }, "Al"] }],
    });
  });

  it("doesNotBeginWith wraps in !", () => {
    const result = formatJsonLogic(q(rule("name", "doesNotBeginWith", "Al"))) as Record<string, unknown[]>;
    const inner = result["and"]?.[0] as Record<string, unknown>;
    expect(inner).toHaveProperty("!");
  });

  it("endsWith produces endsWith", () => {
    expect(formatJsonLogic(q(rule("name", "endsWith", "ce")))).toEqual({
      and: [{ endsWith: [{ var: "name" }, "ce"] }],
    });
  });
});

// ─── Combinators and groups ───────────────────────────────────────────────────

describe("formatJsonLogic — combinators", () => {
  it("and combinator", () => {
    const result = formatJsonLogic(q(rule("a", "=", 1), rule("b", "=", 2)));
    expect(result).toHaveProperty("and");
  });

  it("or combinator", () => {
    const g: RuleGroup = {
      combinator: "or",
      rules: [rule("a", "=", 1) as never, rule("b", "=", 2) as never],
    };
    expect(formatJsonLogic(g)).toHaveProperty("or");
  });

  it("not:true wraps in { ! }", () => {
    const g: RuleGroup = {
      combinator: "and",
      not: true,
      rules: [rule("a", "=", 1) as never],
    };
    const result = formatJsonLogic(g) as Record<string, unknown>;
    expect(result).toHaveProperty("!");
  });

  it("empty group returns { ==: [1, 1] }", () => {
    expect(formatJsonLogic({ combinator: "and", rules: [] })).toEqual({ "==": [1, 1] });
  });
});

// ─── Placeholder drops ───────────────────────────────────────────────────────

describe("formatJsonLogic — placeholder drops", () => {
  it("drops rules with placeholder field", () => {
    const g: RuleGroup = {
      combinator: "and",
      rules: [rule("~", "=", "x") as never, rule("name", "=", "Alice") as never],
    };
    const result = formatJsonLogic(g) as Record<string, unknown[]>;
    expect(result["and"]).toHaveLength(1);
  });
});

// ─── Custom operator pass-through (§2.9.4) ───────────────────────────────────

describe("formatJsonLogic — custom operator pass-through", () => {
  it("unrecognized operator falls back to { ==: [field, value] }", () => {
    expect(formatJsonLogic(q(rule("notes", "matchesRegex", "^hello")))).toEqual({
      and: [{ "==": [{ var: "notes" }, "^hello"] }],
    });
  });
});
