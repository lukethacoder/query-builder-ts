import type { AnyNode, AnyRuleGroup, Path, Rule, RuleGroup, RuleGroupIC } from "./types.js";

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isRuleGroup(node: AnyNode): node is RuleGroup | RuleGroupIC {
  return Array.isArray((node as RuleGroup).rules);
}

export function isRule(node: AnyNode): node is Rule {
  return !isRuleGroup(node) && typeof (node as Rule).field === "string";
}

export function isStandardGroup(node: AnyNode): node is RuleGroup {
  return isRuleGroup(node) && typeof (node as RuleGroup).combinator === "string";
}

export function isICGroup(node: AnyNode): node is RuleGroupIC {
  return isRuleGroup(node) && (node as RuleGroupIC).combinator === undefined;
}

export function isICQuery(query: AnyRuleGroup): query is RuleGroupIC {
  return isICGroup(query);
}

// ─── Path helpers (§4.6) ─────────────────────────────────────────────────────

export function getParentPath(path: Path): Path {
  return path.slice(0, -1);
}

export function pathsAreEqual(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function isAncestor(maybeAncestor: Path, path: Path): boolean {
  if (maybeAncestor.length >= path.length) return false;
  return maybeAncestor.every((v, i) => v === path[i]);
}

export function getCommonAncestorPath(a: Path, b: Path): Path {
  const pa = getParentPath(a);
  const pb = getParentPath(b);
  const common: number[] = [];
  const len = Math.min(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if (pa[i] === pb[i]) {
      common.push(pa[i] as number);
    } else {
      break;
    }
  }
  return common;
}

// ─── Path resolution (§4.2) ──────────────────────────────────────────────────

export function findPath(path: Path, query: AnyRuleGroup): AnyNode | undefined {
  if (path.length === 0) return query;

  let current: AnyNode = query;
  for (let level = 0; level < path.length; level++) {
    if (!isRuleGroup(current)) return undefined;
    const index = path[level] as number;
    const child = (current as RuleGroup).rules[index];
    if (child === undefined) return undefined;
    if (typeof child === "string") return undefined; // combinator slot
    current = child as AnyNode;
  }
  return current;
}

export function findParent(path: Path, query: AnyRuleGroup): AnyRuleGroup | undefined {
  if (path.length === 0) return undefined;
  const parent = findPath(getParentPath(path), query);
  if (parent && isRuleGroup(parent)) return parent as AnyRuleGroup;
  return undefined;
}

// ─── ID-based lookup (§4.6) ──────────────────────────────────────────────────

export function findID(id: string, query: AnyRuleGroup): AnyNode | undefined {
  if (query.id === id) return query;
  for (const child of (query as RuleGroup).rules) {
    if (typeof child === "string") continue;
    if ((child as AnyNode).id === id) return child as AnyNode;
    if (isRuleGroup(child as AnyNode)) {
      const found = findID(id, child as AnyRuleGroup);
      if (found) return found;
    }
  }
  return undefined;
}

export function getPathOfID(id: string, query: AnyRuleGroup): Path | undefined {
  if (query.id === id) return [];
  return searchPath(id, query, []);
}

function searchPath(id: string, group: AnyRuleGroup, base: Path): Path | undefined {
  const rules = (group as RuleGroup).rules;
  for (let i = 0; i < rules.length; i++) {
    const child = rules[i];
    if (typeof child === "string") continue;
    const node = child as AnyNode;
    const childPath = [...base, i];
    if (node.id === id) return childPath;
    if (isRuleGroup(node)) {
      const found = searchPath(id, node as AnyRuleGroup, childPath);
      if (found) return found;
    }
  }
  return undefined;
}

// ─── Path-or-id resolution (§5.1) ────────────────────────────────────────────

export function resolvePath(pathOrId: Path | string, query: AnyRuleGroup): Path | undefined {
  if (typeof pathOrId === "string") {
    return getPathOfID(pathOrId, query);
  }
  const node = findPath(pathOrId, query);
  return node !== undefined ? pathOrId : undefined;
}

// ─── Disabled-state inheritance (§4.5) ───────────────────────────────────────

export function isEffectivelyDisabled(path: Path, query: AnyRuleGroup): boolean {
  if (query.disabled === true) return true;
  let current: AnyNode = query;
  for (let level = 0; level < path.length; level++) {
    if (!isRuleGroup(current)) return false;
    const child = (current as RuleGroup).rules[path[level] as number];
    if (typeof child === "string") return false;
    const node = child as AnyNode;
    if (node.disabled === true) return true;
    current = node;
  }
  return false;
}

// ─── Path annotation ─────────────────────────────────────────────────────────

export function annotatePaths(query: AnyRuleGroup, basePath: Path = []): AnyRuleGroup {
  const rules = (query as RuleGroup).rules.map((child, i) => {
    if (typeof child === "string") return child;
    const node = child as AnyNode;
    const childPath = [...basePath, i];
    if (isRuleGroup(node)) {
      return annotatePaths(node as AnyRuleGroup, childPath);
    }
    return { ...node, path: childPath };
  });
  return { ...query, path: basePath, rules } as AnyRuleGroup;
}

export function stripPaths(query: AnyRuleGroup): AnyRuleGroup {
  const { path: _path, ...rest } = query as AnyRuleGroup & { path?: Path };
  const rules = (rest as RuleGroup).rules.map((child) => {
    if (typeof child === "string") return child;
    const node = child as AnyNode;
    if (isRuleGroup(node)) return stripPaths(node as AnyRuleGroup);
    const { path: _p, ...ruleRest } = node as Rule & { path?: Path };
    return ruleRest;
  });
  return { ...rest, rules } as AnyRuleGroup;
}
