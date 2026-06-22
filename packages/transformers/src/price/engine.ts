/**
 * @file price engine: coerces an index to numeric scores and computes a canonical barter-price string via a Modified Fibonacci sequence.
 */

import { CANONICAL_UNITS } from "@frmds/autodoc";
import { Quantity } from "../quantity.ts";
import { SCORE_LABELS, type ScoreInput, type ScoreLabel } from "./schema.ts";
import type { BarterPriceIndex, RawBarterPriceIndex } from "./types.ts";

/**
 * Modified Fibonacci sequence for price calculation.
 *
 * Unlike the standard Fibonacci sequence (0, 1, 1, 2, 3, 5, 8...), this one starts with 0, 1, 2. This produces persistent scaling (no repeating price at n = 1 and n = 2) while still allowing high-value items to be priced as such.
 *
 * The multiplier of 1.85 allows the price to further scale well in this sequence: the ultimate 3/3/3 item would be priced at ~$50. Any price above that would have to be set manually.
 *
 * Sequence: 0, 1, 2, 3, 5, 8, 13, 21, 34, 55...
 *
 * @param number - Position in sequence
 * @param multiplier - Scaling factor
 */
function modifiedFibonacci(number: number, multiplier = 1.85): number {
	if (number <= 0) return 0;
	if (number === 1) return 1 * multiplier;
	if (number === 2) return 2 * multiplier;

	let previous = 1;
	let current = 2;

	for (let index = 3; index <= number; index++) {
		const next = previous + current;

		previous = current;
		current = next;
	}

	return current * multiplier;
}

/**
 * Coerce string-represented values to their numeric equivalents for future calculations.
 *
 * @param value - either 0..3 or "none"/"low"/"medium"/"high"
 * @returns 0..3 for either type
 */
function coerceScore(value: ScoreInput): number {
	if (typeof value === "number") return value;

	const normalized = value.toLowerCase() as ScoreLabel;

	switch (normalized) {
		case "none":
			return 0;
		case "low":
			return 1;
		case "medium":
			return 2;
		case "high":
			return 3;
		default:
			throw new Error(`Unknown score label: ${value}`);
	}
}

/**
 * Coerce every index field to a numeric score and reject any outside 0–3.
 */
function processIndex(index: Partial<RawBarterPriceIndex>): BarterPriceIndex {
	const {
		utility: rawUtility,
		longevity: rawLongevity,
		scarcity: rawScarcity,
	} = index as RawBarterPriceIndex;

	const utility = coerceScore(rawUtility);
	const longevity = coerceScore(rawLongevity);
	const scarcity = coerceScore(rawScarcity);

	const values = [utility, longevity, scarcity];
	const valuesAreValid = values.every((value) => value >= 0 && value <= 3);

	if (!valuesAreValid)
		throw new Error(
			`Index values must be numbers 0–3 or one of: \`${SCORE_LABELS.join(
				"`, `",
			)}\``,
		);

	return {
		utility,
		longevity,
		scarcity,
	};
}

/**
 * Round a cent amount to the nearest 50, clamped to a minimum of 0.
 */
function roundToNearest50Cents(cents: number): number {
	const rounded = Math.round(cents / 50) * 50;

	return rounded < 0 ? 0 : rounded;
}

/**
 * Map a numeric index to a canonical currency string via the Modified Fibonacci sequence.
 */
function getBarterPrice(index: BarterPriceIndex): string {
	const { utility, longevity, scarcity } = index;
	const factor = modifiedFibonacci(utility + longevity + scarcity);
	const cents = factor * 50;
	const normalized = roundToNearest50Cents(cents);

	return Quantity(normalized, "cents").toCompound(CANONICAL_UNITS.currency);
}

/**
 * Computes the canonical barter-price string for a hand-authored index.
 */
export function calculateBarterPrice(raw: RawBarterPriceIndex): string {
	const index = processIndex(raw);

	return getBarterPrice(index);
}
