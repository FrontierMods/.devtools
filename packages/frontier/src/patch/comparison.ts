/**
 * @file Compare a JSON value against an expected value under a comparator (used by patch `drop` filters).
 */

import type { JSONValue } from "../types/data.ts";
import type { Comparator, ComparatorSymbol, ComparatorText } from "./types.ts";

/**
 * Comparators that require numeric values.
 */
type ComparatorForNumeric =
	| Exclude<ComparatorText, "eq" | "neq">
	| Exclude<ComparatorSymbol, "==" | "!=">;

/**
 * The comparators that only make sense on numbers, in both spellings.
 */
const COMPARATORS_REQUIRE_NUMBER = [
	"gt",
	">",
	"lt",
	"<",
	"gte",
	">=",
	"lte",
	"<=",
] as const satisfies ComparatorForNumeric[];

/**
 * Checks whether a comparator requires numeric values.
 *
 * @param comparator The comparator to test.
 *
 * @returns true if the comparator only operates on numbers, false otherwise.
 */
function isComparatorNumeric(
	comparator: unknown,
): comparator is ComparatorForNumeric {
	return COMPARATORS_REQUIRE_NUMBER.includes(
		comparator as ComparatorForNumeric,
	);
}

/**
 * Compares two values using a comparator.
 *
 * Used by filter matching and patch operations to evaluate conditions.
 *
 * @param actual The actual value to compare.
 * @param comparator The comparison operator.
 * @param expected The expected value to compare against.
 *
 * @returns true if the comparison passes, false otherwise.
 *
 * @throws Error if numeric comparator is used with non-numeric values.
 */
export function compareValues(
	actual: JSONValue,
	comparator: Comparator,
	expected: JSONValue,
): boolean {
	// * split into two branches for proper type narrowing
	if (isComparatorNumeric(comparator)) {
		if (typeof actual !== "number" || typeof expected !== "number")
			throw new Error(
				`compareValues(): comparator expected both values to be numeric, received \`${typeof actual}\` and \`${typeof expected}\``,
			);

		switch (comparator) {
			case "gt":
			case ">":
				return actual > expected;
			case "lt":
			case "<":
				return actual < expected;
			case "gte":
			case ">=":
				return actual >= expected;
			case "lte":
			case "<=":
				return actual <= expected;
		}
	} else {
		switch (comparator) {
			case "eq":
			case "==":
				return actual === expected;
			case "neq":
			case "!=":
				return actual !== expected;
			default:
				return false;
		}
	}
}
