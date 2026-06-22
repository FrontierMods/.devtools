/**
 * @file Runtime type guards for narrowing unknown values to the toolkit's core shapes.
 */

import type { GameObject } from "../object/types.ts";

/**
 * Narrows a value to an array.
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is an array.
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
	return !!value && Array.isArray(value);
}

/**
 * Checks whether a value is a plain object.
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is a non-array object.
 */
export function isObject<T = unknown>(
	value: unknown,
): value is Record<string, T> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Checks whether a value is a string.
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is a string.
 */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * Checks whether a value is a valid game object.
 *
 * Game objects must have a `type` property (string).
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is an object carrying a string `type`.
 */
export function isGameObject(value: unknown): value is GameObject {
	return isObject(value) && "type" in value && typeof value.type === "string";
}

/**
 * Checks whether a value is a valid game file.
 *
 * Game files must be arrays where every element is a valid game object.
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is an array of valid game objects.
 */
export function isGameFile(value: unknown): value is GameObject[] {
	return isArray(value) && value.every(isGameObject);
}

/**
 * Reports whether a string holds only a numeric literal, optionally signed and fractional.
 *
 * @param value String to test.
 *
 * @returns `true` when the string is a bare numeric literal.
 */
export function isNumericOnly(value: string): boolean {
	return /^-?(\d+\.?\d*|\.\d+)$/.test(value);
}

/**
 * Checks whether a value is an integer.
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is an integer number.
 */
export function isInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value);
}

/**
 * Narrows `T | undefined` to `T`.
 * Filters out undefined values from arrays or checks single values.
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is not `undefined`.
 *
 * @example
 * ```ts
 * const values: (JSONValue | undefined)[] = [1, undefined, "hello"];
 * const defined = values.filter(isDefined); // `JSONValue[]`
 * ```
 */
export function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

/**
 * Narrows `T | undefined | null` to `T`, excluding both `undefined` and `null`.
 *
 * @param value Value to test.
 *
 * @returns `true` when the value is neither `undefined` nor `null`.
 */
export function isNotNullLike<T>(value: T | undefined | null): value is T {
	return value !== undefined && value !== null;
}
