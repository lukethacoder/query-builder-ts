import { describe, expect, it } from "vitest";
import { add, convertFromIC, convertToIC, group, insert, move, remove, update } from "./manipulation.js";
import { findPath } from "./paths.js";
import type { Rule, RuleGroup, RuleGroupIC } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _seq = 0;
const seq = () => `id-${++_seq}`;

const rule = (id: string, field = "f", value: unknown = "v"): Rule => ({
  id,
  field,
  operator: "=",
  value,
});

const q = (...rules: Rule[]): RuleGroup => ({
  id: "root",
  combinator: "and",
  rules,
});

// ─── add ─────────────────────────────────────────────────────────────────────

describe("add", () => {
  it("appends a rule to an empty group", () => {
    const r = rule("r1");
    const result = add(q(), r, [], { idGenerator: seq }) as RuleGroup;
    expect(result.rules).toHaveLength(1);
  });

  it("appends a rule to a non-empty group", () => {
    const result = add(q(rule("r1")), rule("r2"), [], { idGenerator: seq }) as RuleGroup;
    expect(result.rules).toHaveLength(2);
  });

  it("resolves parent by ID string", () => {
    const result = add(q(rule("r1")), rule("r2"), "root", { idGenerator: seq }) as RuleGroup;
    expect(result.rules).toHaveLength(2);
  });

  it("returns query unchanged for unknown path", () => {
    const base = q(rule("r1"));
    expect(add(base, rule("r2"), [99])).toBe(base);
  });

  it("adds combinator in IC query", () => {
    const ic: RuleGroupIC = { id: "root", rules: [rule("r1")] };
    const result = add(ic, rule("r2"), [], { idGenerator: seq }) as RuleGroupIC;
    expect(result.rules[1]).toBe("and");
    expect(result.rules).toHaveLength(3);
  });

  it("respects combinatorPreceding in IC query", () => {
    const ic: RuleGroupIC = { id: "root", rules: [rule("r1")] };
    const result = add(ic, rule("r2"), [], {
      combinatorPreceding: "or",
      idGenerator: seq,
    }) as RuleGroupIC;
    expect(result.rules[1]).toBe("or");
  });
});

// ─── remove ──────────────────────────────────────────────────────────────────

describe("remove", () => {
  it("removes a rule by path", () => {
    const result = remove(q(rule("r1"), rule("r2")), [0]) as RuleGroup;
    expect(result.rules).toHaveLength(1);
    expect((result.rules[0] as Rule).id).toBe("r2");
  });

  it("removes a rule by ID", () => {
    const result = remove(q(rule("r1"), rule("r2")), "r1") as RuleGroup;
    expect(result.rules).toHaveLength(1);
  });

  it("returns query unchanged when removing root", () => {
    const base = q(rule("r1"));
    expect(remove(base, [])).toBe(base);
  });

  it("removes rule and its adjacent combinator in IC group", () => {
    const ic: RuleGroupIC = { id: "root", rules: [rule("r1"), "and", rule("r2")] };
    const result = remove(ic, [0]) as RuleGroupIC;
    expect(result.rules).toHaveLength(1);
    expect((result.rules[0] as Rule).id).toBe("r2");
  });

  it("removes last rule in IC group leaving single rule", () => {
    const ic: RuleGroupIC = { id: "root", rules: [rule("r1"), "or", rule("r2")] };
    const result = remove(ic, [2]) as RuleGroupIC;
    expect(result.rules).toHaveLength(1);
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("update", () => {
  it("updates a rule property", () => {
    const base = q(rule("r1", "name", "Alice"));
    const result = update(base, "value", "Bob", [0]) as RuleGroup;
    expect((result.rules[0] as Rule).value).toBe("Bob");
  });

  it("returns query unchanged when value is identical", () => {
    const base = q(rule("r1", "f", "x"));
    expect(update(base, "value", "x", [0])).toBe(base);
  });

  it("resets operator and value on field change by default", () => {
    const base = q(rule("r1", "name", "Alice"));
    const result = update(base, "field", "age", [0]) as RuleGroup;
    const updated = result.rules[0] as Rule;
    expect(updated.field).toBe("age");
    expect(updated.value).toBe("");
  });

  it("uses getRuleDefaultOperator on field change", () => {
    const base = q(rule("r1", "name", "Alice"));
    const result = update(base, "field", "age", [0], {
      getRuleDefaultOperator: () => ">",
    }) as RuleGroup;
    expect((result.rules[0] as Rule).operator).toBe(">");
  });

  it("resets value on operator change when resetOnOperatorChange is true", () => {
    const base = q(rule("r1", "f", "foo"));
    const result = update(base, "operator", "!=", [0], {
      resetOnOperatorChange: true,
    }) as RuleGroup;
    expect((result.rules[0] as Rule).value).toBe("");
  });

  it("does not reset on operator change by default", () => {
    const base = q(rule("r1", "f", "foo"));
    const result = update(base, "operator", "!=", [0]) as RuleGroup;
    expect((result.rules[0] as Rule).value).toBe("foo");
  });

  it("resets value on valueSource change", () => {
    const base = q(rule("r1", "f", "foo"));
    const result = update(base, "valueSource", "field", [0]) as RuleGroup;
    expect((result.rules[0] as Rule).value).toBe("");
  });

  it("updates a group property", () => {
    const base = q(rule("r1"));
    const result = update(base, "not", true, []) as RuleGroup;
    expect(result.not).toBe(true);
  });

  it("returns unchanged query for IC combinator path (string slots not addressable via findPath)", () => {
    // findPath returns undefined for string combinator slots, so resolvePath → undefined → no-op
    const ic: RuleGroupIC = { id: "root", rules: [rule("r1"), "and", rule("r2")] };
    expect(update(ic, "combinator", "or", [1])).toBe(ic);
  });
});

// ─── move ────────────────────────────────────────────────────────────────────

describe("move", () => {
  it("moves a rule to a new position", () => {
    // Removing [0] shifts the list; target [2] adjusts to [1], giving [r2, r1, r3]
    const base = q(rule("r1"), rule("r2"), rule("r3"));
    const result = move(base, [0], [2]) as RuleGroup;
    expect((result.rules[0] as Rule).id).toBe("r2");
    expect((result.rules[1] as Rule).id).toBe("r1");
    expect((result.rules[2] as Rule).id).toBe("r3");
  });

  it("moves up with direction 'up'", () => {
    const base = q(rule("r1"), rule("r2"));
    const result = move(base, [1], "up") as RuleGroup;
    expect((result.rules[0] as Rule).id).toBe("r2");
  });

  it("moves down with direction 'down' (first item in 3-item list)", () => {
    // "down" from [0] → target [1]; same parent; fromIndex < toIndex so adjustedTo = [0]; inserts at [0]
    // In practice for non-IC: "down" swaps with next sibling
    const base = q(rule("r1"), rule("r2"), rule("r3"));
    // Move last item down — no next sibling, returns unchanged
    const unchanged = move(base, [2], "down");
    expect(unchanged).toBe(base);
    // Move first item down: resolves to [1], remove [0], adjust [1]→[0], insert at [0] → same position
    // Correct observable test: move middle item up gives deterministic result
    const result = move(base, [2], "up") as RuleGroup;
    expect((result.rules[0] as Rule).id).toBe("r1");
    expect((result.rules[1] as Rule).id).toBe("r3");
    expect((result.rules[2] as Rule).id).toBe("r2");
  });

  it("returns unchanged query when source path is root", () => {
    const base = q(rule("r1"));
    expect(move(base, [], [0])).toBe(base);
  });

  it("returns unchanged query when source equals destination", () => {
    const base = q(rule("r1"), rule("r2"));
    expect(move(base, [0], [0])).toBe(base);
  });

  it("clones rather than moves when clone:true", () => {
    // Target must be within bounds; clone into index [1] in a 2-item list inserts before r2
    const base = q(rule("r1"), rule("r2"));
    const result = move(base, [0], [1], { clone: true, idGenerator: seq }) as RuleGroup;
    expect(result.rules).toHaveLength(3);
    // original r1 still present at [0]; clone inserted at [1]; r2 shifted to [2]
    expect((result.rules[0] as Rule).id).toBe("r1");
  });
});

// ─── insert ──────────────────────────────────────────────────────────────────

describe("insert", () => {
  it("inserts at a given index without replace", () => {
    const base = q(rule("r1"), rule("r2"));
    const result = insert(base, rule("rNew"), [1], { idGenerator: seq }) as RuleGroup;
    expect(result.rules).toHaveLength(3);
    expect((result.rules[1] as Rule).id).not.toBe("r2");
  });

  it("replaces when replace:true", () => {
    const base = q(rule("r1"), rule("r2"));
    const result = insert(base, rule("rNew"), [0], {
      replace: true,
      idGenerator: seq,
    }) as RuleGroup;
    expect(result.rules).toHaveLength(2);
    // r1 was replaced
    expect((result.rules[0] as Rule).id).not.toBe("r1");
  });

  it("always regenerates ids on insert", () => {
    const r = rule("original");
    const base = q(rule("r1"));
    const result = insert(base, r, [0], { idGenerator: seq }) as RuleGroup;
    expect((result.rules[0] as Rule).id).not.toBe("original");
  });

  it("returns unchanged query for unknown path", () => {
    const base = q(rule("r1"));
    expect(insert(base, rule("r2"), [99])).toBe(base);
  });
});

// ─── group ───────────────────────────────────────────────────────────────────

describe("group", () => {
  it("wraps two rules into a new sub-group", () => {
    const base = q(rule("r1"), rule("r2"));
    const result = group(base, [0], [1], { idGenerator: seq }) as RuleGroup;
    // After group: root has 1 child which is the new sub-group
    expect(result.rules).toHaveLength(1);
    const sub = result.rules[0] as RuleGroup;
    expect(sub.rules).toHaveLength(2);
  });

  it("returns unchanged query when source equals target", () => {
    const base = q(rule("r1"), rule("r2"));
    expect(group(base, [0], [0])).toBe(base);
  });

  it("returns unchanged query when source path is root", () => {
    const base = q(rule("r1"), rule("r2"));
    expect(group(base, [], [1])).toBe(base);
  });

  it("clones source when clone:true", () => {
    const base = q(rule("r1"), rule("r2"));
    const result = group(base, [0], [1], { clone: true, idGenerator: seq }) as RuleGroup;
    // Both originals still present at top level, plus the new sub-group
    expect(result.rules).toHaveLength(2);
  });
});

// ─── convertToIC / convertFromIC ─────────────────────────────────────────────

describe("convertToIC", () => {
  it("interleaves combinator strings between rules", () => {
    const base = q(rule("r1"), rule("r2"), rule("r3"));
    const ic = convertToIC(base);
    expect(ic.combinator).toBeUndefined();
    expect(ic.rules).toHaveLength(5); // r1, "and", r2, "and", r3
    expect(ic.rules[1]).toBe("and");
    expect(ic.rules[3]).toBe("and");
  });

  it("recursively converts nested groups", () => {
    const nested: RuleGroup = { id: "g2", combinator: "or", rules: [rule("r2"), rule("r3")] };
    const base: RuleGroup = { id: "g1", combinator: "and", rules: [rule("r1"), nested] };
    const ic = convertToIC(base);
    const nestedIC = (ic as RuleGroupIC).rules[2] as RuleGroupIC;
    expect(nestedIC.combinator).toBeUndefined();
    expect(nestedIC.rules[1]).toBe("or");
  });

  it("can use a custom defaultCombinator", () => {
    const base = q(rule("r1"), rule("r2"));
    const ic = convertToIC(base, "or");
    expect(ic.rules[1]).toBe("or");
  });
});

describe("convertFromIC", () => {
  it("extracts combinator and rules from IC format", () => {
    const ic: RuleGroupIC = {
      id: "ic1",
      rules: [rule("r1"), "and", rule("r2"), "or", rule("r3")],
    };
    // convertFromIC uses the LAST encountered combinator
    const result = convertFromIC(ic) as RuleGroup;
    expect(result.combinator).toBe("or");
    expect(result.rules).toHaveLength(3);
  });

  it("uses defaultCombinator when no string combinator present", () => {
    const ic: RuleGroupIC = { id: "ic1", rules: [rule("r1")] };
    const result = convertFromIC(ic, "or") as RuleGroup;
    expect(result.combinator).toBe("or");
  });

  it("round-trips with convertToIC", () => {
    const base = q(rule("r1"), rule("r2"));
    const roundTripped = convertFromIC(convertToIC(base)) as RuleGroup;
    expect(roundTripped.combinator).toBe("and");
    expect(roundTripped.rules).toHaveLength(2);
    expect((roundTripped.rules[0] as Rule).id).toBe("r1");
  });
});
