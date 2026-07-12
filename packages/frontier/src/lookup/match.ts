/**
 * @file Lookup query matching: case-insensitive substring ranking with a bounded edit-distance fallback for typos.
 */

import type { ObjectID } from "../types/data.ts";

/**
 * Maximum edit distance a typo candidate may have.
 */
const EDIT_DISTANCE_CAP = 2;

/**
 * Ranks candidate IDs against a query.
 *
 * Substring matches win outright, ordered by match position, then ID length, then alphabetically.
 * Only when no substring matches does the typo tier run, ordered by edit distance within {@link EDIT_DISTANCE_CAP}.
 *
 * @param query The user's query.
 * @param ids The candidate corpus.
 *
 * @returns Matching IDs, best first, empty when nothing is close.
 */
export function rankSuggestions(query: string, ids: ObjectID[]): ObjectID[] {
	const needle = query.toLowerCase();

	const substringMatches = ids
		.map((id) => ({ id, position: id.toLowerCase().indexOf(needle) }))
		.filter((match) => match.position >= 0)
		.sort(
			(left, right) =>
				left.position - right.position ||
				left.id.length - right.id.length ||
				left.id.localeCompare(right.id),
		)
		.map((match) => match.id);

	if (substringMatches.length) return substringMatches;

	return ids
		.map((id) => ({
			id,
			distance: boundedEditDistance(
				needle,
				id.toLowerCase(),
				EDIT_DISTANCE_CAP,
			),
		}))
		.filter((match) => match.distance <= EDIT_DISTANCE_CAP)
		.sort(
			(left, right) =>
				left.distance - right.distance ||
				left.id.localeCompare(right.id),
		)
		.map((match) => match.id);
}

/**
 * Computes the Levenshtein distance between two strings, giving up past a cap.
 *
 * @param first The first string.
 * @param second The second string.
 * @param cap The maximum distance worth computing.
 *
 * @returns The exact distance when it is at most `cap`, otherwise `cap + 1`.
 */
export function boundedEditDistance(
	first: string,
	second: string,
	cap = EDIT_DISTANCE_CAP,
): number {
	if (Math.abs(first.length - second.length) > cap) return cap + 1;

	let previous = Array.from(
		{ length: second.length + 1 },
		(_, index) => index,
	);

	for (let row = 1; row <= first.length; row++) {
		const current = [row];

		let rowMinimum = row;

		for (let column = 1; column <= second.length; column++) {
			const deletion = (previous[column] ?? 0) + 1;
			const insertion = (current[column - 1] ?? 0) + 1;

			const substitution =
				(previous[column - 1] ?? 0) +
				(first[row - 1] === second[column - 1] ? 0 : 1);

			current[column] = Math.min(deletion, insertion, substitution);
			rowMinimum = Math.min(rowMinimum, current[column] ?? rowMinimum);
		}

		if (rowMinimum > cap) return cap + 1;

		previous = current;
	}

	return previous[second.length] ?? cap + 1;
}
