import { describe, expect, it } from "vitest";
import {
  annotatePaths,
  findID,
  findParent,
  findPath,
  getCommonAncestorPath,
  getParentPath,
  getPathOfID,
  isAncestor,
  isEffectivelyDisabled,
  isICGroup,
  isICQuery,
  isRule,
  isRuleGroup,
  isStandardGroup,
  pathsAreEqual,
  resolvePath,
  stripPaths,
} from "./paths.js";
import type { Rule, RuleGroup, RuleGroupIC } from "./types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const rule1: Rule = { id: "r1", field: "name", operator: "=", value: "Alice" };
const rule2: Rule = { id: "r2", field: "age", operator: ">", value: 30 };
const rule3: Rule = { id: "r3", field: "city", operator: "=", value: "NYC" };

const nestedGroup: RuleGroup = {
  id: "g2",
  combinator: "or",
  rules: [rule2, rule3],
};

const query: RuleGroup = {
  id: "g1",
  combinator: "and",
  rules: [rule1, nestedGroup],
};

const icQuery: RuleGroupIC = {
  id: "ic1",
  rules: [rule1, "and", rule2],
};

// ─── Type guards ─────────────────────────────────────────────────────────────

describe("isRuleGroup", () => {
  it("returns true for a RuleGroup", () => {
    expect(isRuleGroup(query)).toBe(true);
  });

  it("returns true for a RuleGroupIC", () => {
    expect(isRuleGroup(icQuery)).toBe(true);
  });

  it("returns false for a Rule", () => {
    expect(isRuleGroup(rule1)).toBe(false);
  });
});

describe("isRule", () => {
  it("returns true for a rule", () => {
    expect(isRule(rule1)).toBe(true);
  });

  it("returns false for a group", () => {
    expect(isRule(query)).toBe(false);
  });
});

describe("isStandardGroup", () => {
  it("returns true when combinator is a string", () => {
    expect(isStandardGroup(query)).toBe(true);
  });

  it("returns false for IC group", () => {
    expect(isStandardGroup(icQuery)).toBe(false);
  });
});

describe("isICGroup / isICQuery", () => {
  it("returns true for IC group", () => {
    expect(isICGroup(icQuery)).toBe(true);
    expect(isICQuery(icQuery)).toBe(true);
  });

  it("returns false for standard group", () => {
    expect(isICGroup(query)).toBe(false);
  });
});

// ─── Path helpers ─────────────────────────────────────────────────────────────

describe("getParentPath", () => {
  it("removes the last element", () => {
    expect(getParentPath([0, 1, 2])).toEqual([0, 1]);
  });

  it("returns empty for single-element path", () => {
    expect(getParentPath([0])).toEqual([]);
  });
});

describe("pathsAreEqual", () => {
  it("returns true for equal paths", () => {
    expect(pathsAreEqual([0, 1], [0, 1])).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(pathsAreEqual([0], [0, 1])).toBe(false);
  });

  it("returns false for same length but different values", () => {
    expect(pathsAreEqual([0, 1], [0, 2])).toBe(false);
  });
});

describe("isAncestor", () => {
  it("returns true when path is a prefix of target", () => {
    expect(isAncestor([0], [0, 1])).toBe(true);
    expect(isAncestor([], [0])).toBe(true);
  });

  it("returns false for equal paths", () => {
    expect(isAncestor([0, 1], [0, 1])).toBe(false);
  });

  it("returns false when not a prefix", () => {
    expect(isAncestor([0, 2], [0, 1, 3])).toBe(false);
  });
});

describe("getCommonAncestorPath", () => {
  it("returns shared parent prefix", () => {
    expect(getCommonAncestorPath([0, 1], [0, 2])).toEqual([0]);
  });

  it("returns empty when siblings of root", () => {
    expect(getCommonAncestorPath([0], [1])).toEqual([]);
  });
});

// ─── Path resolution ──────────────────────────────────────────────────────────

describe("findPath", () => {
  it("returns root for empty path", () => {
    expect(findPath([], query)).toBe(query);
  });

  it("resolves a top-level rule", () => {
    expect(findPath([0], query)).toBe(rule1);
  });

  it("resolves into a nested group", () => {
    expect(findPath([1, 0], query)).toBe(rule2);
    expect(findPath([1, 1], query)).toBe(rule3);
  });

  it("returns undefined for out-of-bounds index", () => {
    expect(findPath([5], query)).toBeUndefined();
  });

  it("returns undefined when traversing into a rule", () => {
    expect(findPath([0, 0], query)).toBeUndefined();
  });
});

describe("findParent", () => {
  it("returns the root for a top-level node path", () => {
    expect(findParent([0], query)).toBe(query);
  });

  it("returns the nested group for a deep rule", () => {
    expect(findParent([1, 0], query)).toBe(nestedGroup);
  });

  it("returns undefined for empty path", () => {
    expect(findParent([], query)).toBeUndefined();
  });
});

// ─── ID-based lookup ──────────────────────────────────────────────────────────

describe("findID", () => {
  it("finds root by ID", () => {
    expect(findID("g1", query)).toBe(query);
  });

  it("finds a top-level rule by ID", () => {
    expect(findID("r1", query)).toBe(rule1);
  });

  it("finds a deeply nested rule", () => {
    expect(findID("r3", query)).toBe(rule3);
  });

  it("finds a nested group", () => {
    expect(findID("g2", query)).toBe(nestedGroup);
  });

  it("returns undefined for unknown ID", () => {
    expect(findID("nope", query)).toBeUndefined();
  });
});

describe("getPathOfID", () => {
  it("returns empty array for root ID", () => {
    expect(getPathOfID("g1", query)).toEqual([]);
  });

  it("returns correct path for top-level rule", () => {
    expect(getPathOfID("r1", query)).toEqual([0]);
  });

  it("returns correct path for nested rule", () => {
    expect(getPathOfID("r2", query)).toEqual([1, 0]);
    expect(getPathOfID("r3", query)).toEqual([1, 1]);
  });

  it("returns undefined for unknown ID", () => {
    expect(getPathOfID("nope", query)).toBeUndefined();
  });
});

// ─── resolvePath ──────────────────────────────────────────────────────────────

describe("resolvePath", () => {
  it("resolves a path array", () => {
    expect(resolvePath([0], query)).toEqual([0]);
  });

  it("resolves an ID string to a path", () => {
    expect(resolvePath("r2", query)).toEqual([1, 0]);
  });

  it("returns undefined for invalid path", () => {
    expect(resolvePath([99], query)).toBeUndefined();
  });

  it("returns undefined for unknown ID", () => {
    expect(resolvePath("zzz", query)).toBeUndefined();
  });
});

// ─── Disabled state ───────────────────────────────────────────────────────────

describe("isEffectivelyDisabled", () => {
  it("returns true when root is disabled", () => {
    const q: RuleGroup = { ...query, disabled: true };
    expect(isEffectivelyDisabled([0], q)).toBe(true);
  });

  it("returns true when a parent group is disabled", () => {
    const disabledNested: RuleGroup = { ...nestedGroup, disabled: true };
    const q: RuleGroup = { ...query, rules: [rule1, disabledNested] };
    expect(isEffectivelyDisabled([1, 0], q)).toBe(true);
  });

  it("returns true when the node itself is disabled", () => {
    const disabledRule: Rule = { ...rule1, disabled: true };
    const q: RuleGroup = { ...query, rules: [disabledRule, nestedGroup] };
    expect(isEffectivelyDisabled([0], q)).toBe(true);
  });

  it("returns false when nothing is disabled", () => {
    expect(isEffectivelyDisabled([0], query)).toBe(false);
    expect(isEffectivelyDisabled([1, 1], query)).toBe(false);
  });
});

// ─── Path annotation ──────────────────────────────────────────────────────────

describe("annotatePaths", () => {
  it("sets path on root to []", () => {
    const annotated = annotatePaths(query);
    expect(annotated.path).toEqual([]);
  });

  it("sets path on top-level children", () => {
    const annotated = annotatePaths(query);
    const r = (annotated as RuleGroup).rules[0] as Rule;
    expect(r.path).toEqual([0]);
  });

  it("sets nested paths correctly", () => {
    const annotated = annotatePaths(query);
    const nested = (annotated as RuleGroup).rules[1] as RuleGroup;
    expect(nested.path).toEqual([1]);
    const deepRule = nested.rules[0] as Rule;
    expect(deepRule.path).toEqual([1, 0]);
  });
});

describe("stripPaths", () => {
  it("removes path from root", () => {
    const annotated = annotatePaths(query);
    const stripped = stripPaths(annotated);
    expect(stripped.path).toBeUndefined();
  });

  it("removes path from nested rules", () => {
    const annotated = annotatePaths(query);
    const stripped = stripPaths(annotated) as RuleGroup;
    const r = stripped.rules[0] as Rule;
    expect(r.path).toBeUndefined();
  });

  it("round-trips: strip(annotate(q)) deep-equals q", () => {
    const stripped = stripPaths(annotatePaths(query));
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(query));
  });
});
