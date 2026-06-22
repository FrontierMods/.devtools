/**
 * @file Predicate matching of a JSON object against `ReferenceFilter`s.
 */

import { entries } from "../object/access.ts";
import type { JSONObject } from "../types/data.ts";
import { isDefined } from "../types/guards.ts";
import { compareValues } from "./comparison.ts";
import type { ReferenceFilter } from "./types.ts";

/**
 * Checks whether a value matches all filters (AND logic).
 *
 * @param object The candidate object to test.
 * @param filters The filters that must all pass.
 *
 * @returns `true` if every filter matches, `false` otherwise.
 *
 * @throws If a filter's numeric comparator is applied to a non-numeric value.
 */
export function matchesAllFilters(
	object: JSONObject,
	filters: ReferenceFilter[],
): boolean {
	return filters.every((filter) => matchesFilter(object, filter));
}

/**
 * Checks whether a value matches a single filter.
 *
 * @param object The candidate object to test.
 * @param filter The filter to evaluate.
 *
 * @returns `true` if the filter matches, `false` otherwise.
 *
 * @throws If the filter's numeric comparator is applied to a non-numeric value.
 */
export function matchesFilter(
	object: JSONObject,
	filter: ReferenceFilter,
): boolean {
	if (filter.has !== undefined && !(filter.has in object)) return false;

	if (filter.compare) {
		const { key, as, value: desired } = filter.compare;
		const actual = object[key as keyof typeof object];

		if (!isDefined(actual) || !compareValues(actual, as, desired))
			return false;
	}

	if (filter.not)
		return !filter.not.some((condition) =>
			matchesFilter(object, condition),
		);

	if (filter.or)
		return filter.or.some((condition) => matchesFilter(object, condition));

	const reservedKeys = new Set<keyof ReferenceFilter>([
		"has",
		"compare",
		"not",
		"or",
	]);

	for (const [key, desired] of entries(filter)) {
		if (!reservedKeys.has(key) && isDefined(desired)) {
			const actual = object[key as keyof typeof object];

			if (!isDefined(actual) || !compareValues(actual, "eq", desired))
				return false;
		}
	}

	return true;
}
