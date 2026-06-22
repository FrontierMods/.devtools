/**
 * @file Value-comparison vocabulary and the filter shape used by patch `drop` and reference matching.
 */

import type { JSONObject, JSONValue } from "../types/data.ts";

/**
 * Word-form comparators, the readable alternative to the symbol forms.
 */
export type ComparatorText = "eq" | "gt" | "lt" | "gte" | "lte" | "neq";

/**
 * Symbol-form comparators, the terse alternative to the word forms.
 */
export type ComparatorSymbol = "==" | ">" | "<" | ">=" | "<=" | "!=";

/**
 * Either comparator spelling, accepted interchangeably wherever a comparison is configured.
 */
export type Comparator = ComparatorText | ComparatorSymbol;

/**
 * A predicate over an object, the matching language for patch `drop` and reference resolution.
 */
export interface ReferenceFilter extends JSONObject {
	/** Passes when the named property is present on the candidate. */
	has?: string;
	/** Passes when the candidate's `key` compares against `value` under `as`. */
	compare?: {
		key: string;
		as: ComparatorText | ComparatorSymbol;
		value: JSONValue;
	};
	/** Negation: passes when none of the nested filters match. */
	not?: ReferenceFilter[];
	/** Disjunction: passes when any of the nested filters match. */
	or?: ReferenceFilter[];
}
