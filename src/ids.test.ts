import { describe, expect, it } from "vitest";
import { generateUUID, prepareNode, regenerateIds } from "./ids.js";
import type { Rule, RuleGroup, RuleGroupIC } from "./types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── generateUUID ─────────────────────────────────────────────────────────────

describe("generateUUID", () => {
  it("produces a valid v4 UUID", () => {
    expect(generateUUID()).toMatch(UUID_RE);
  });

  it("produces unique values", () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });
});

// ─── prepareNode ─────────────────────────────────────────────────────────────

describe("prepareNode", () => {
  it("assigns id to a rule that lacks one", () => {
    const rule: Rule = { field: "name", operator: "=", value: "x" };
    const prepared = prepareNode(rule);
    expect(prepared.id).toMatch(UUID_RE);
  });

  it("preserves an existing rule id", () => {
    const rule: Rule = { id: "my-id", field: "name", operator: "=", value: "x" };
    expect(prepareNode(rule).id).toBe("my-id");
  });

  it("assigns id to a group that lacks one", () => {
    const group: RuleGroup = { combinator: "and", rules: [] };
    expect(prepareNode(group).id).toMatch(UUID_RE);
  });

  it("recursively assigns ids to children", () => {
    const rule: Rule = { field: "f", operator: "=", value: "v" };
    const group: RuleGroup = { combinator: "and", rules: [rule] };
    const prepared = prepareNode(group) as RuleGroup;
    expect((prepared.rules[0] as Rule).id).toMatch(UUID_RE);
  });

  it("uses a custom id generator", () => {
    let n = 0;
    const gen = () => `id-${++n}`;
    const rule: Rule = { field: "f", operator: "=", value: "v" };
    const prepared = prepareNode(rule, gen);
    expect(prepared.id).toBe("id-1");
  });

  it("preserves IC combinator strings in rules", () => {
    const ic: RuleGroupIC = {
      id: "ic1",
      rules: [
        { id: "r1", field: "f", operator: "=", value: "v" },
        "and",
        { field: "g", operator: "=", value: "w" },
      ],
    };
    const prepared = prepareNode(ic) as RuleGroupIC;
    expect(prepared.rules[1]).toBe("and");
    expect((prepared.rules[2] as Rule).id).toMatch(UUID_RE);
  });
});

// ─── regenerateIds ───────────────────────────────────────────────────────────

describe("regenerateIds", () => {
  it("replaces an existing rule id", () => {
    const rule: Rule = { id: "old", field: "f", operator: "=", value: "v" };
    expect(regenerateIds(rule).id).not.toBe("old");
    expect(regenerateIds(rule).id).toMatch(UUID_RE);
  });

  it("replaces group id and all child ids", () => {
    const r1: Rule = { id: "r1", field: "f", operator: "=", value: "1" };
    const r2: Rule = { id: "r2", field: "g", operator: "=", value: "2" };
    const group: RuleGroup = { id: "g1", combinator: "and", rules: [r1, r2] };
    const regen = regenerateIds(group) as RuleGroup;
    expect(regen.id).not.toBe("g1");
    expect((regen.rules[0] as Rule).id).not.toBe("r1");
    expect((regen.rules[1] as Rule).id).not.toBe("r2");
  });

  it("does not mutate the original", () => {
    const rule: Rule = { id: "original", field: "f", operator: "=", value: "v" };
    regenerateIds(rule);
    expect(rule.id).toBe("original");
  });

  it("preserves IC combinator strings", () => {
    const ic: RuleGroupIC = {
      id: "old",
      rules: [{ id: "r1", field: "f", operator: "=", value: "v" }, "or"],
    };
    const regen = regenerateIds(ic) as RuleGroupIC;
    expect(regen.rules[1]).toBe("or");
  });
});
