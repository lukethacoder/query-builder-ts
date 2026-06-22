import { isRuleGroup, stripPaths } from "../paths.js";
import type { AnyNode, AnyRuleGroup, Rule, RuleGroup } from "../types.js";

// ─── json (§7.2) ──────────────────────────────────────────────────────────────

export function formatJson(query: AnyRuleGroup): string {
  return JSON.stringify(query, null, 2);
}

// ─── json_without_ids (§7.2) ──────────────────────────────────────────────────

export function formatJsonWithoutIds(query: AnyRuleGroup): string {
  const stripped = stripIds(stripPaths(query));
  return JSON.stringify(stripped);
}

function stripIds(query: AnyRuleGroup): AnyRuleGroup {
  const { id: _id, ...rest } = query as AnyRuleGroup & { id?: string };
  const rules = (rest as RuleGroup).rules.map((child) => {
    if (typeof child === "string") return child;
    const node = child as AnyNode;
    if (isRuleGroup(node)) return stripIds(node as AnyRuleGroup);
    const { id: _i, ...ruleRest } = node as Rule & { id?: string };
    return ruleRest;
  });
  return { ...rest, rules } as AnyRuleGroup;
}

// ─── Round-trip parse ─────────────────────────────────────────────────────────

export function parseJson(json: string): AnyRuleGroup {
  return JSON.parse(json) as AnyRuleGroup;
}
