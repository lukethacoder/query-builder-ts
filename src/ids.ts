import { isRuleGroup } from "./paths.js";
import type { AnyNode, AnyRuleGroup, Rule, RuleGroup } from "./types.js";

// UUID v4 generator (§5.8)
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Fill-if-missing (§5.8 "prepare")
export function prepareNode<T extends AnyNode>(
  node: T,
  idGenerator: () => string = generateUUID,
): T {
  if (isRuleGroup(node)) {
    const group = node as AnyRuleGroup;
    const rules = (group as RuleGroup).rules.map((child) => {
      if (typeof child === "string") return child;
      return prepareNode(child as AnyNode, idGenerator);
    });
    return { ...group, id: group.id ?? idGenerator(), rules } as unknown as T;
  }
  const rule = node as Rule;
  return { ...rule, id: rule.id ?? idGenerator() } as T;
}

// Regenerate all ids recursively (§5.8 "regenerate")
export function regenerateIds<T extends AnyNode>(
  node: T,
  idGenerator: () => string = generateUUID,
): T {
  if (isRuleGroup(node)) {
    const group = node as AnyRuleGroup;
    const rules = (group as RuleGroup).rules.map((child) => {
      if (typeof child === "string") return child;
      return regenerateIds(child as AnyNode, idGenerator);
    });
    return { ...group, id: idGenerator(), rules } as unknown as T;
  }
  return { ...(node as Rule), id: idGenerator() } as T;
}
