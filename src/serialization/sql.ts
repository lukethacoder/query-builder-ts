import { parseMultiValue } from "../config.js";
import { MULTI_VALUE_OPERATORS, PLACEHOLDER_NAME, UNARY_OPERATORS } from "../defaults.js";
import { isICGroup, isRuleGroup, isStandardGroup } from "../paths.js";
import type {
  AnyRuleGroup,
  ParameterizedExportOptions,
  ParameterizedNamedResult,
  ParameterizedResult,
  Rule,
  RuleGroup,
  SqlExportOptions,
} from "../types.js";
import { isNodeValid } from "../validation.js";

const SQL_PRESETS: Record<string, Partial<ParameterizedExportOptions>> = {
  ansi: {},
  oracle: {},
  sqlite: { paramsKeepPrefix: true },
  mysql: { concatOperator: "CONCAT" },
  mssql: {
    concatOperator: "+",
    quoteFieldNamesWith: ["[", "]"],
    fieldIdentifierSeparator: ".",
    paramPrefix: "@",
  },
  postgresql: {
    quoteFieldNamesWith: '"',
    numberedParams: true,
    paramPrefix: "$",
  },
};

function resolvePreset(options: SqlExportOptions): SqlExportOptions {
  const preset = options.preset ?? "ansi";
  const presetOpts = SQL_PRESETS[preset] ?? {};
  return { ...presetOpts, ...options };
}

function quoteField(field: string, options: SqlExportOptions): string {
  const { quoteFieldNamesWith: q = ["", ""], fieldIdentifierSeparator: sep } = options;
  const [pre, suf] = typeof q === "string" ? [q, q] : (q as [string, string]);
  if (sep && field.includes(sep)) {
    return field
      .split(sep)
      .map((part) => `${pre}${part}${suf}`)
      .join(sep);
  }
  return `${pre}${field}${suf}`;
}

function quoteValue(val: string, options: SqlExportOptions): string {
  const q = options.quoteValuesWith ?? "'";
  return `${q}${val.replace(new RegExp(q, "g"), q + q)}${q}`;
}

function emitValue(val: unknown, options: SqlExportOptions, parseNumbers: boolean): string {
  if (parseNumbers && val !== "" && !Number.isNaN(Number(val))) {
    return String(val);
  }
  return quoteValue(String(val), options);
}

function isDroppedRule(rule: Rule, options: SqlExportOptions): boolean {
  const pf = options.placeholderFieldName ?? PLACEHOLDER_NAME;
  const po = options.placeholderOperatorName ?? PLACEHOLDER_NAME;
  const pv = options.placeholderValueName ?? PLACEHOLDER_NAME;
  if (rule.field === pf || rule.operator === po) return true;
  if (!UNARY_OPERATORS.has(rule.operator) && rule.value === pv) return true;
  return false;
}

function ruleToSql(rule: Rule, options: SqlExportOptions): string {
  const { operator, field, value } = rule;
  const qf = quoteField(field, options);
  const parse = !!options.parseNumbers;

  if (UNARY_OPERATORS.has(operator)) {
    return operator === "null" ? `${qf} is null` : `${qf} is not null`;
  }

  if (MULTI_VALUE_OPERATORS.has(operator)) {
    const vals = parseMultiValue(value);
    if (operator === "between" || operator === "notBetween") {
      if (vals.length < 2) return "";
      let [lo, hi] = [vals[0] as string, vals[1] as string];
      if (!options.preserveValueOrder && parse) {
        const [a, b] = [Number(lo), Number(hi)];
        if (!Number.isNaN(a) && !Number.isNaN(b) && a > b) [lo, hi] = [hi, lo];
      }
      const kw = operator === "between" ? "between" : "not between";
      return `${qf} ${kw} ${emitValue(lo, options, parse)} and ${emitValue(hi, options, parse)}`;
    }
    if (vals.length === 0) return "";
    const list = vals.map((v) => emitValue(v, options, parse)).join(", ");
    const kw = operator === "in" ? "in" : "not in";
    return `${qf} ${kw} (${list})`;
  }

  const sqlOp: Record<string, string> = {
    contains: "LIKE",
    doesNotContain: "NOT LIKE",
    beginsWith: "LIKE",
    doesNotBeginWith: "NOT LIKE",
    endsWith: "LIKE",
    doesNotEndWith: "NOT LIKE",
  };

  if (sqlOp[operator]) {
    const rawVal = String(value);
    let pattern = rawVal;
    if (operator === "contains" || operator === "doesNotContain") pattern = `%${rawVal}%`;
    else if (operator === "beginsWith" || operator === "doesNotBeginWith") pattern = `${rawVal}%`;
    else if (operator === "endsWith" || operator === "doesNotEndWith") pattern = `%${rawVal}`;
    return `${qf} ${sqlOp[operator]} ${quoteValue(pattern, options)}`;
  }

  return `${qf} ${operator} ${emitValue(value, options, parse)}`;
}

function groupToSql(
  group: AnyRuleGroup,
  options: SqlExportOptions,
  validationMap: ReturnType<typeof import("../validation.js").defaultValidator> | undefined,
): string {
  if (group.id && validationMap && !isNodeValid(group.id, validationMap)) {
    return "(1 = 1)";
  }

  const parts: string[] = [];
  const isIC = isICGroup(group);
  const rules = (group as RuleGroup).rules;
  let lastCombinator = isStandardGroup(group) ? group.combinator : "and";

  for (const item of rules) {
    if (typeof item === "string") {
      lastCombinator = item;
      continue;
    }
    const node = item as AnyRuleGroup | Rule;
    if (group.id && validationMap && !isNodeValid(group.id, validationMap)) continue;
    if (isRuleGroup(node as AnyRuleGroup)) {
      const sub = groupToSql(node as AnyRuleGroup, options, validationMap);
      if (sub) parts.push(sub);
    } else {
      const rule = node as Rule;
      if (isDroppedRule(rule, options)) continue;
      const clause = ruleToSql(rule, options);
      if (clause) parts.push(clause);
    }
  }

  if (parts.length === 0) return "(1 = 1)";

  const _sep = isIC ? ` ${lastCombinator} ` : ` ${lastCombinator} `;
  let result: string;
  if (isIC) {
    // Re-join with per-pair combinators
    result = joinICParts(rules as Array<AnyRuleGroup | Rule | string>, options, validationMap);
  } else {
    result = parts.join(` ${lastCombinator} `);
  }

  const _wrapped = parts.length > 1 ? `(${result})` : result;
  return group.not ? `NOT (${result})` : parts.length > 1 ? `(${result})` : result;
}

function joinICParts(
  rules: Array<AnyRuleGroup | Rule | string>,
  options: SqlExportOptions,
  validationMap: ReturnType<typeof import("../validation.js").defaultValidator> | undefined,
): string {
  const segments: string[] = [];
  let pendingCombinator = "";

  for (const item of rules) {
    if (typeof item === "string") {
      pendingCombinator = item;
      continue;
    }
    let clause: string;
    if (isRuleGroup(item as AnyRuleGroup)) {
      clause = groupToSql(item as AnyRuleGroup, options, validationMap);
    } else {
      clause = ruleToSql(item as Rule, options);
    }
    if (!clause) continue;
    if (segments.length > 0 && pendingCombinator) {
      segments.push(pendingCombinator);
    }
    segments.push(clause);
  }

  return segments.join(" ");
}

export function formatSql(group: AnyRuleGroup, opts: SqlExportOptions = {}): string {
  const options = resolvePreset(opts);
  const validationMap = options.validator ? options.validator(group) : undefined;
  const result = groupToSql(
    group,
    options,
    typeof validationMap === "object" ? validationMap : undefined,
  );
  return result;
}

// ─── parameterized (§7.4.2) ──────────────────────────────────────────────────

export function formatParameterized(
  group: AnyRuleGroup,
  opts: ParameterizedExportOptions = {},
): ParameterizedResult {
  const options = resolvePreset(opts) as ParameterizedExportOptions;
  const params: unknown[] = [];
  const sql = groupToSqlParameterized(group, options, params, false);
  return { sql, params };
}

export function formatParameterizedNamed(
  group: AnyRuleGroup,
  opts: ParameterizedExportOptions = {},
): ParameterizedNamedResult {
  const options = resolvePreset(opts) as ParameterizedExportOptions;
  const params: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  const sql = groupToSqlParameterized(group, options, params, true, counts);
  return { sql, params };
}

function addParam(
  value: unknown,
  field: string,
  options: ParameterizedExportOptions,
  params: unknown[] | Record<string, unknown>,
  named: boolean,
  counts?: Record<string, number>,
): string {
  const prefix = options.paramPrefix ?? (named ? ":" : "?");

  if (named && counts !== undefined) {
    const key = field.replace(/[^a-zA-Z0-9_]/g, "_");
    counts[key] = (counts[key] ?? 0) + 1;
    const paramKey = `${key}_${counts[key]}`;
    const recordParams = params as Record<string, unknown>;
    const fullKey = options.paramsKeepPrefix ? `${prefix}${paramKey}` : paramKey;
    recordParams[fullKey] = value;
    return `${prefix}${paramKey}`;
  }

  const arrParams = params as unknown[];
  if (options.numberedParams) {
    arrParams.push(value);
    return `${prefix}${arrParams.length}`;
  }
  arrParams.push(value);
  return "?";
}

function groupToSqlParameterized(
  group: AnyRuleGroup,
  options: ParameterizedExportOptions,
  params: unknown[] | Record<string, unknown>,
  named: boolean,
  counts?: Record<string, number>,
): string {
  const parts: string[] = [];
  const rules = (group as RuleGroup).rules;
  const _isIC = isICGroup(group);
  let comb = isStandardGroup(group) ? group.combinator : "and";

  for (const item of rules) {
    if (typeof item === "string") {
      comb = item;
      continue;
    }
    const node = item as AnyRuleGroup | Rule;
    if (isRuleGroup(node as AnyRuleGroup)) {
      const sub = groupToSqlParameterized(node as AnyRuleGroup, options, params, named, counts);
      if (sub) parts.push(sub);
    } else {
      const rule = node as Rule;
      if (isDroppedRule(rule, options)) continue;
      const clause = ruleToSqlParameterized(rule, options, params, named, counts);
      if (clause) parts.push(clause);
    }
  }

  if (parts.length === 0) return "(1 = 1)";
  const sep = ` ${comb} `;
  const joined = parts.join(sep);
  const wrapped = parts.length > 1 ? `(${joined})` : joined;
  return group.not ? `NOT (${joined})` : wrapped;
}

function ruleToSqlParameterized(
  rule: Rule,
  options: ParameterizedExportOptions,
  params: unknown[] | Record<string, unknown>,
  named: boolean,
  counts?: Record<string, number>,
): string {
  const { operator, field, value } = rule;
  const qf = quoteField(field, options);

  if (UNARY_OPERATORS.has(operator)) {
    return operator === "null" ? `${qf} is null` : `${qf} is not null`;
  }

  if (MULTI_VALUE_OPERATORS.has(operator)) {
    const vals = parseMultiValue(value);
    if (operator === "between" || operator === "notBetween") {
      if (vals.length < 2) return "";
      const ph1 = addParam(vals[0], field, options, params, named, counts);
      const ph2 = addParam(vals[1], field, options, params, named, counts);
      const kw = operator === "between" ? "between" : "not between";
      return `${qf} ${kw} ${ph1} and ${ph2}`;
    }
    if (vals.length === 0) return "";
    const placeholders = vals.map((v) => addParam(v, field, options, params, named, counts));
    const kw = operator === "in" ? "in" : "not in";
    return `${qf} ${kw} (${placeholders.join(", ")})`;
  }

  const sqlLike: Record<string, string> = {
    contains: "LIKE",
    doesNotContain: "NOT LIKE",
    beginsWith: "LIKE",
    doesNotBeginWith: "NOT LIKE",
    endsWith: "LIKE",
    doesNotEndWith: "NOT LIKE",
  };

  if (sqlLike[operator]) {
    const rawVal = String(value);
    let pattern = rawVal;
    if (operator === "contains" || operator === "doesNotContain") pattern = `%${rawVal}%`;
    else if (operator === "beginsWith" || operator === "doesNotBeginWith") pattern = `${rawVal}%`;
    else if (operator === "endsWith" || operator === "doesNotEndWith") pattern = `%${rawVal}`;
    const ph = addParam(pattern, field, options, params, named, counts);
    return `${qf} ${sqlLike[operator]} ${ph}`;
  }

  const ph = addParam(value, field, options, params, named, counts);
  return `${qf} ${operator} ${ph}`;
}
