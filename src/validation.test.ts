import { describe, expect, it } from "vitest";
import {
  defaultValidator,
  isNodeValid,
  mergeValidationMaps,
  normalizeValidationResult,
} from "./validation.js";
import type { Rule, RuleGroup, RuleGroupIC } from "./types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const rule = (id: string): Rule => ({ id, field: "f", operator: "=", value: "v" });

// ─── defaultValidator ─────────────────────────────────────────────────────────

describe("defaultValidator", () => {
  it("marks a non-empty valid group as valid", () => {
    const q: RuleGroup = { id: "g1", combinator: "and", rules: [rule("r1")] };
    const map = defaultValidator(q);
    expect(map["g1"]).toMatchObject({ valid: true });
  });

  it("marks an empty group as invalid with reason 'empty'", () => {
    const q: RuleGroup = { id: "g1", combinator: "and", rules: [] };
    const map = defaultValidator(q);
    const result = map["g1"];
    expect(typeof result === "object" && result.valid).toBe(false);
    expect(typeof result === "object" && result.reasons).toContain("empty");
  });

  it("marks a group with an unknown combinator as invalid", () => {
    const q: RuleGroup = { id: "g1", combinator: "xor", rules: [rule("r1"), rule("r2")] };
    const map = defaultValidator(q);
    const result = map["g1"];
    expect(typeof result === "object" && result.valid).toBe(false);
    expect(typeof result === "object" && result.reasons).toContain("invalidCombinator");
  });

  it("validates nested groups recursively", () => {
    const inner: RuleGroup = { id: "g2", combinator: "or", rules: [] };
    const outer: RuleGroup = { id: "g1", combinator: "and", rules: [rule("r1"), inner] };
    const map = defaultValidator(outer);
    expect(map["g1"]).toMatchObject({ valid: true });
    expect(typeof map["g2"] === "object" && map["g2"].valid).toBe(false);
  });

  it("does not include entries for rules (only groups)", () => {
    const q: RuleGroup = { id: "g1", combinator: "and", rules: [rule("r1")] };
    const map = defaultValidator(q);
    expect(Object.keys(map)).not.toContain("r1");
  });

  it("marks a valid IC group as valid", () => {
    const ic: RuleGroupIC = { id: "ic1", rules: [rule("r1"), "and", rule("r2")] };
    const map = defaultValidator(ic);
    expect(map["ic1"]).toMatchObject({ valid: true });
  });

  it("marks an IC group with bad structure as invalid", () => {
    // Two consecutive string combinators → invalid
    const ic: RuleGroupIC = {
      id: "ic1",
      rules: [rule("r1"), "and", "or"] as RuleGroupIC["rules"],
    };
    const map = defaultValidator(ic);
    const result = map["ic1"];
    expect(typeof result === "object" && result.valid).toBe(false);
    expect(typeof result === "object" && result.reasons).toContain("invalidIndependentCombinators");
  });
});

// ─── isNodeValid ──────────────────────────────────────────────────────────────

describe("isNodeValid", () => {
  it("returns true when map is undefined", () => {
    expect(isNodeValid("any", undefined)).toBe(true);
  });

  it("returns the boolean when map is a boolean", () => {
    expect(isNodeValid("any", true)).toBe(true);
    expect(isNodeValid("any", false)).toBe(false);
  });

  it("returns true for an id not present in map", () => {
    expect(isNodeValid("missing", {})).toBe(true);
  });

  it("reads a boolean entry", () => {
    expect(isNodeValid("x", { x: false })).toBe(false);
    expect(isNodeValid("x", { x: true })).toBe(true);
  });

  it("reads the .valid field of a ValidationResult entry", () => {
    expect(isNodeValid("x", { x: { valid: false, reasons: ["empty"] } })).toBe(false);
    expect(isNodeValid("x", { x: { valid: true } })).toBe(true);
  });
});

// ─── mergeValidationMaps ─────────────────────────────────────────────────────

describe("mergeValidationMaps", () => {
  it("returns true when all inputs are true booleans", () => {
    expect(mergeValidationMaps(true, true)).toBe(true);
  });

  it("returns false when any boolean is false", () => {
    expect(mergeValidationMaps(true, false)).toBe(false);
  });

  it("merges maps by id, first occurrence wins if both valid", () => {
    const a = { id1: { valid: true } };
    const b = { id1: { valid: true } };
    const merged = mergeValidationMaps(a, b) as Record<string, unknown>;
    expect(merged["id1"]).toMatchObject({ valid: true });
  });

  it("marks an id invalid if either source marks it invalid", () => {
    const a = { id1: { valid: true } };
    const b = { id1: { valid: false, reasons: ["empty"] } };
    const merged = mergeValidationMaps(a, b) as Record<string, { valid: boolean; reasons?: unknown[] }>;
    expect(merged["id1"]?.valid).toBe(false);
    expect(merged["id1"]?.reasons).toContain("empty");
  });

  it("combines reasons from both maps when both are invalid", () => {
    const a = { id1: { valid: false, reasons: ["empty"] } };
    const b = { id1: { valid: false, reasons: ["invalidCombinator"] } };
    const merged = mergeValidationMaps(a, b) as Record<string, { valid: boolean; reasons?: unknown[] }>;
    expect(merged["id1"]?.reasons).toContain("empty");
    expect(merged["id1"]?.reasons).toContain("invalidCombinator");
  });

  it("returns an object (not boolean) when any input is a map", () => {
    const result = mergeValidationMaps(true, { id1: { valid: true } });
    expect(typeof result).toBe("object");
  });
});

// ─── normalizeValidationResult ───────────────────────────────────────────────

describe("normalizeValidationResult", () => {
  it("wraps true in { valid: true }", () => {
    expect(normalizeValidationResult(true)).toEqual({ valid: true });
  });

  it("wraps false in { valid: false }", () => {
    expect(normalizeValidationResult(false)).toEqual({ valid: false });
  });

  it("returns ValidationResult unchanged", () => {
    const r = { valid: false, reasons: ["empty"] };
    expect(normalizeValidationResult(r)).toBe(r);
  });
});
