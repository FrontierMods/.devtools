/**
 * @file Converts sugar patch operations to standard JSON Patch: the `convertToJSONPatch` dispatcher and its per-op converters.
 */

import type { JSONPatchOperation } from "immutable-json-patch";
import { getAtPath } from "../object/access.ts";
import type { JSONValue } from "../types/data.ts";
import { matchesAllFilters } from "./filters.ts";
import { arrayToJSONPointer, normalizePath } from "./pointer.ts";
import type {
	AddPatch,
	AppendPatch,
	DividePatch,
	DropPatch,
	MergePatch,
	MultiplyPatch,
	Patch,
	PushPatch,
	SubtractPatch,
} from "./schemas.ts";

/**
 * Pushes a value onto an array, creating the array when the path is absent.
 *
 * @param pointer JSON Pointer to the target location.
 * @param current The current value at the pointer.
 * @param patch Push patch operation supplying the value.
 *
 * @returns JSON Patch operations that perform the push.
 *
 * @throws Error if the current value exists but is not an array.
 */
function convertPush(
	pointer: string,
	current: unknown,
	patch: PushPatch,
): JSONPatchOperation[] {
	if (!Array.isArray(current)) {
		if (current === undefined)
			return [{ op: "add", path: pointer, value: [patch.value] }];

		throw new Error(
			`Cannot push to non-array value at ${pointer} (type: ${typeof current})`,
		);
	}

	return [{ op: "add", path: `${pointer}/-`, value: patch.value }];
}

/**
 * Appends a value to an array only when it is not already present.
 *
 * @param pointer JSON Pointer to the target location.
 * @param current The current value at the pointer.
 * @param patch Append patch operation supplying the value.
 *
 * @returns JSON Patch operations that perform the append, or an empty array when the value already exists.
 *
 * @throws Error if the current value exists but is not an array.
 */
function convertAppend(
	pointer: string,
	current: unknown,
	patch: AppendPatch,
): JSONPatchOperation[] {
	if (!Array.isArray(current)) {
		if (current === undefined)
			return [{ op: "add", path: pointer, value: [patch.value] }];

		throw new Error(
			`Cannot append to non-array value at ${pointer} (type: ${typeof current})`,
		);
	}

	// Only add if the value doesn't already exist in the array
	if (current.includes(patch.value)) return [];

	return [{ op: "add", path: `${pointer}/-`, value: patch.value }];
}

/**
 * Removes array items matching the patch's `value` or `filter` set.
 *
 * @param pointer JSON Pointer to the target array.
 * @param current The current value at the pointer.
 * @param patch Drop patch operation supplying the value or filter set.
 *
 * @returns JSON Patch remove operations for each matching index, in descending order.
 *
 * @throws Error if the current value is not an array.
 */
function convertDrop(
	pointer: string,
	current: unknown,
	patch: DropPatch,
): JSONPatchOperation[] {
	if (!Array.isArray(current))
		throw new Error(
			`Cannot drop from non-array value at ${pointer} (type: ${typeof current})`,
		);

	const shouldDrop = (item: JSONValue): boolean => {
		if (patch.value !== undefined) {
			if (Array.isArray(patch.value)) return patch.value.includes(item);

			return item === patch.value;
		}

		if (patch.filter && patch.filter.length) {
			if (
				typeof item !== "object" ||
				item === null ||
				Array.isArray(item)
			)
				return false;

			return matchesAllFilters(item, patch.filter);
		}

		return false;
	};

	const indicesToRemove = current
		.map((item, index) => (shouldDrop(item) ? index : -1))
		.filter((index) => index !== -1)
		.reverse();

	return indicesToRemove.map((index) => ({
		op: "remove" as const,
		path: `${pointer}/${index}`,
	}));
}

/**
 * Adds a number to a numeric value, or sets it when the path is absent.
 *
 * @param pointer JSON Pointer to the target location.
 * @param current The current value at the pointer.
 * @param patch Add patch operation supplying the addend.
 *
 * @returns JSON Patch operations that apply the addition.
 *
 * @throws Error if the current value exists but is not a number.
 */
function convertAdd(
	pointer: string,
	current: unknown,
	patch: AddPatch,
): JSONPatchOperation[] {
	if (typeof current !== "number") {
		if (current === undefined)
			return [{ op: "add", path: pointer, value: patch.value }];

		throw new Error(
			`Cannot add to non-number value at ${pointer} (type: ${typeof current})`,
		);
	}

	return [{ op: "replace", path: pointer, value: current + patch.value }];
}

/**
 * Subtracts a number from a numeric value.
 *
 * @param pointer JSON Pointer to the target location.
 * @param current The current value at the pointer.
 * @param patch Subtract patch operation supplying the subtrahend.
 *
 * @returns JSON Patch operations that apply the subtraction.
 *
 * @throws Error if the current value is not a number.
 */
function convertSubtract(
	pointer: string,
	current: unknown,
	patch: SubtractPatch,
): JSONPatchOperation[] {
	if (typeof current !== "number")
		throw new Error(
			`Cannot subtract from non-number value at ${pointer} (type: ${typeof current})`,
		);

	return [{ op: "replace", path: pointer, value: current - patch.value }];
}

/**
 * Multiplies a numeric value by a number.
 *
 * @param pointer JSON Pointer to the target location.
 * @param current The current value at the pointer.
 * @param patch Multiply patch operation supplying the factor.
 *
 * @returns JSON Patch operations that apply the multiplication.
 *
 * @throws Error if the current value is not a number.
 */
function convertMultiply(
	pointer: string,
	current: unknown,
	patch: MultiplyPatch,
): JSONPatchOperation[] {
	if (typeof current !== "number")
		throw new Error(
			`Cannot multiply non-number value at ${pointer} (type: ${typeof current})`,
		);

	return [{ op: "replace", path: pointer, value: current * patch.value }];
}

/**
 * Divides a numeric value by a non-zero number.
 *
 * @param pointer JSON Pointer to the target location.
 * @param current The current value at the pointer.
 * @param patch Divide patch operation supplying the divisor.
 *
 * @returns JSON Patch operations that apply the division.
 *
 * @throws Error if the current value is not a number, or the divisor is zero.
 */
function convertDivide(
	pointer: string,
	current: unknown,
	patch: DividePatch,
): JSONPatchOperation[] {
	if (typeof current !== "number")
		throw new Error(
			`Cannot divide non-number value at ${pointer} (type: ${typeof current})`,
		);

	if (patch.value === 0)
		throw new Error(`Cannot divide by zero at ${pointer}`);

	return [{ op: "replace", path: pointer, value: current / patch.value }];
}

/**
 * Shallow-merges an object's properties into the target object.
 *
 * @param pointer JSON Pointer to the target location.
 * @param current The current value at the pointer.
 * @param patch Merge patch operation supplying the properties to merge.
 *
 * @returns JSON Patch operations that add or replace each merged property.
 *
 * @throws Error if the current value exists but is not a plain object.
 */
function convertMerge(
	pointer: string,
	current: unknown,
	patch: MergePatch,
): JSONPatchOperation[] {
	if (
		typeof current !== "object" ||
		current === null ||
		Array.isArray(current)
	) {
		if (current === undefined)
			return [{ op: "add", path: pointer, value: patch.value }];

		throw new Error(
			`Cannot merge into non-object value at ${pointer} (type: ${
				Array.isArray(current) ? "array" : typeof current
			})`,
		);
	}

	// Shallow merge: add/replace each property
	return Object.entries(patch.value).map(([key, value]) => {
		const escapedKey = key.replace(/~/g, "~0").replace(/\//g, "~1");

		const propertyPath = pointer
			? `${pointer}/${escapedKey}`
			: `/${escapedKey}`;
		const propertyExists =
			current[key as keyof typeof current] !== undefined;

		return {
			op: propertyExists ? ("replace" as const) : ("add" as const),
			path: propertyPath,
			value,
		};
	});
}

/**
 * Converts a sugar patch operation to standard JSON Patch operation(s).
 *
 * @param patch Sugar patch operation.
 * @param target The value being patched, needed for some operations.
 *
 * @returns Array of JSON Patch operations.
 *
 * @throws Error if the operation is unknown or a per-op converter rejects the current value.
 */
export function convertToJSONPatch(
	patch: Patch,
	target: JSONValue,
): JSONPatchOperation[] {
	const path = normalizePath(patch);
	const pointer = arrayToJSONPointer(path);

	const currentValue = getAtPath(target, path);

	switch (patch.op) {
		case "push":
			return convertPush(pointer, currentValue, patch);
		case "append":
			return convertAppend(pointer, currentValue, patch);
		case "drop":
			return convertDrop(pointer, currentValue, patch);

		case "add":
			return convertAdd(pointer, currentValue, patch);
		case "subtract":
			return convertSubtract(pointer, currentValue, patch);
		case "multiply":
			return convertMultiply(pointer, currentValue, patch);
		case "divide":
			return convertDivide(pointer, currentValue, patch);

		case "merge":
			return convertMerge(pointer, currentValue, patch);

		case "insert":
			return [{ op: "add", path: pointer, value: patch.value }];
		case "replace":
			return [{ op: "replace", path: pointer, value: patch.value }];
		case "remove":
			return [{ op: "remove", path: pointer }];
		case "test":
			return [{ op: "test", path: pointer, value: patch.value }];
		case "move": {
			const fromPointer = Array.isArray(patch.from)
				? arrayToJSONPointer(patch.from)
				: patch.from;

			return [{ op: "move", path: pointer, from: fromPointer }];
		}
		case "copy": {
			const from = Array.isArray(patch.from)
				? arrayToJSONPointer(patch.from)
				: patch.from;

			return [{ op: "copy", path: pointer, from }];
		}

		default:
			throw new Error(`Unknown patch operation: ${(patch as Patch).op}`);
	}
}
