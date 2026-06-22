import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBINATORS,
  DEFAULT_OPERATORS,
  MULTI_VALUE_OPERATORS,
  OPERATOR_MATCHES_REGEX,
  OPERATOR_NEGATION_MAP,
  TERNARY_OPERATORS,
  UNARY_OPERATORS,
} from "./defaults.js";
import { getOperatorArity, isUnaryOperator } from "./config.js";

describe("DEFAULT_OPERATORS", () => {
  it("contains expected default operators", () => {
    const names = DEFAULT_OPERATORS.map((o) => o.name);
    expect(names).toContain("=");
    expect(names).toContain("contains");
    expect(names).toContain("between");
    expect(names).toContain("null");
  });

  it("does not include matchesRegex", () => {
    expect(DEFAULT_OPERATORS.map((o) => o.name)).not.toContain("matchesRegex");
  });
});

describe("OPERATOR_MATCHES_REGEX", () => {
  it("has correct shape per §2.9.1", () => {
    expect(OPERATOR_MATCHES_REGEX).toMatchObject({
      name: "matchesRegex",
      value: "matchesRegex",
      label: "matches regex",
      arity: "binary",
    });
  });

  it("resolves arity to 2", () => {
    expect(getOperatorArity(OPERATOR_MATCHES_REGEX)).toBe(2);
  });

  it("is not treated as unary", () => {
    expect(isUnaryOperator(OPERATOR_MATCHES_REGEX)).toBe(false);
  });
});

describe("UNARY_OPERATORS / TERNARY_OPERATORS", () => {
  it("null and notNull are unary", () => {
    expect(UNARY_OPERATORS.has("null")).toBe(true);
    expect(UNARY_OPERATORS.has("notNull")).toBe(true);
  });

  it("between and notBetween are ternary", () => {
    expect(TERNARY_OPERATORS.has("between")).toBe(true);
    expect(TERNARY_OPERATORS.has("notBetween")).toBe(true);
  });

  it("matchesRegex is in neither set", () => {
    expect(UNARY_OPERATORS.has("matchesRegex")).toBe(false);
    expect(TERNARY_OPERATORS.has("matchesRegex")).toBe(false);
    expect(MULTI_VALUE_OPERATORS.has("matchesRegex")).toBe(false);
  });
});

describe("OPERATOR_NEGATION_MAP", () => {
  it("maps standard operator pairs symmetrically", () => {
    expect(OPERATOR_NEGATION_MAP["="]).toBe("!=");
    expect(OPERATOR_NEGATION_MAP["!="]).toBe("=");
    expect(OPERATOR_NEGATION_MAP.contains).toBe("doesNotContain");
    expect(OPERATOR_NEGATION_MAP.null).toBe("notNull");
    expect(OPERATOR_NEGATION_MAP.in).toBe("notIn");
    expect(OPERATOR_NEGATION_MAP.between).toBe("notBetween");
  });
});

describe("DEFAULT_COMBINATORS", () => {
  it("contains and / or", () => {
    const names = DEFAULT_COMBINATORS.map((c) => c.name);
    expect(names).toContain("and");
    expect(names).toContain("or");
  });
});
