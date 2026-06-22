import { firstOption } from "./config.js";
import { DEFAULT_COMBINATORS } from "./defaults.js";
import { generateUUID, prepareNode, regenerateIds } from "./ids.js";
import {
  findPath,
  getCommonAncestorPath,
  getParentPath,
  isICGroup,
  isICQuery,
  isRuleGroup,
  pathsAreEqual,
  resolvePath,
} from "./paths.js";
import type {
  AnyNode,
  AnyRuleGroup,
  Field,
  OptionList,
  Path,
  Rule,
  RuleGroup,
  RuleGroupIC,
  ValueSources,
} from "./types.js";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function cloneGroup(group: AnyRuleGroup, idGenerator: () => string): AnyRuleGroup {
  return regenerateIds(group, idGenerator) as AnyRuleGroup;
}

function setAtPath(query: AnyRuleGroup, path: Path, newNode: AnyNode | string): AnyRuleGroup {
  if (path.length === 0) return newNode as AnyRuleGroup;
  const parentPath = getParentPath(path);
  const index = path[path.length - 1] as number;
  const parent = findPath(parentPath, query) as AnyRuleGroup;
  const newRules = [...(parent as RuleGroup).rules] as Array<AnyNode | string>;
  newRules[index] = newNode;
  return replaceAt(query, parentPath, { ...(parent as object), rules: newRules } as AnyRuleGroup);
}

function replaceAt(query: AnyRuleGroup, path: Path, replacement: AnyRuleGroup): AnyRuleGroup {
  if (path.length === 0) return replacement;
  const parentPath = getParentPath(path);
  const index = path[path.length - 1] as number;
  const parent = findPath(parentPath, query) as AnyRuleGroup;
  const newRules = [...(parent as RuleGroup).rules] as Array<AnyNode | string>;
  newRules[index] = replacement as AnyNode;
  return replaceAt(query, parentPath, { ...(parent as object), rules: newRules } as AnyRuleGroup);
}

function spliceRules(
  query: AnyRuleGroup,
  parentPath: Path,
  start: number,
  deleteCount: number,
  ...items: Array<AnyNode | string>
): AnyRuleGroup {
  const parent = findPath(parentPath, query) as AnyRuleGroup;
  const newRules = [...(parent as RuleGroup).rules] as Array<AnyNode | string>;
  newRules.splice(start, deleteCount, ...items);
  const newParent = { ...parent, rules: newRules } as AnyRuleGroup;
  if (parentPath.length === 0) return newParent;
  return replaceAt(query, parentPath, newParent);
}

function pickCombinator(options?: OptionList, explicit?: string): string {
  if (explicit) return explicit;
  if (options) {
    const f = firstOption(options);
    if (f) return f;
  }
  return firstOption(DEFAULT_COMBINATORS) ?? "and";
}

// ─── add (§5.2) ──────────────────────────────────────────────────────────────

export interface AddOptions {
  combinators?: OptionList;
  combinatorPreceding?: string;
  idGenerator?: () => string;
}

export function add(
  query: AnyRuleGroup,
  ruleOrGroup: AnyNode,
  parentPath: Path | string,
  options: AddOptions = {},
): AnyRuleGroup {
  const { combinators, combinatorPreceding, idGenerator = generateUUID } = options;
  const resolvedPath = resolvePath(parentPath, query);
  if (resolvedPath === undefined) return query;

  const parent = findPath(resolvedPath, query);
  if (!parent || !isRuleGroup(parent)) return query;

  const prepared = prepareNode(ruleOrGroup, idGenerator) as AnyNode;
  const parentGroup = parent as RuleGroup;
  const isIC = isICGroup(parent);

  if (isIC && parentGroup.rules.length > 0) {
    // Pick combinator: explicit > last existing > first of list > default
    let combinator = combinatorPreceding;
    if (!combinator) {
      const rules = parentGroup.rules;
      const secondToLast = rules[rules.length - 2];
      if (typeof secondToLast === "string") {
        combinator = secondToLast;
      }
    }
    if (!combinator) {
      combinator = pickCombinator(combinators);
    }
    return spliceRules(query, resolvedPath, parentGroup.rules.length, 0, combinator, prepared);
  }

  return spliceRules(query, resolvedPath, parentGroup.rules.length, 0, prepared);
}

// ─── remove (§5.3) ───────────────────────────────────────────────────────────

export function remove(query: AnyRuleGroup, path: Path | string): AnyRuleGroup {
  const resolvedPath = resolvePath(path, query);
  if (!resolvedPath || resolvedPath.length === 0) return query;

  const index = resolvedPath[resolvedPath.length - 1] as number;
  // Odd index = combinator slot, not addressable
  if (isICQuery(query) && index % 2 !== 0) return query;

  const parentPath = getParentPath(resolvedPath);
  const parent = findPath(parentPath, query) as AnyRuleGroup | undefined;
  if (!parent || !isRuleGroup(parent)) return query;

  const parentRules = (parent as RuleGroup).rules;
  const isIC = isICGroup(parent);

  if (isIC && parentRules.length > 1) {
    const start = index === 0 ? 0 : index - 1;
    return spliceRules(query, parentPath, start, 2);
  }

  return spliceRules(query, parentPath, index, 1);
}

// ─── update (§5.4) ───────────────────────────────────────────────────────────

export interface UpdateOptions {
  resetOnFieldChange?: boolean;
  resetOnOperatorChange?: boolean;
  getRuleDefaultOperator?: (field: string) => string;
  getValueSources?: (field: string, operator: string) => ValueSources;
  getRuleDefaultValue?: (rule: Rule) => unknown;
  getMatchModes?: (field: string) => OptionList | null;
  fields?: OptionList<Field>;
  idGenerator?: () => string;
}

export function update(
  query: AnyRuleGroup,
  property: string,
  value: unknown,
  path: Path | string,
  options: UpdateOptions = {},
): AnyRuleGroup {
  const resolvedPath = resolvePath(path, query);
  if (resolvedPath === undefined) return query;

  // IC combinator slot update
  if (isICQuery(query) && property === "combinator") {
    const index = resolvedPath[resolvedPath.length - 1];
    if (typeof index !== "number" || index % 2 === 0) return query;
    return setAtPath(query, resolvedPath, value as string);
  }

  const node = findPath(resolvedPath, query);
  if (!node) return query;

  // Short-circuit if no change
  if ((node as unknown as Record<string, unknown>)[property] === value) return query;

  if (isRuleGroup(node)) {
    return setAtPath(query, resolvedPath, { ...node, [property]: value } as AnyRuleGroup);
  }

  // Rule updates with cascading resets
  const rule = node as Rule;
  const {
    resetOnFieldChange = true,
    resetOnOperatorChange = false,
    getRuleDefaultOperator,
    getValueSources,
    getRuleDefaultValue,
    getMatchModes,
    idGenerator: _idGenerator = generateUUID,
  } = options;

  let updated: Rule = { ...rule, [property]: value };

  if (property === "field") {
    const newField = value as string;
    const matchModes = getMatchModes ? getMatchModes(newField) : null;
    const oldMatchModes = getMatchModes ? getMatchModes(rule.field) : null;
    const forceReset = resetOnFieldChange || !!matchModes || !!oldMatchModes;

    if (matchModes !== null && matchModes !== undefined) {
      // field supports match modes: value should be a sub-query
    } else {
      // clear match
      const { match: _m, ...rest } = updated;
      updated = rest as Rule;
    }

    if (forceReset) {
      const newOperator = getRuleDefaultOperator
        ? getRuleDefaultOperator(newField)
        : updated.operator;
      const newValueSources = getValueSources
        ? getValueSources(newField, newOperator)
        : ["value" as const];
      const newValueSource = newValueSources[0] ?? "value";
      const newValue = getRuleDefaultValue ? getRuleDefaultValue(updated) : "";
      updated = {
        ...updated,
        operator: newOperator,
        valueSource: newValueSource,
        value: newValue,
      };
    }
  } else if (property === "operator" && resetOnOperatorChange) {
    const newOp = value as string;
    const vSources = getValueSources ? getValueSources(rule.field, newOp) : ["value" as const];
    updated = {
      ...updated,
      valueSource: vSources[0] ?? "value",
      value: "",
    };
  } else if (property === "valueSource") {
    const newSource = value as "value" | "field";
    const newValue = getRuleDefaultValue ? getRuleDefaultValue(updated) : "";
    updated = { ...updated, valueSource: newSource, value: newValue };
  }

  return setAtPath(query, resolvedPath, updated);
}

// ─── move (§5.5) ─────────────────────────────────────────────────────────────

export interface MoveOptions {
  clone?: boolean;
  combinators?: OptionList;
  idGenerator?: () => string;
}

export function move(
  query: AnyRuleGroup,
  fromPath: Path | string,
  toPath: Path | string | "up" | "down",
  options: MoveOptions = {},
): AnyRuleGroup {
  const { clone = false, combinators, idGenerator = generateUUID } = options;

  const resolvedFrom = resolvePath(fromPath, query);
  if (!resolvedFrom || resolvedFrom.length === 0) return query;

  // Resolve direction
  let resolvedTo: Path;
  if (toPath === "up" || toPath === "down") {
    const concrete = resolveDirection(toPath, resolvedFrom, query);
    if (!concrete) return query;
    resolvedTo = concrete;
  } else {
    const p = resolvePath(toPath, query);
    if (!p) return query;
    resolvedTo = p;
  }

  if (pathsAreEqual(resolvedFrom, resolvedTo)) return query;

  const fromParentPath = getParentPath(resolvedFrom);
  const toParentPath = getParentPath(resolvedTo);
  if (toParentPath === undefined) return query;

  const toParent = findPath(toParentPath, query);
  if (!toParent || !isRuleGroup(toParent)) return query;

  const sourceNode = findPath(resolvedFrom, query) as AnyNode;
  const movedNode = clone
    ? (cloneGroup(sourceNode as AnyRuleGroup, idGenerator) as AnyNode)
    : sourceNode;

  // Remove source (unless cloning)
  let working = clone ? query : remove(query, resolvedFrom);

  // Index shift correction
  let adjustedTo = resolvedTo;
  if (!clone) {
    const commonAncestor = getCommonAncestorPath(resolvedFrom, resolvedTo);
    const fromParentIsCommon =
      fromParentPath.length === commonAncestor.length &&
      pathsAreEqual(fromParentPath, commonAncestor);
    if (fromParentIsCommon) {
      const fromIndex = resolvedFrom[resolvedFrom.length - 1] as number;
      const toIndex = resolvedTo[resolvedTo.length - 1] as number;
      if (toIndex > fromIndex) {
        const stride = isICQuery(query) ? 2 : 1;
        const newLastIndex = toIndex - stride;
        adjustedTo = [...resolvedTo.slice(0, -1), newLastIndex];
      }
    }
  }

  // Insert at target
  working = insertAtPath(working, movedNode, adjustedTo, combinators, idGenerator);
  return working;
}

function insertAtPath(
  query: AnyRuleGroup,
  node: AnyNode,
  path: Path,
  combinators?: OptionList,
  _idGenerator?: () => string,
): AnyRuleGroup {
  const parentPath = getParentPath(path);
  const index = path[path.length - 1] as number;
  const parent = findPath(parentPath, query) as AnyRuleGroup | undefined;
  if (!parent || !isRuleGroup(parent)) return query;

  const isIC = isICGroup(parent);
  const parentRules = (parent as RuleGroup).rules as Array<AnyNode | string>;

  if (!isIC || parentRules.length === 0) {
    return spliceRules(query, parentPath, index, 0, node);
  }

  if (index === 0) {
    const succ =
      typeof parentRules[0] === "string" ? (parentRules[0] as string) : pickCombinator(combinators);
    return spliceRules(query, parentPath, 0, 0, node, succ);
  }

  const adjIndex = index % 2 === 0 ? index - 1 : index;
  const prec =
    typeof parentRules[adjIndex - 1] === "string"
      ? (parentRules[adjIndex - 1] as string)
      : pickCombinator(combinators);
  return spliceRules(query, parentPath, adjIndex, 0, prec, node);
}

function resolveDirection(dir: "up" | "down", path: Path, query: AnyRuleGroup): Path | undefined {
  const stride = isICQuery(query) ? 2 : 1;
  const index = path[path.length - 1] as number;
  const parentPath = getParentPath(path);
  const parent = findPath(parentPath, query) as AnyRuleGroup | undefined;
  if (!parent || !isRuleGroup(parent)) return undefined;

  const parentRules = (parent as RuleGroup).rules;

  if (dir === "up") {
    if (index - stride >= 0) {
      return [...parentPath, index - stride];
    }
    // ascend
    if (parentPath.length === 0) return undefined;
    return parentPath;
  }

  // down
  if (index + stride <= parentRules.length - 1) {
    return [...parentPath, index + stride];
  }
  // descend into next sibling group, or ascend
  return undefined;
}

// ─── insert (§5.6) ───────────────────────────────────────────────────────────

export interface InsertOptions {
  combinators?: OptionList;
  combinatorPreceding?: string;
  combinatorSucceeding?: string;
  idGenerator?: () => string;
  replace?: boolean;
}

export function insert(
  query: AnyRuleGroup,
  ruleOrGroup: AnyNode,
  path: Path | string,
  options: InsertOptions = {},
): AnyRuleGroup {
  const {
    combinators,
    combinatorPreceding,
    combinatorSucceeding,
    idGenerator = generateUUID,
    replace = false,
  } = options;

  const resolvedPath = resolvePath(path, query);
  if (!resolvedPath) return query;

  const parentPath = getParentPath(resolvedPath);
  const parent = findPath(parentPath, query);
  if (!parent || !isRuleGroup(parent)) return query;

  // Always regenerate ids on insert
  const prepared = regenerateIds(ruleOrGroup, idGenerator) as AnyNode;
  const index = resolvedPath[resolvedPath.length - 1] as number;
  const isIC = isICGroup(parent);
  const parentRules = (parent as RuleGroup).rules as Array<AnyNode | string>;

  if (!isIC || parentRules.length === 0) {
    return spliceRules(query, parentPath, index, replace ? 1 : 0, prepared);
  }

  if (replace) {
    const snapped = index + (index % 2);
    return spliceRules(query, parentPath, snapped, 1, prepared);
  }

  if (index === 0) {
    const succ =
      combinatorSucceeding ??
      (typeof parentRules[1] === "string" ? (parentRules[1] as string) : undefined) ??
      combinatorPreceding ??
      pickCombinator(combinators);
    return spliceRules(query, parentPath, 0, 0, prepared, succ);
  }

  const adjIndex = index % 2 === 0 ? index - 1 : index;
  const prec =
    combinatorPreceding ??
    (typeof parentRules[adjIndex - 1] === "string"
      ? (parentRules[adjIndex - 1] as string)
      : undefined) ??
    pickCombinator(combinators);
  return spliceRules(query, parentPath, adjIndex, 0, prec, prepared);
}

// ─── group (§5.7) ────────────────────────────────────────────────────────────

export interface GroupOptions {
  clone?: boolean;
  combinators?: OptionList;
  idGenerator?: () => string;
}

export function group(
  query: AnyRuleGroup,
  sourcePath: Path | string,
  targetPath: Path | string,
  options: GroupOptions = {},
): AnyRuleGroup {
  const { clone = false, combinators, idGenerator = generateUUID } = options;

  const resolvedSource = resolvePath(sourcePath, query);
  const resolvedTarget = resolvePath(targetPath, query);

  if (!resolvedSource || resolvedSource.length === 0) return query;
  if (!resolvedTarget) return query;
  if (pathsAreEqual(resolvedSource, resolvedTarget)) return query;

  const targetParentPath = getParentPath(resolvedTarget);
  const targetParent = findPath(targetParentPath, query);
  if (!targetParent || !isRuleGroup(targetParent)) return query;

  const sourceNode = findPath(resolvedSource, query) as AnyNode;
  const targetNode = findPath(resolvedTarget, query) as AnyNode;

  const movedSource = clone ? regenerateIds(sourceNode, idGenerator) : sourceNode;

  const working = clone ? query : remove(query, resolvedSource);

  // Index shift after source removal
  let adjustedTarget = resolvedTarget;
  if (!clone) {
    const commonAncestor = getCommonAncestorPath(resolvedSource, resolvedTarget);
    const sourceParentPath = getParentPath(resolvedSource);
    const sourceParentIsCommon =
      sourceParentPath.length === commonAncestor.length &&
      pathsAreEqual(sourceParentPath, commonAncestor);
    if (sourceParentIsCommon) {
      const fromIndex = resolvedSource[resolvedSource.length - 1] as number;
      const toIndex = resolvedTarget[resolvedTarget.length - 1] as number;
      if (toIndex > fromIndex) {
        const stride = isICQuery(query) ? 2 : 1;
        adjustedTarget = [...resolvedTarget.slice(0, -1), toIndex - stride];
      }
    }
  }

  const combinator = pickCombinator(combinators);
  const newGroup: AnyRuleGroup = isICQuery(query)
    ? ({
        id: idGenerator(),
        rules: [targetNode, combinator, movedSource],
      } as RuleGroupIC)
    : ({
        id: idGenerator(),
        combinator,
        rules: [targetNode, movedSource],
      } as RuleGroup);

  return setAtPath(working, adjustedTarget, newGroup);
}

// ─── IC conversion helpers (§7.8) ────────────────────────────────────────────

export function convertToIC(query: RuleGroup, defaultCombinator?: string): RuleGroupIC {
  const comb = defaultCombinator ?? query.combinator;
  const rules: Array<AnyNode | string> = [];
  const sourceRules = query.rules;
  for (let i = 0; i < sourceRules.length; i++) {
    const child = sourceRules[i] as AnyNode;
    if (i > 0) rules.push(comb);
    rules.push(isRuleGroup(child) ? convertToIC(child as RuleGroup) : child);
  }
  const { combinator: _c, ...rest } = query;
  return { ...rest, rules } as RuleGroupIC;
}

export function convertFromIC(query: RuleGroupIC, defaultCombinator = "and"): RuleGroup {
  const sourceRules = (query as unknown as { rules: Array<AnyNode | string> }).rules;
  const rules: AnyNode[] = [];
  let combinator = defaultCombinator;
  for (const item of sourceRules) {
    if (typeof item === "string") {
      combinator = item;
    } else {
      rules.push(
        isRuleGroup(item as AnyNode) ? convertFromIC(item as RuleGroupIC) : (item as AnyNode),
      );
    }
  }
  return { ...query, combinator, rules } as RuleGroup;
}
