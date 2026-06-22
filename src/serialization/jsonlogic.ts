import { parseMultiValue } from "../config.js";
import { PLACEHOLDER_NAME, UNARY_OPERATORS } from "../defaults.js";
import { isRuleGroup, isStandardGroup } from "../paths.js";
import type { AnyRuleGroup, CommonExportOptions, Rule, RuleGroup } from "../types.js";

type JsonLogicNode = Record<string, unknown> | string | number | boolean | null;

function field(name: string): JsonLogicNode {
  return { var: name };
}

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

function ruleToJsonLogic(rule: Rule): JsonLogicNode | null {
  const { field: fieldName, operator, value } = rule;
  const f = field(fieldName);

  const opMap: Record<string, string> = {
    "=": "==",
    "!=": "!=",
    "<": "<",
    ">": ">",
    "<=": "<=",
    ">=": ">=",
  };

  if (opMap[operator]) {
    return { [opMap[operator]]: [f, value] };
  }

  if (UNARY_OPERATORS.has(operator)) {
    return operator === "null" ? { "==": [f, null] } : { "!=": [f, null] };
  }

  if (operator === "in" || operator === "notIn") {
    const vals = parseMultiValue(value);
    const logic: JsonLogicNode = { in: [f, vals] };
    return operator === "notIn" ? { "!": logic } : logic;
  }

  if (operator === "between" || operator === "notBetween") {
    const vals = parseMultiValue(value);
    if (vals.length < 2) return null;
    const logic: JsonLogicNode = { "<=": [vals[0], f, vals[1]] };
    return operator === "notBetween" ? { "!": logic } : logic;
  }

  if (operator === "contains") return { in: [String(value), { var: fieldName }] };
  if (operator === "doesNotContain") return { "!": { in: [String(value), f] } };
  if (operator === "beginsWith") return { startsWith: [f, String(value)] };
  if (operator === "doesNotBeginWith") return { "!": { startsWith: [f, String(value)] } };
  if (operator === "endsWith") return { endsWith: [f, String(value)] };
  if (operator === "doesNotEndWith") return { "!": { endsWith: [f, String(value)] } };

  return { "==": [f, value] };
}

function groupToJsonLogic(group: AnyRuleGroup, opts: CommonExportOptions): JsonLogicNode {
  const children: JsonLogicNode[] = [];
  const rules = (group as RuleGroup).rules;
  let comb = isStandardGroup(group) ? group.combinator : "and";

  for (const item of rules) {
    if (typeof item === "string") {
      comb = item;
      continue;
    }
    if (isRuleGroup(item as AnyRuleGroup)) {
      children.push(groupToJsonLogic(item as AnyRuleGroup, opts));
    } else {
      const rule = item as Rule;
      if (isDropped(rule, opts)) continue;
      const node = ruleToJsonLogic(rule);
      if (node !== null) children.push(node);
    }
  }

  if (children.length === 0) return { "==": [1, 1] };

  const jlKey = comb === "or" ? "or" : "and";
  const combined: JsonLogicNode = { [jlKey]: children };
  return group.not ? { "!": combined } : combined;
}

export function formatJsonLogic(
  group: AnyRuleGroup,
  opts: CommonExportOptions = {},
): JsonLogicNode {
  return groupToJsonLogic(group, opts);
}
