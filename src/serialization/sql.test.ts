import { describe, expect, it } from "vitest";
import { formatParameterized, formatParameterizedNamed, formatSql } from "./sql.js";
import type { RuleGroup, RuleGroupIC } from "../types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const rule = (field: string, operator: string, value: unknown) => ({
  field,
  operator,
  value,
});

const q = (...rules: ReturnType<typeof rule>[]): RuleGroup => ({
  combinator: "and",
  rules: rules as RuleGroup["rules"],
});

// ─── Basic operators ─────────────────────────────────────────────────────────

describe("formatSql — basic operators", () => {
  it("= operator", () => {
    expect(formatSql(q(rule("name", "=", "Alice")))).toBe("name = 'Alice'");
  });

  it("!= operator", () => {
    expect(formatSql(q(rule("name", "!=", "Bob")))).toBe("name != 'Bob'");
  });

  it("< and > operators", () => {
    expect(formatSql(q(rule("age", "<", 30)))).toBe("age < '30'");
    expect(formatSql(q(rule("age", ">", 18)))).toBe("age > '18'");
  });

  it("<= and >= operators", () => {
    expect(formatSql(q(rule("age", "<=", 65)))).toBe("age <= '65'");
    expect(formatSql(q(rule("age", ">=", 0)))).toBe("age >= '0'");
  });

  it("null / notNull operators", () => {
    expect(formatSql(q(rule("email", "null", null)))).toBe("email is null");
    expect(formatSql(q(rule("email", "notNull", null)))).toBe("email is not null");
  });
});

// ─── LIKE operators ───────────────────────────────────────────────────────────

describe("formatSql — LIKE operators", () => {
  it("contains", () => {
    expect(formatSql(q(rule("name", "contains", "Al")))).toBe("name LIKE '%Al%'");
  });

  it("doesNotContain", () => {
    expect(formatSql(q(rule("name", "doesNotContain", "Al")))).toBe("name NOT LIKE '%Al%'");
  });

  it("beginsWith", () => {
    expect(formatSql(q(rule("name", "beginsWith", "Al")))).toBe("name LIKE 'Al%'");
  });

  it("doesNotBeginWith", () => {
    expect(formatSql(q(rule("name", "doesNotBeginWith", "Al")))).toBe("name NOT LIKE 'Al%'");
  });

  it("endsWith", () => {
    expect(formatSql(q(rule("name", "endsWith", "ce")))).toBe("name LIKE '%ce'");
  });

  it("doesNotEndWith", () => {
    expect(formatSql(q(rule("name", "doesNotEndWith", "ce")))).toBe("name NOT LIKE '%ce'");
  });
});

// ─── Multi-value operators ───────────────────────────────────────────────────

describe("formatSql — multi-value operators", () => {
  it("in operator", () => {
    expect(formatSql(q(rule("status", "in", "a,b,c")))).toBe("status in ('a', 'b', 'c')");
  });

  it("notIn operator", () => {
    expect(formatSql(q(rule("status", "notIn", "x,y")))).toBe("status not in ('x', 'y')");
  });

  it("between operator", () => {
    expect(formatSql(q(rule("age", "between", "18,65")))).toBe("age between '18' and '65'");
  });

  it("notBetween operator", () => {
    expect(formatSql(q(rule("age", "notBetween", "18,65")))).toBe("age not between '18' and '65'");
  });

  it("between swaps lo/hi when parseNumbers enabled and reversed", () => {
    const result = formatSql(q(rule("age", "between", "65,18")), { parseNumbers: true });
    expect(result).toBe("age between 18 and 65");
  });

  it("between with empty value returns (1 = 1)", () => {
    expect(formatSql(q(rule("age", "between", "")))).toBe("(1 = 1)");
  });
});

// ─── Grouping / combinators ───────────────────────────────────────────────────

describe("formatSql — groups and combinators", () => {
  it("wraps multiple rules in parentheses", () => {
    const result = formatSql(q(rule("a", "=", "1"), rule("b", "=", "2")));
    expect(result).toBe("(a = '1' and b = '2')");
  });

  it("uses OR combinator", () => {
    const g: RuleGroup = { combinator: "or", rules: [rule("a", "=", "1") as never, rule("b", "=", "2") as never] };
    expect(formatSql(g)).toBe("(a = '1' or b = '2')");
  });

  it("adds NOT wrapper when not:true", () => {
    const g: RuleGroup = {
      combinator: "and",
      not: true,
      rules: [rule("a", "=", "1") as never, rule("b", "=", "2") as never],
    };
    expect(formatSql(g)).toMatch(/^NOT /);
  });

  it("empty group returns (1 = 1)", () => {
    expect(formatSql({ combinator: "and", rules: [] })).toBe("(1 = 1)");
  });

  it("handles IC groups", () => {
    const ic: RuleGroupIC = {
      id: "ic1",
      rules: [rule("a", "=", "1") as never, "or", rule("b", "=", "2") as never],
    };
    const result = formatSql(ic);
    expect(result).toContain("or");
  });
});

// ─── Placeholder / dropped rules ─────────────────────────────────────────────

describe("formatSql — placeholder drops", () => {
  it("drops rule with placeholder field", () => {
    const g: RuleGroup = {
      combinator: "and",
      rules: [
        rule("~", "=", "x") as never,
        rule("name", "=", "Alice") as never,
      ],
    };
    expect(formatSql(g)).toBe("name = 'Alice'");
  });

  it("drops rule with placeholder operator", () => {
    const g: RuleGroup = {
      combinator: "and",
      rules: [
        rule("name", "~", "x") as never,
        rule("age", "=", "30") as never,
      ],
    };
    expect(formatSql(g)).toBe("age = '30'");
  });
});

// ─── Presets ─────────────────────────────────────────────────────────────────

describe("formatSql — presets", () => {
  it("postgresql preset double-quotes identifiers and uses $N params", () => {
    const { sql, params } = formatParameterized(q(rule("name", "=", "Alice")), {
      preset: "postgresql",
    });
    // postgresql preset sets quoteFieldNamesWith: '"', numberedParams: true, paramPrefix: "$"
    expect(sql).toBe('"name" = $1');
    expect(params).toEqual(["Alice"]);
  });

  it("mssql preset uses square bracket identifiers", () => {
    expect(
      formatSql(q(rule("name", "=", "Alice")), {
        preset: "mssql",
        quoteFieldNamesWith: ["[", "]"],
      }),
    ).toBe("[name] = 'Alice'");
  });
});

// ─── Custom / unknown operators (§2.9.4) ─────────────────────────────────────

describe("formatSql — custom operators pass-through", () => {
  it("preserves unrecognized operator as-is", () => {
    expect(formatSql(q(rule("notes", "matchesRegex", "^hello")))).toBe(
      "notes matchesRegex '^hello'",
    );
  });
});

// ─── formatParameterized ─────────────────────────────────────────────────────

describe("formatParameterized", () => {
  it("replaces values with ? placeholders", () => {
    const { sql, params } = formatParameterized(q(rule("name", "=", "Alice")));
    expect(sql).toBe("name = ?");
    expect(params).toEqual(["Alice"]);
  });

  it("produces multiple params for multi-rule query", () => {
    const { params } = formatParameterized(
      q(rule("a", "=", "1"), rule("b", "=", "2")),
    );
    expect(params).toHaveLength(2);
  });

  it("handles between with two params", () => {
    const { sql, params } = formatParameterized(q(rule("age", "between", "18,65")));
    expect(sql).toContain("between");
    expect(params).toHaveLength(2);
  });

  it("handles in with multiple params", () => {
    const { params } = formatParameterized(q(rule("s", "in", "a,b,c")));
    expect(params).toHaveLength(3);
  });
});

// ─── formatParameterizedNamed ────────────────────────────────────────────────

describe("formatParameterizedNamed", () => {
  it("uses named :field_N placeholders", () => {
    const { sql, params } = formatParameterizedNamed(q(rule("name", "=", "Alice")));
    expect(sql).toMatch(/:name_1/);
    expect(params["name_1"]).toBe("Alice");
  });

  it("increments count for repeated fields", () => {
    const { params } = formatParameterizedNamed(
      q(rule("name", "=", "Alice"), rule("name", "=", "Bob")),
    );
    expect(params["name_1"]).toBe("Alice");
    expect(params["name_2"]).toBe("Bob");
  });
});
