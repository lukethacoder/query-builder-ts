import { flattenOptionList } from "./config.js";
import { DEFAULT_COMBINATORS } from "./defaults.js";
import { isICGroup, isRuleGroup, isStandardGroup } from "./paths.js";
import type {
  AnyRuleGroup,
  FullOption,
  RuleGroup,
  RuleGroupIC,
  ValidationMap,
  ValidationResult,
} from "./types.js";

// ─── Default query validator (§6.3) ──────────────────────────────────────────

export function defaultValidator(query: RuleGroup | RuleGroupIC): ValidationMap {
  const map: ValidationMap = {};
  validateGroup(query, map);
  return map;
}

function validateGroup(group: AnyRuleGroup, map: ValidationMap): void {
  if (group.id) {
    const result = validateGroupNode(group);
    map[group.id] = result;
  }

  const rules = (group as RuleGroup).rules;
  for (const child of rules) {
    if (typeof child === "string") continue;
    if (isRuleGroup(child)) {
      validateGroup(child as AnyRuleGroup, map);
    }
  }
}

function validateGroupNode(group: AnyRuleGroup): ValidationResult {
  const rules = (group as RuleGroup).rules;
  const reasons: string[] = [];

  if (rules.length === 0) {
    reasons.push("empty");
  }

  if (isStandardGroup(group) && rules.length > 1) {
    const knownCombinators = new Set(
      flattenOptionList(DEFAULT_COMBINATORS).map((c) =>
        typeof c === "string" ? c : (c as FullOption).value,
      ),
    );
    if (!knownCombinators.has(group.combinator)) {
      reasons.push("invalidCombinator");
    }
  }

  if (isICGroup(group)) {
    const icRules = rules as Array<unknown>;
    for (let i = 0; i < icRules.length; i++) {
      const expected = i % 2 === 0 ? "node" : "combinator";
      const item = icRules[i];
      if (expected === "node" && typeof item === "string") {
        reasons.push("invalidIndependentCombinators");
        break;
      }
      if (expected === "combinator" && typeof item !== "string") {
        reasons.push("invalidIndependentCombinators");
        break;
      }
    }
    if (icRules.length > 0 && icRules.length % 2 === 0) {
      reasons.push("invalidIndependentCombinators");
    }
  }

  return reasons.length > 0 ? { valid: false, reasons } : { valid: true };
}

// ─── Combine results (§6.2) ──────────────────────────────────────────────────

export function mergeValidationMaps(
  ...maps: Array<boolean | ValidationMap>
): ValidationMap | boolean {
  const merged: ValidationMap = {};
  let allBoolean = true;
  let booleanResult = true;

  for (const map of maps) {
    if (typeof map === "boolean") {
      if (!map) booleanResult = false;
    } else {
      allBoolean = false;
      for (const [id, result] of Object.entries(map)) {
        const existing = merged[id];
        if (existing === undefined) {
          merged[id] = result;
        } else {
          // Merge: invalid from either source = invalid
          const existingValid = typeof existing === "boolean" ? existing : existing.valid;
          const newValid = typeof result === "boolean" ? result : result.valid;
          if (!existingValid || !newValid) {
            const existingReasons = typeof existing === "object" ? (existing.reasons ?? []) : [];
            const newReasons = typeof result === "object" ? (result.reasons ?? []) : [];
            merged[id] = {
              valid: false,
              reasons: [...existingReasons, ...newReasons],
            };
          }
        }
      }
    }
  }

  return allBoolean ? booleanResult : merged;
}

// ─── Node validity lookup (§6.4) ─────────────────────────────────────────────

export function isNodeValid(
  id: string,
  validationMap: ValidationMap | boolean | undefined,
): boolean {
  if (validationMap === undefined) return true;
  if (typeof validationMap === "boolean") return validationMap;
  const result = validationMap[id];
  if (result === undefined) return true;
  if (typeof result === "boolean") return result;
  return result.valid;
}

export function normalizeValidationResult(result: boolean | ValidationResult): ValidationResult {
  if (typeof result === "boolean") return { valid: result };
  return result;
}
