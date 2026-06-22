import type {
  BaseOption,
  Field,
  FlexibleOption,
  FullOption,
  Operator,
  OptionGroup,
  OptionList,
  ValueSources,
} from "./types.js";

// ─── Normalization (§2.6) ─────────────────────────────────────────────────────

export function normalizeOption(opt: FlexibleOption | string): FullOption {
  if (typeof opt === "string") {
    return { name: opt, value: opt, label: opt };
  }
  const name = opt.name ?? opt.value ?? "";
  const value = opt.value ?? opt.name ?? "";
  const label = opt.label ?? name;
  return { ...opt, name, value, label };
}

export function normalizeOptionList<Opt extends BaseOption>(
  list: OptionList<Opt> | string[],
): OptionGroup<FullOption>[] | FullOption[] {
  if (list.length === 0) return [];

  const first = list[0];
  if (first !== undefined && typeof first === "object" && "options" in first) {
    return (list as OptionGroup<FlexibleOption>[]).map((group) => ({
      ...group,
      options: group.options.map(normalizeOption),
    }));
  }

  return (list as Array<FlexibleOption | string>).map(normalizeOption);
}

// ─── Lookup (§2.7) ────────────────────────────────────────────────────────────

export function findOption(
  list: Array<BaseOption | OptionGroup | string>,
  identifier: string,
): BaseOption | undefined {
  const items = flattenOptionList(list);
  return items.find((opt) => {
    if (typeof opt === "string") return opt === identifier;
    return (opt as FullOption).value === identifier || (opt as FullOption).name === identifier;
  }) as BaseOption | undefined;
}

export function flattenOptionList(
  list: Array<BaseOption | OptionGroup | string>,
): Array<BaseOption | string> {
  if (list.length === 0) return [];
  const first = list[0];
  if (first !== undefined && typeof first === "object" && "options" in first) {
    return (list as OptionGroup[]).flatMap((g) => g.options);
  }
  return list as Array<BaseOption | string>;
}

export function firstOption(list: Array<BaseOption | OptionGroup | string>): string | undefined {
  const flat = flattenOptionList(list);
  const first = flat[0];
  if (!first) return undefined;
  if (typeof first === "string") return first;
  return (first as FullOption).value ?? (first as FullOption).name;
}

// ─── Operator arity (§3.4) ────────────────────────────────────────────────────

export function getOperatorArity(operator: Operator | string): number {
  const op = typeof operator === "string" ? { name: operator, value: operator } : operator;
  const identifier = (op as FullOption).value ?? (op as FullOption).name ?? "";

  if ("arity" in op && op.arity !== undefined) {
    if (op.arity === "unary") return 1;
    if (op.arity === "binary") return 2;
    if (op.arity === "ternary") return 3;
    if (typeof op.arity === "number") return op.arity;
  }

  if (identifier === "null" || identifier === "notNull") return 1;
  if (identifier === "between" || identifier === "notBetween") return 3;
  return 2;
}

export function isUnaryOperator(operator: Operator | string): boolean {
  return getOperatorArity(operator) < 2;
}

// ─── Value sources (§2.7) ────────────────────────────────────────────────────

export function resolveValueSources(
  field: Field | undefined,
  operator: string,
  getValueSources?: (field: string, operator: string) => ValueSources,
): ValueSources {
  if (field?.valueSources) {
    const vs = field.valueSources;
    return typeof vs === "function" ? vs(operator) : vs;
  }
  if (getValueSources && field) {
    return getValueSources(field.value, operator);
  }
  return ["value"];
}

// ─── Multi-value encoding (§3.3) ─────────────────────────────────────────────

export function parseMultiValue(value: unknown, joinChar = ","): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return value == null ? [] : [String(value)];

  const result: string[] = [];
  let current = "";
  let i = 0;
  while (i < value.length) {
    if (value[i] === "\\" && value[i + 1] === joinChar) {
      current += joinChar;
      i += 2;
    } else if (value[i] === joinChar) {
      const trimmed = current.trim();
      if (trimmed.length > 0) result.push(trimmed);
      current = "";
      i++;
    } else {
      current += value[i];
      i++;
    }
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) result.push(trimmed);
  return result;
}

export function joinMultiValue(values: unknown[], joinChar = ","): string {
  return values
    .map((v) => String(v).replace(new RegExp(joinChar, "g"), `\\${joinChar}`))
    .join(joinChar);
}
