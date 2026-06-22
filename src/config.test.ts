import { describe, expect, it } from "vitest";
import {
  findOption,
  firstOption,
  flattenOptionList,
  getOperatorArity,
  isUnaryOperator,
  joinMultiValue,
  normalizeOption,
  normalizeOptionList,
  parseMultiValue,
  resolveValueSources,
} from "./config.js";
import type { Field, Operator, OptionGroup } from "./types.js";

// ─── normalizeOption ─────────────────────────────────────────────────────────

describe("normalizeOption", () => {
  it("normalizes a string to { name, value, label } all equal", () => {
    expect(normalizeOption("foo")).toEqual({ name: "foo", value: "foo", label: "foo" });
  });

  it("fills value from name when only name is present", () => {
    const result = normalizeOption({ name: "x", label: "X" });
    expect(result.value).toBe("x");
  });

  it("fills name from value when only value is present", () => {
    const result = normalizeOption({ value: "y", label: "Y" });
    expect(result.name).toBe("y");
  });

  it("preserves extra properties", () => {
    const result = normalizeOption({ name: "a", value: "a", label: "A", disabled: true });
    expect(result.disabled).toBe(true);
  });

  it("defaults label to name when label is absent", () => {
    const result = normalizeOption({ name: "z" } as Parameters<typeof normalizeOption>[0]);
    expect(result.label).toBe("z");
  });
});

// ─── normalizeOptionList ─────────────────────────────────────────────────────

describe("normalizeOptionList", () => {
  it("normalizes a flat array of string options", () => {
    const result = normalizeOptionList(["a", "b"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "a", value: "a", label: "a" });
  });

  it("normalizes a grouped option list", () => {
    const groups: OptionGroup[] = [
      { label: "Group 1", options: [{ name: "x", value: "x", label: "X" }] },
    ];
    const result = normalizeOptionList(groups);
    expect(result).toHaveLength(1);
    expect((result[0] as OptionGroup).options[0]).toMatchObject({ name: "x" });
  });

  it("returns empty array for empty input", () => {
    expect(normalizeOptionList([])).toEqual([]);
  });
});

// ─── flattenOptionList ───────────────────────────────────────────────────────

describe("flattenOptionList", () => {
  it("returns flat list unchanged", () => {
    const list = [{ name: "a", value: "a", label: "A" }];
    expect(flattenOptionList(list)).toHaveLength(1);
  });

  it("flattens grouped list into options array", () => {
    const groups: OptionGroup[] = [
      { label: "G1", options: [{ name: "a", value: "a", label: "A" }] },
      { label: "G2", options: [{ name: "b", value: "b", label: "B" }] },
    ];
    const result = flattenOptionList(groups);
    expect(result).toHaveLength(2);
  });

  it("returns empty for empty input", () => {
    expect(flattenOptionList([])).toEqual([]);
  });
});

// ─── findOption ──────────────────────────────────────────────────────────────

describe("findOption", () => {
  const flat = [
    { name: "eq", value: "eq", label: "Equals" },
    { name: "neq", value: "neq", label: "Not equals" },
  ];

  it("finds by value", () => {
    expect(findOption(flat, "eq")?.label).toBe("Equals");
  });

  it("finds by name when value differs", () => {
    const list = [{ name: "myOp", value: "myOp", label: "My Op" }];
    expect(findOption(list, "myOp")).toBeDefined();
  });

  it("returns undefined for unknown identifier", () => {
    expect(findOption(flat, "unknown")).toBeUndefined();
  });

  it("finds across option group boundaries", () => {
    const groups: OptionGroup[] = [
      { label: "G1", options: [{ name: "a", value: "a", label: "A" }] },
      { label: "G2", options: [{ name: "b", value: "b", label: "B" }] },
    ];
    expect(findOption(groups, "b")).toBeDefined();
  });
});

// ─── firstOption ─────────────────────────────────────────────────────────────

describe("firstOption", () => {
  it("returns value of first flat option", () => {
    const list = [{ name: "and", value: "and", label: "AND" }];
    expect(firstOption(list)).toBe("and");
  });

  it("returns value from first group's first option", () => {
    const groups: OptionGroup[] = [
      { label: "G", options: [{ name: "or", value: "or", label: "OR" }] },
    ];
    expect(firstOption(groups)).toBe("or");
  });

  it("returns undefined for empty list", () => {
    expect(firstOption([])).toBeUndefined();
  });

  it("handles bare string in list", () => {
    expect(firstOption(["and"])).toBe("and");
  });
});

// ─── getOperatorArity ────────────────────────────────────────────────────────

describe("getOperatorArity", () => {
  it("returns 1 for unary string arity", () => {
    const op: Operator = { name: "null", value: "null", label: "is null", arity: "unary" };
    expect(getOperatorArity(op)).toBe(1);
  });

  it("returns 2 for binary string arity", () => {
    const op: Operator = { name: "eq", value: "eq", label: "=", arity: "binary" };
    expect(getOperatorArity(op)).toBe(2);
  });

  it("returns 3 for ternary string arity", () => {
    const op: Operator = { name: "between", value: "between", label: "between", arity: "ternary" };
    expect(getOperatorArity(op)).toBe(3);
  });

  it("returns numeric arity as-is", () => {
    const op: Operator = { name: "x", value: "x", label: "x", arity: 4 };
    expect(getOperatorArity(op)).toBe(4);
  });

  it("infers arity 1 for built-in null/notNull by identifier", () => {
    expect(getOperatorArity("null")).toBe(1);
    expect(getOperatorArity("notNull")).toBe(1);
  });

  it("infers arity 3 for built-in between/notBetween by identifier", () => {
    expect(getOperatorArity("between")).toBe(3);
    expect(getOperatorArity("notBetween")).toBe(3);
  });

  it("defaults to 2 for unknown string operator", () => {
    expect(getOperatorArity("someCustomOp")).toBe(2);
  });
});

// ─── isUnaryOperator ─────────────────────────────────────────────────────────

describe("isUnaryOperator", () => {
  it("returns true for null/notNull", () => {
    expect(isUnaryOperator("null")).toBe(true);
    expect(isUnaryOperator("notNull")).toBe(true);
  });

  it("returns false for binary operator", () => {
    expect(isUnaryOperator("=")).toBe(false);
  });
});

// ─── resolveValueSources ─────────────────────────────────────────────────────

describe("resolveValueSources", () => {
  it("returns field-level valueSources when present", () => {
    const field: Field = {
      name: "f",
      value: "f",
      label: "F",
      valueSources: ["value", "field"],
    };
    expect(resolveValueSources(field, "=")).toEqual(["value", "field"]);
  });

  it("calls valueSources function with operator", () => {
    const field: Field = {
      name: "f",
      value: "f",
      label: "F",
      valueSources: (op) => (op === "=" ? ["field"] : ["value"]),
    };
    expect(resolveValueSources(field, "=")).toEqual(["field"]);
    expect(resolveValueSources(field, "!=")).toEqual(["value"]);
  });

  it("falls through to builder-level resolver when field has no valueSources", () => {
    const field: Field = { name: "f", value: "f", label: "F" };
    const resolver = () => ["field"] as const;
    expect(resolveValueSources(field, "=", resolver)).toEqual(["field"]);
  });

  it("defaults to ['value'] when nothing is configured", () => {
    expect(resolveValueSources(undefined, "=")).toEqual(["value"]);
  });
});

// ─── parseMultiValue / joinMultiValue ────────────────────────────────────────

describe("parseMultiValue", () => {
  it("splits a comma-separated string", () => {
    expect(parseMultiValue("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("respects escaped separator", () => {
    expect(parseMultiValue("a\\,b,c")).toEqual(["a,b", "c"]);
  });

  it("trims whitespace around tokens", () => {
    expect(parseMultiValue("a , b")).toEqual(["a", "b"]);
  });

  it("returns array values unchanged", () => {
    expect(parseMultiValue(["x", "y"])).toEqual(["x", "y"]);
  });

  it("returns empty array for null/undefined", () => {
    expect(parseMultiValue(null)).toEqual([]);
    expect(parseMultiValue(undefined)).toEqual([]);
  });

  it("wraps single non-string value as a string", () => {
    expect(parseMultiValue(42)).toEqual(["42"]);
  });

  it("uses a custom join character", () => {
    expect(parseMultiValue("a|b|c", "|")).toEqual(["a", "b", "c"]);
  });
});

describe("joinMultiValue", () => {
  it("joins values with comma", () => {
    expect(joinMultiValue(["a", "b", "c"])).toBe("a,b,c");
  });

  it("escapes embedded separator", () => {
    expect(joinMultiValue(["a,b", "c"])).toBe("a\\,b,c");
  });

  it("round-trips through parseMultiValue", () => {
    const original = ["hello,world", "foo", "bar"];
    expect(parseMultiValue(joinMultiValue(original))).toEqual(original);
  });
});
