import type { Combinator, Operator } from "./types.js";

export const DEFAULT_OPERATORS: Operator[] = [
  { name: "=", value: "=", label: "=" },
  { name: "!=", value: "!=", label: "!=" },
  { name: "<", value: "<", label: "<" },
  { name: ">", value: ">", label: ">" },
  { name: "<=", value: "<=", label: "<=" },
  { name: ">=", value: ">=", label: ">=" },
  { name: "contains", value: "contains", label: "contains" },
  { name: "beginsWith", value: "beginsWith", label: "begins with" },
  { name: "endsWith", value: "endsWith", label: "ends with" },
  { name: "doesNotContain", value: "doesNotContain", label: "does not contain" },
  { name: "doesNotBeginWith", value: "doesNotBeginWith", label: "does not begin with" },
  { name: "doesNotEndWith", value: "doesNotEndWith", label: "does not end with" },
  { name: "null", value: "null", label: "is null", arity: "unary" },
  { name: "notNull", value: "notNull", label: "is not null", arity: "unary" },
  { name: "in", value: "in", label: "in" },
  { name: "notIn", value: "notIn", label: "not in" },
  { name: "between", value: "between", label: "between", arity: "ternary" },
  { name: "notBetween", value: "notBetween", label: "not between", arity: "ternary" },
];

export const DEFAULT_COMBINATORS: Combinator[] = [
  { name: "and", value: "and", label: "AND" },
  { name: "or", value: "or", label: "OR" },
];

export const EXTENDED_COMBINATORS: Combinator[] = [
  ...DEFAULT_COMBINATORS,
  { name: "xor", value: "xor", label: "XOR" },
];

export const OPERATOR_NEGATION_MAP: Record<string, string> = {
  "=": "!=",
  "!=": "=",
  "<": ">=",
  ">=": "<",
  ">": "<=",
  "<=": ">",
  contains: "doesNotContain",
  doesNotContain: "contains",
  beginsWith: "doesNotBeginWith",
  doesNotBeginWith: "beginsWith",
  endsWith: "doesNotEndWith",
  doesNotEndWith: "endsWith",
  null: "notNull",
  notNull: "null",
  in: "notIn",
  notIn: "in",
  between: "notBetween",
  notBetween: "between",
};

// Custom operators (§2.9) — not in DEFAULT_OPERATORS; consumers opt in by adding to their operator list
export const OPERATOR_MATCHES_REGEX: Operator = {
  name: "matchesRegex",
  value: "matchesRegex",
  label: "matches regex",
  arity: "binary",
};

export const MULTI_VALUE_OPERATORS = new Set(["in", "notIn", "between", "notBetween"]);
export const UNARY_OPERATORS = new Set(["null", "notNull"]);
export const TERNARY_OPERATORS = new Set(["between", "notBetween"]);

export const PLACEHOLDER_NAME = "~";
export const PLACEHOLDER_LABEL = "------";
export const MATCH_THRESHOLD_PLACEHOLDER = "#";
export const DEFAULT_JOIN_CHAR = ",";
