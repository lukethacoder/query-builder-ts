// ─── Common ──────────────────────────────────────────────────────────────────

export interface CommonProperties {
  id?: string;
  path?: number[];
  disabled?: boolean;
}

// ─── Value editor / input types (§2.4) ───────────────────────────────────────

export type ValueEditorType =
  | "text"
  | "select"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "textarea"
  | "switch"
  | null;

export type ValueSource = "value" | "field";
export type ValueSources = ["value"] | ["value", "field"] | ["field", "value"] | ["field"];

export type InputType =
  | "text"
  | "number"
  | "date"
  | "datetime-local"
  | "time"
  | "email"
  | "tel"
  | "url"
  | "password"
  | "color"
  | "range"
  | "month"
  | "week"
  | "search"
  | "bigint"
  | (string & Record<never, never>);

// ─── Match modes (§1.4) ───────────────────────────────────────────────────────

export type MatchMode = "all" | "some" | "none" | "atLeast" | "atMost" | "exactly";

export interface MatchConfig {
  mode: MatchMode;
  threshold?: number | null;
}

// ─── Rule (§1.3) ──────────────────────────────────────────────────────────────

export interface Rule extends CommonProperties {
  field: string;
  operator: string;
  value: unknown;
  valueSource?: ValueSource;
  match?: MatchConfig;
}

// ─── Groups (§1.5, §1.6) ─────────────────────────────────────────────────────

export interface RuleGroup extends CommonProperties {
  combinator: string;
  rules: Array<Rule | RuleGroup>;
  not?: boolean;
}

export type ICChild = Rule | RuleGroupIC;
export type ICArray = [] | [ICChild] | [ICChild, ...Array<string | ICChild>];

export interface RuleGroupIC extends CommonProperties {
  combinator?: undefined;
  rules: ICArray;
  not?: boolean;
}

export type AnyRuleGroup = RuleGroup | RuleGroupIC;
export type AnyNode = Rule | RuleGroup | RuleGroupIC;

// ─── Path (§4.1) ──────────────────────────────────────────────────────────────

export type Path = number[];

// ─── Options (§2.1) ──────────────────────────────────────────────────────────

export interface BaseOption {
  name?: string;
  value?: string;
  label: string;
  disabled?: boolean;
}

export interface Option extends BaseOption {
  name: string;
}

export interface ValueOption extends BaseOption {
  value: string;
}

export interface FlexibleOption extends BaseOption {
  name?: string;
  value?: string;
}

export interface FullOption extends BaseOption {
  name: string;
  value: string;
}

export type FlexibleOptionOrString = FlexibleOption | string;

// ─── Option groups (§2.2) ─────────────────────────────────────────────────────

export interface OptionGroup<Opt extends BaseOption = FullOption> {
  label: string;
  options: Opt[];
}

export type OptionList<Opt extends BaseOption = FullOption> = Opt[] | OptionGroup<Opt>[];

export type FlexibleOptionList = FlexibleOptionOrString[] | OptionGroup<FlexibleOption>[];

// ─── Operator / Combinator (§2.5) ────────────────────────────────────────────

export interface Operator extends FullOption {
  arity?: number | "unary" | "binary" | "ternary";
}

export type Combinator = FullOption;

// ─── Validators (§6.1, §6.2) ──────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reasons?: unknown[];
}

export type ValidationMap = Record<string, boolean | ValidationResult>;

export type QueryValidator = (query: RuleGroup | RuleGroupIC) => boolean | ValidationMap;

export type RuleValidator = (rule: Rule) => boolean | ValidationResult;

// ─── Field (§2.3) ─────────────────────────────────────────────────────────────

export interface Field extends FullOption {
  operators?: OptionList<Operator> | string[];
  valueEditorType?: ValueEditorType | ((operator: string) => ValueEditorType);
  valueSources?: ValueSources | ((operator: string) => ValueSources);
  inputType?: InputType | null;
  values?: OptionList<Option>;
  defaultOperator?: string;
  defaultValue?: unknown;
  placeholder?: string;
  validator?: RuleValidator;
  comparator?: string | ((field: Field, operator: string) => boolean);
  matchModes?: boolean | MatchMode[] | OptionList<Option>;
  subproperties?: OptionList<Field>;
}

// ─── Export option types (§7.1) ───────────────────────────────────────────────

export type ParseNumbers = boolean | "strict" | "native" | "enhanced";

export interface CommonExportOptions {
  fields?: OptionList<Field>;
  validator?: QueryValidator;
  parseNumbers?: ParseNumbers;
  placeholderFieldName?: string;
  placeholderOperatorName?: string;
  placeholderValueName?: string;
  preserveValueOrder?: boolean;
  ruleProcessor?: (rule: Rule, options?: CommonExportOptions) => string;
  operatorProcessor?: (rule: Rule, options?: CommonExportOptions) => string;
  valueProcessor?: (rule: Rule, options?: CommonExportOptions) => string;
  ruleGroupProcessor?: (group: AnyRuleGroup, options?: CommonExportOptions) => string;
}

export interface SqlExportOptions extends CommonExportOptions {
  quoteFieldNamesWith?: string | [string, string];
  fieldIdentifierSeparator?: string;
  quoteValuesWith?: string;
  concatOperator?: string;
  preset?: "ansi" | "oracle" | "sqlite" | "mysql" | "mssql" | "postgresql";
}

export interface ParameterizedExportOptions extends SqlExportOptions {
  numberedParams?: boolean;
  paramPrefix?: string;
  paramsKeepPrefix?: boolean;
}

export interface ParameterizedResult {
  sql: string;
  params: unknown[];
}

export interface ParameterizedNamedResult {
  sql: string;
  params: Record<string, unknown>;
}
