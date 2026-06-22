import { describe, expect, it } from "vitest";
import { formatMongodbQuery } from "./mongodb.js";
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

describe("formatMongodbQuery — comparison operators", () => {
  it("= produces direct field equality", () => {
    expect(formatMongodbQuery(q(rule("name", "=", "Alice")))).toEqual({
      $and: [{ name: "Alice" }],
    });
  });

  it("!= produces $ne", () => {
    expect(formatMongodbQuery(q(rule("age", "!=", 30)))).toEqual({
      $and: [{ age: { $ne: 30 } }],
    });
  });

  it("< produces $lt", () => {
    expect(formatMongodbQuery(q(rule("age", "<", 18)))).toEqual({
      $and: [{ age: { $lt: 18 } }],
    });
  });

  it("> produces $gt", () => {
    expect(formatMongodbQuery(q(rule("age", ">", 65)))).toEqual({
      $and: [{ age: { $gt: 65 } }],
    });
  });

  it("<= produces $lte", () => {
    expect(formatMongodbQuery(q(rule("score", "<=", 100)))).toEqual({
      $and: [{ score: { $lte: 100 } }],
    });
  });

  it(">= produces $gte", () => {
    expect(formatMongodbQuery(q(rule("score", ">=", 0)))).toEqual({
      $and: [{ score: { $gte: 0 } }],
    });
  });
});

// ─── Unary operators ──────────────────────────────────────────────────────────

describe("formatMongodbQuery — unary operators", () => {
  it("null produces { field: null }", () => {
    expect(formatMongodbQuery(q(rule("email", "null", null)))).toEqual({
      $and: [{ email: null }],
    });
  });

  it("notNull produces $exists/$ne", () => {
    expect(formatMongodbQuery(q(rule("email", "notNull", null)))).toEqual({
      $and: [{ email: { $exists: true, $ne: null } }],
    });
  });
});

// ─── In / notIn ───────────────────────────────────────────────────────────────

describe("formatMongodbQuery — in / notIn", () => {
  it("in produces $in array", () => {
    expect(formatMongodbQuery(q(rule("status", "in", "a,b,c")))).toEqual({
      $and: [{ status: { $in: ["a", "b", "c"] } }],
    });
  });

  it("notIn produces $nin array", () => {
    expect(formatMongodbQuery(q(rule("status", "notIn", "x,y")))).toEqual({
      $and: [{ status: { $nin: ["x", "y"] } }],
    });
  });
});

// ─── between / notBetween ────────────────────────────────────────────────────

describe("formatMongodbQuery — between / notBetween", () => {
  it("between produces $gte/$lte range", () => {
    expect(formatMongodbQuery(q(rule("age", "between", "18,65")))).toEqual({
      $and: [{ age: { $gte: "18", $lte: "65" } }],
    });
  });

  it("notBetween produces $or of $lt/$gt", () => {
    const result = formatMongodbQuery(q(rule("age", "notBetween", "18,65")));
    expect(result).toEqual({
      $and: [{ $or: [{ age: { $lt: "18" } }, { age: { $gt: "65" } }] }],
    });
  });

  it("between with insufficient values is dropped", () => {
    const result = formatMongodbQuery(q(rule("age", "between", "")));
    expect(result).toEqual({ $expr: true });
  });
});

// ─── String-match operators ───────────────────────────────────────────────────

describe("formatMongodbQuery — string-match operators", () => {
  it("contains produces $regex", () => {
    expect(formatMongodbQuery(q(rule("name", "contains", "li")))).toEqual({
      $and: [{ name: { $regex: "li" } }],
    });
  });

  it("doesNotContain produces $not/$regex", () => {
    expect(formatMongodbQuery(q(rule("name", "doesNotContain", "li")))).toEqual({
      $and: [{ name: { $not: { $regex: "li" } } }],
    });
  });

  it("beginsWith anchors regex with ^", () => {
    expect(formatMongodbQuery(q(rule("name", "beginsWith", "Al")))).toEqual({
      $and: [{ name: { $regex: "^Al" } }],
    });
  });

  it("endsWith anchors regex with $", () => {
    expect(formatMongodbQuery(q(rule("name", "endsWith", "ce")))).toEqual({
      $and: [{ name: { $regex: "ce$" } }],
    });
  });
});

// ─── Combinators / groups ─────────────────────────────────────────────────────

describe("formatMongodbQuery — combinators", () => {
  it("and combinator produces $and", () => {
    const result = formatMongodbQuery(q(rule("a", "=", 1), rule("b", "=", 2)));
    expect(result).toHaveProperty("$and");
  });

  it("or combinator produces $or", () => {
    const g: RuleGroup = {
      combinator: "or",
      rules: [rule("a", "=", 1) as never, rule("b", "=", 2) as never],
    };
    expect(formatMongodbQuery(g)).toHaveProperty("$or");
  });

  it("not:true wraps result in $nor", () => {
    const g: RuleGroup = {
      combinator: "and",
      not: true,
      rules: [rule("a", "=", 1) as never],
    };
    expect(formatMongodbQuery(g)).toHaveProperty("$nor");
  });

  it("empty group returns { $expr: true }", () => {
    expect(formatMongodbQuery({ combinator: "and", rules: [] })).toEqual({ $expr: true });
  });
});

// ─── Placeholder drops ───────────────────────────────────────────────────────

describe("formatMongodbQuery — placeholder drops", () => {
  it("drops rule with placeholder field", () => {
    const g: RuleGroup = {
      combinator: "and",
      rules: [rule("~", "=", "x") as never, rule("name", "=", "Alice") as never],
    };
    expect(formatMongodbQuery(g)).toEqual({ $and: [{ name: "Alice" }] });
  });
});

// ─── Custom operator pass-through (§2.9.4) ───────────────────────────────────

describe("formatMongodbQuery — custom operator pass-through", () => {
  it("unrecognized operator falls back to direct field equality", () => {
    expect(formatMongodbQuery(q(rule("notes", "matchesRegex", "^hello")))).toEqual({
      $and: [{ notes: "^hello" }],
    });
  });
});
