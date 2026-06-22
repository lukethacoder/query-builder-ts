# @lukethacoder/query-builder

A TypeScript implementation of the [QueryBuilder Spec](https://github.com/lukethacoder/query-builder-spec) — a language-neutral standard for representing, addressing, manipulating, validating, and serializing structured filter queries.

## Installation

```sh
pnpm add @lukethacoder/query-builder
```

## Overview

A query is a tree. The root is a **group**; groups contain **rules** (single conditions) and nested groups. This library gives you:

- **Types** — full TypeScript types for the entire data model
- **Manipulation** — immutable operations to build and edit query trees (`add`, `remove`, `update`, `move`, `insert`, `group`)
- **Validation** — a default validator plus utilities for custom validators
- **Serialization** — export to JSON, SQL, parameterized SQL, MongoDB query objects, and JsonLogic

## Quick start

```ts
import { add, formatSql, remove, update } from "@lukethacoder/query-builder";
import type { RuleGroup } from "@lukethacoder/query-builder";

// Start with an empty query
const empty: RuleGroup = { combinator: "and", rules: [] };

// Add rules
let query = add(empty, { field: "firstName", operator: "=", value: "Steve" }, []);
query = add(query, { field: "lastName", operator: "=", value: "Vai" }, []);

// Export to SQL
console.log(formatSql(query));
// → (firstName = 'Steve' and lastName = 'Vai')
```

## Data model

### Rule

A single condition: a field, an operator, and a value.

```ts
interface Rule {
  id?: string;
  field: string;
  operator: string;
  value: unknown;
  valueSource?: "value" | "field";
  disabled?: boolean;
}
```

### RuleGroup (standard)

Joins all children with a single combinator.

```ts
interface RuleGroup {
  id?: string;
  combinator: string;                   // e.g. "and" | "or"
  rules: Array<Rule | RuleGroup>;
  not?: boolean;
  disabled?: boolean;
}
```

### RuleGroupIC (independent combinators)

Allows mixed combinators within one group by interleaving combinator strings between children.

```ts
interface RuleGroupIC {
  id?: string;
  rules: Array<Rule | RuleGroupIC | string>; // strings are combinators
  not?: boolean;
  disabled?: boolean;
}
```

## Manipulation

All operations are **immutable** — they return a new query and never mutate the input.

Operations accept either a `Path` (integer array) or a node `id` string as the location argument.

### `add(query, ruleOrGroup, parentPath, options?)`

Appends a rule or group to the end of the target group's children.

```ts
import { add } from "@lukethacoder/query-builder";

query = add(query, { field: "age", operator: ">", value: 18 }, []);
```

### `remove(query, path)`

Removes the node at the given path.

```ts
import { remove } from "@lukethacoder/query-builder";

query = remove(query, [0]); // remove first child of root
```

### `update(query, property, value, path, options?)`

Sets a single property on the node at the given path.

```ts
import { update } from "@lukethacoder/query-builder";

query = update(query, "operator", ">=", [0]);
query = update(query, "combinator", "or", []); // update root combinator
```

Changing `field` automatically resets `operator`, `valueSource`, and `value` by default (`resetOnFieldChange: true`). Pass `options` to override.

### `move(query, fromPath, toPath, options?)`

Moves a node to another position. `toPath` can be a `Path`, `"up"`, or `"down"`.

```ts
import { move } from "@lukethacoder/query-builder";

query = move(query, [0], [2]);
query = move(query, [1], "up");
query = move(query, [0], [1], { clone: true }); // copy instead of move
```

### `insert(query, ruleOrGroup, path, options?)`

Inserts a node at an exact position (always regenerates IDs on the inserted node).

```ts
import { insert } from "@lukethacoder/query-builder";

query = insert(query, { field: "city", operator: "=", value: "London" }, [1]);
```

### `group(query, sourcePath, targetPath, options?)`

Wraps the nodes at `sourcePath` and `targetPath` together inside a new nested group at `targetPath`.

```ts
import { group } from "@lukethacoder/query-builder";

query = group(query, [1], [0]);
```

### IC (independent combinator) queries

Convert between standard and IC forms:

```ts
import { convertToIC, convertFromIC } from "@lukethacoder/query-builder";

const ic = convertToIC(standardQuery);
const standard = convertFromIC(icQuery);
```

## Validation

### Default validator

Validates group structure: flags empty groups, invalid combinators, and malformed IC arrays.

```ts
import { defaultValidator } from "@lukethacoder/query-builder";

const result = defaultValidator(query);
// → Record<nodeId, { valid: boolean; reasons?: string[] }>
```

### Custom validators

```ts
import type { QueryValidator, RuleValidator } from "@lukethacoder/query-builder";

// Rule-level: attached to a field definition
const ageValidator: RuleValidator = (rule) => {
  return Number(rule.value) >= 0
    ? true
    : { valid: false, reasons: ["age must be non-negative"] };
};

// Query-level: passed to serializers or your own pipeline
const queryValidator: QueryValidator = (query) => {
  // return boolean or ValidationMap keyed by node id
};
```

## Serialization

All serializers accept a `validator` option — invalid rules/groups are dropped from non-JSON output.

### JSON

```ts
import { formatJson, formatJsonWithoutIds, parseJson } from "@lukethacoder/query-builder";

const json = formatJson(query);              // pretty JSON, includes ids
const stable = formatJsonWithoutIds(query);  // single-line, strips ids and paths
const parsed = parseJson(json);              // round-trip back to a query tree
```

### SQL

```ts
import { formatSql } from "@lukethacoder/query-builder";

formatSql(query);
// → (firstName = 'Steve' and lastName = 'Vai')

// Dialect presets
formatSql(query, { preset: "postgresql" });
formatSql(query, { preset: "mssql" });
formatSql(query, { preset: "mysql" });
formatSql(query, { preset: "sqlite" });
```

### Parameterized SQL

```ts
import { formatParameterized, formatParameterizedNamed } from "@lukethacoder/query-builder";

const { sql, params } = formatParameterized(query);
// → { sql: "(firstName = ? and lastName = ?)", params: ["Steve", "Vai"] }

const named = formatParameterizedNamed(query);
// → { sql: "(firstName = :firstName_1 and lastName = :lastName_1)", params: { firstName_1: "Steve", lastName_1: "Vai" } }

// PostgreSQL numbered params
formatParameterized(query, { preset: "postgresql" });
// → { sql: "(firstName = $1 and lastName = $2)", params: ["Steve", "Vai"] }
```

### MongoDB query

```ts
import { formatMongodbQuery } from "@lukethacoder/query-builder";

formatMongodbQuery(query);
// → { "$and": [{ "firstName": "Steve" }, { "lastName": "Vai" }] }
```

### JsonLogic

```ts
import { formatJsonLogic } from "@lukethacoder/query-builder";

formatJsonLogic(query);
// → { "and": [{ "==": [{ "var": "firstName" }, "Steve"] }, { "==": [{ "var": "lastName" }, "Vai"] }] }
```

## Default operators

| Identifier | Label | Arity |
|---|---|---|
| `=` | `=` | binary |
| `!=` | `!=` | binary |
| `<` | `<` | binary |
| `>` | `>` | binary |
| `<=` | `<=` | binary |
| `>=` | `>=` | binary |
| `contains` | `contains` | binary |
| `beginsWith` | `begins with` | binary |
| `endsWith` | `ends with` | binary |
| `doesNotContain` | `does not contain` | binary |
| `doesNotBeginWith` | `does not begin with` | binary |
| `doesNotEndWith` | `does not end with` | binary |
| `null` | `is null` | unary |
| `notNull` | `is not null` | unary |
| `in` | `in` | multi-value |
| `notIn` | `not in` | multi-value |
| `between` | `between` | ternary |
| `notBetween` | `not between` | ternary |

## Path addressing

Paths are integer arrays describing a node's location in the tree. The root is `[]`; `[0]` is the first child of the root; `[2, 1]` is the second child of the third child.

In IC queries, children occupy **even** indices (0, 2, 4 …) and combinator strings occupy odd indices.

```ts
import { findPath, getParentPath, isAncestor } from "@lukethacoder/query-builder";

const node = findPath([0, 1], query);
const parent = getParentPath([0, 1]);         // → [0]
const ancestor = isAncestor([0], [0, 1, 2]); // → true
```

## Spec conformance

This library implements **core + baseline export conformance** as defined by the QueryBuilder Spec:

- **Core** — data model (ch. 01), configuration model (ch. 02), defaults (ch. 03), paths (ch. 04), query manipulation (ch. 05), validation (ch. 06), canonical JSON (§7.2)
- **Baseline exports** — `json`, `json_without_ids`, `sql`, `parameterized`, `parameterized_named`, `mongodb_query`, `jsonlogic`

Optional extended formats (CEL, SPEL, Elasticsearch, ORM adapters, import parsers) are not yet implemented.

## License

MIT
