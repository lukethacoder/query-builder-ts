import { parseMultiValue } from "../config.js";
import { PLACEHOLDER_NAME, UNARY_OPERATORS } from "../defaults.js";
import { isICGroup, isRuleGroup, isStandardGroup } from "../paths.js";
import type { AnyRuleGroup, CommonExportOptions, Rule, RuleGroup } from "../types.js";

type MongoObject = Record<string, unknown>;

function isDropped(rule: Rule, opts: CommonExportOptions): boolean {
  const pf = opts.placeholderFieldName ?? PLACEHOLDER_NAME;
  const po = opts.placeholderOperatorName ?? PLACEHOLDER_NAME;
  if (rule.field === pf || rule.operator === po) return true;
  if (
    !UNARY_OPERATORS.has(rule.operator) &&
    rule.value === (opts.placeholderValueName ?? PLACEHOLDER_NAME)
  )
    return true;
  return false;
}

function ruleToMongo(rule: Rule): MongoObject | null {
  const { field, operator, value } = rule;

  if (UNARY_OPERATORS.has(operator)) {
    return { [field]: operator === "null" ? null : { $exists: true, $ne: null } };
  }

  const mongoOps: Record<string, string> = {
    "!=": "$ne",
    "<": "$lt",
    ">": "$gt",
    "<=": "$lte",
    ">=": "$gte",
  };

  if (operator === "=") return { [field]: value };
  if (mongoOps[operator]) return { [field]: { [mongoOps[operator]]: value } };

  if (operator === "in" || operator === "notIn") {
    const vals = parseMultiValue(value);
    const key = operator === "in" ? "$in" : "$nin";
    return { [field]: { [key]: vals } };
  }

  if (operator === "between" || operator === "notBetween") {
    const vals = parseMultiValue(value);
    if (vals.length < 2) return null;
    const [lo, hi] = [vals[0], vals[1]];
    if (operator === "between") {
      return { [field]: { $gte: lo, $lte: hi } };
    }
    return { $or: [{ [field]: { $lt: lo } }, { [field]: { $gt: hi } }] };
  }

  if (operator === "contains") return { [field]: { $regex: String(value) } };
  if (operator === "doesNotContain") return { [field]: { $not: { $regex: String(value) } } };
  if (operator === "beginsWith") return { [field]: { $regex: `^${String(value)}` } };
  if (operator === "doesNotBeginWith")
    return { [field]: { $not: { $regex: `^${String(value)}` } } };
  if (operator === "endsWith") return { [field]: { $regex: `${String(value)}$` } };
  if (operator === "doesNotEndWith") return { [field]: { $not: { $regex: `${String(value)}$` } } };

  return { [field]: value };
}

function groupToMongo(group: AnyRuleGroup, opts: CommonExportOptions): MongoObject {
  const children: MongoObject[] = [];
  const rules = (group as RuleGroup).rules;
  const _isIC = isICGroup(group);
  let comb = isStandardGroup(group) ? group.combinator : "and";

  for (const item of rules) {
    if (typeof item === "string") {
      comb = item;
      continue;
    }
    if (isRuleGroup(item as AnyRuleGroup)) {
      children.push(groupToMongo(item as AnyRuleGroup, opts));
    } else {
      const rule = item as Rule;
      if (isDropped(rule, opts)) continue;
      const doc = ruleToMongo(rule);
      if (doc) children.push(doc);
    }
  }

  if (children.length === 0) {
    return { $expr: true };
  }

  const mongoKey = comb === "or" ? "$or" : "$and";
  const combined = { [mongoKey]: children };
  return group.not ? { $nor: [combined] } : combined;
}

export function formatMongodbQuery(
  group: AnyRuleGroup,
  opts: CommonExportOptions = {},
): MongoObject {
  return groupToMongo(group, opts);
}
