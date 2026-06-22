/**
 * @file Structural equality checks for arbitrary values.
 */

import { isArray, isObject } from "./types/guards.ts";

/**
 * Compares two values for deep structural equality, recursing through arrays and plain objects. Used to detect whether duplicate definitions are truly identical.
 *
 * @param left The first value to compare.
 * @param right The second value to compare.
 *
 * @returns `true` when the values are deeply equal.
 */
export function deepEqual(left: unknown, right: unknown): boolean {
	if (left === right) return true;

	if (typeof left !== typeof right) return false;

	if (left === null || right === null) return left === right;

	if (isArray(left) && isArray(right)) {
		if (left.length !== right.length) return false;

		return left.every((value, index) => deepEqual(value, right[index]));
	}

	if (isObject(left) && isObject(right)) {
		const keysLeft = Object.keys(left).sort();
		const keysRight = Object.keys(right).sort();

		if (keysLeft.length !== keysRight.length) return false;

		if (!keysLeft.every((key, index) => key === keysRight[index]))
			return false;

		return keysLeft.every((key) =>
			deepEqual(
				left[key as keyof typeof left],
				right[key as keyof typeof right],
			),
		);
	}

	// * primitives fall through to here
	return left === right;
}
