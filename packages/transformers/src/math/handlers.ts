/**
 * @file Per-operation handlers: the value guards plus the functions that actually apply each `math` op to a number or quantity string.
 */

import { extractErrorMessage, isNumericOnly, isString } from "@frmds/frontier";
import { Quantity } from "../quantity.ts";
import type {
	ConvertOperation,
	MathOperation,
	OperableValue,
	RoundOperation,
	ToPrecisionOperation,
	TrimOperation,
} from "./operations.ts";
import {
	assertFiniteResult,
	parseNumericString,
	validatePercentage,
	validateUnit,
} from "./validation.ts";

/**
 * Type guard for numbers.
 */
function isNumber(value: unknown): value is number {
	return typeof value === "number";
}

/**
 * Type guard for operable values (number or string) in math operations.
 */
function isOperableValue(value: unknown): value is OperableValue {
	return typeof value === "number" || typeof value === "string";
}

/**
 * Apply string-based quantity operations.
 */
function applyStringOperation(data: string, operation: MathOperation): string {
	const { op, value } = operation;
	const quantity = Quantity(data);

	switch (op) {
		// `sqrt` extracts the square root of the quantity
		case "sqrt":
			return quantity.sqrt().toString();

		// `multiply` scales the quantity by the value
		case "multiply":
			return quantity.multiply(value).toString();

		// `divide` divides the quantity by the value
		case "divide":
			return quantity.divide(value).toString();

		// `pow` raises the quantity to an integer power
		case "pow":
			if (isString(value))
				throw new Error(
					"Cannot raise quantity to power of a string value",
				);

			return quantity.exponent(value).toString();

		// `root` extracts the value-th degree root of the quantity
		case "root":
			if (isString(value))
				throw new Error("Root degree must be a number");

			if (!Number.isInteger(value) || value <= 0)
				throw new Error("Root degree must be a positive integer");

			return quantity.root(value).toString();

		// `add`/`subtract` combine two quantities of compatible units
		case "add":
		case "subtract": {
			const valueQuantity = Quantity(value);

			return quantity[op](valueQuantity).toString();
		}

		default:
			throw new Error(`Unsupported operation for quantity: ${op}`);
	}
}

/**
 * Apply numeric operations.
 */
function applyNumericOperation(
	data: number,
	operation: MathOperation,
): number | string {
	const { op, value } = operation;

	// * square root operation takes no value
	// * process it before trying for ops with `value`
	if (op === "sqrt") {
		const result = data ** 0.5;

		assertFiniteResult(result, "sqrt");

		return result;
	}

	if (isString(value)) {
		const valueQuantity = Quantity(value);

		if (op === "multiply") return valueQuantity.multiply(data).toString();

		if (op === "divide")
			return Quantity(data).divide(valueQuantity).toString();

		// Other operations with quantity strings are not supported for unitless numbers
		throw new Error(
			`Cannot apply operation \`${op}\` with quantity string to unitless number`,
		);
	}

	if (value === undefined)
		throw new Error(`Operation \`${op}\` requires a value`);

	const number = isNumber(value) ? value : parseNumericString(value);

	let result: number;

	switch (op) {
		// `add` adds the value to the base number
		case "add":
			result = data + number;

			break;

		// `subtract` subtracts the value from the base number
		case "subtract":
			result = data - number;

			break;

		// `multiply` scales the base number by the value
		case "multiply":
			result = data * number;

			break;

		// `divide` divides the base number by the value
		case "divide":
			if (number === 0) throw new Error("Cannot divide by zero");

			result = data / number;

			break;

		// `pow` raises the base number to the value-th power
		case "pow":
			result = data ** number;

			break;

		// `root` extracts the value-th degree root of the base number
		case "root":
			if (!Number.isInteger(number) || number <= 0)
				throw new Error("Root degree must be a positive integer");

			result = data ** (1 / number);

			break;

		default:
			throw new Error(`Unsupported numeric operation: ${op}`);
	}

	assertFiniteResult(result, op);

	return result;
}

/**
 * Asserts that a value is operable (i.e. is number or string) for math operations.
 *
 * @throws {Error} if value is not a number or string.
 */
export function assertOperableValue(
	value: unknown,
): asserts value is OperableValue {
	if (!isOperableValue(value)) {
		const typeName = Array.isArray(value)
			? "array"
			: value === null
				? "null"
				: typeof value;

		throw new Error(`Cannot apply operation to type ${typeName}`);
	}
}

/**
 * Apply a quantity operation.
 * Dispatches the arithmetic ops (`add`, `subtract`, `multiply`, `divide`, `pow`, `root`, `sqrt`) to the number or quantity-string handler.
 */
export function applyQuantityOperation(
	data: OperableValue,
	operation: MathOperation,
): OperableValue {
	const { op } = operation;

	assertOperableValue(data);

	try {
		if (isString(data)) return applyStringOperation(data, operation);

		return applyNumericOperation(data, operation);
	} catch (error) {
		throw new Error(
			`Failed to apply operation \`${op}\`: ${extractErrorMessage(error)}`,
		);
	}
}

/**
 * Apply `trim` operation.
 * Trim multiplies the value by `1 - trim`.
 */
export function applyTrimOperation(
	data: OperableValue,
	operation: TrimOperation,
): OperableValue {
	const { value } = operation;

	validatePercentage(value, "trim percentage");
	assertOperableValue(data);

	if (isString(data)) {
		try {
			return Quantity(data)
				.multiply(1 - value)
				.toString();
		} catch (error) {
			throw new Error(
				`Invalid quantity string: \`${data}\` (${extractErrorMessage(error)})`,
			);
		}
	}

	const result = data * (1 - value);

	assertFiniteResult(result, "trim");

	return result;
}

/**
 * Apply `convert` operation.
 * `convert` renders one unit as another.
 */
export function applyConvertOperation(
	data: OperableValue,
	operation: ConvertOperation,
): OperableValue {
	const { value: targetUnit } = operation;

	validateUnit(targetUnit);
	assertOperableValue(data);

	const trimmedUnit = targetUnit.trim();

	try {
		if (isNumber(data)) return Quantity(data, trimmedUnit).toString();

		const trimmed = data.trim();

		if (isNumericOnly(trimmed)) {
			const number = parseNumericString(trimmed);

			return Quantity(number, trimmedUnit).toString();
		}

		const quantity = Quantity(trimmed);

		return quantity.to(trimmedUnit).toString();
	} catch (error) {
		throw new Error(
			`Failed to convert to \`${trimmedUnit}\`: ${extractErrorMessage(error)}`,
		);
	}
}

/**
 * Apply `round` operation.
 * `round` brings the value up or down to the nearest integer.
 */
export function applyRoundOperation(
	data: OperableValue,
	operation: RoundOperation,
): OperableValue {
	assertOperableValue(data);

	const decimalPlaces = operation.value ?? 0;

	if (isString(data)) {
		const quantity = Quantity(data);
		const scalar = quantity.scalar;
		const multiplier = 10 ** decimalPlaces;
		const roundedScalar = Math.round(scalar * multiplier) / multiplier;

		return Quantity(roundedScalar, quantity.units()).toString();
	}

	const multiplier = 10 ** decimalPlaces;
	const result = Math.round(data * multiplier) / multiplier;

	assertFiniteResult(result, "round");

	return result;
}

/**
 * Apply `floor` operation.
 * `floor` brings the value down to the nearest integer.
 */
export function applyFloorOperation(data: OperableValue): OperableValue {
	assertOperableValue(data);

	if (isString(data)) {
		const quantity = Quantity(data);
		const scalar = Math.floor(quantity.scalar);

		return Quantity(scalar, quantity.units()).toString();
	}

	const result = Math.floor(data);

	assertFiniteResult(result, "floor");

	return result;
}

/**
 * Apply `ceil` operation.
 * `ceil` brings the value up to the nearest integer.
 */
export function applyCeilOperation(data: OperableValue): OperableValue {
	assertOperableValue(data);

	if (isString(data)) {
		const quantity = Quantity(data);
		const scalar = Math.ceil(quantity.scalar);

		return Quantity(scalar, quantity.units()).toString();
	}

	const result = Math.ceil(data);

	assertFiniteResult(result, "ceil");

	return result;
}

/**
 * Apply `abs` operation.
 * `abs` returns the absolute value of the input.
 */
export function applyAbsOperation(data: OperableValue): OperableValue {
	assertOperableValue(data);

	if (isString(data)) {
		const quantity = Quantity(data);
		const scalar = Math.abs(quantity.scalar);

		return Quantity(scalar, quantity.units()).toString();
	}

	const result = Math.abs(data);

	assertFiniteResult(result, "abs");

	return result;
}

/**
 * Apply `invert` operation.
 * `invert` returns the reciprocal (`1 / x`) of the input.
 */
export function applyInvertOperation(data: OperableValue): OperableValue {
	assertOperableValue(data);

	if (isString(data)) return Quantity(data).invert().toString();

	if (data === 0) throw new Error("Cannot invert zero");

	const result = 1 / data;

	assertFiniteResult(result, "invert");

	return result;
}

/**
 * Apply `toPrecision` operation.
 * `toPrecision` rounds the value to the given number of significant figures.
 */
export function applyToPrecisionOperation(
	data: OperableValue,
	operation: ToPrecisionOperation,
): OperableValue {
	assertOperableValue(data);

	const { value } = operation;

	if (isString(data)) return Quantity(data).toPrecision(value).toString();

	// * if `value` provided is a quantity string, throw: we cannot round `20` to precision of `"1 kg"`
	if (isString(value))
		throw new Error(
			"toPrecision value must be a number for unitless values",
		);

	const result = Number(data.toPrecision(value));

	assertFiniteResult(result, "toPrecision");

	return result;
}
