/**
 * @file Type definitions for `math` operations: the operable value, the per-op interfaces, and the `MathOperation` union the engine dispatches over.
 */

import type { JSONObject } from "@frmds/frontier";

/**
 * Quantity string type (e.g., "100 g", "5 m", "4 m2")
 */
export type QuantityString = string;

/**
 * Unit type for conversions
 */
export type Unit = string;

/**
 * Value a math operation can be applied to (number or quantity string).
 */
export type OperableValue = number | string;

/**
 * Operations allowed within a `math` expression.
 */
export type MathOperation =
	| AddOperation
	| SubtractOperation
	| MultiplyOperation
	| DivideOperation
	| PowerOperation
	| RootOperation
	| SquareRootOperation
	| TrimOperation
	| ConvertOperation
	| RoundOperation
	| FloorOperation
	| CeilOperation
	| AbsOperation
	| InvertOperation
	| ToPrecisionOperation;

/** Adds a number or quantity to the base value. */
export interface AddOperation extends JSONObject {
	op: "add";
	/** Number or quantity to add. Mixing unitless and quantity values is prohibited. */
	value: number | QuantityString;
}

/** Subtracts a number or quantity from the base value. */
export interface SubtractOperation extends JSONObject {
	op: "subtract";
	/** Number or quantity to subtract. Mixing unitless and quantity values is prohibited. */
	value: number | QuantityString;
}

/** Multiplies the base value by a number or quantity. */
export interface MultiplyOperation extends JSONObject {
	op: "multiply";
	/** Number or quantity to multiply by. */
	value: number | QuantityString;
}

/** Divides the base value by a number or quantity. */
export interface DivideOperation extends JSONObject {
	op: "divide";
	/** Number or quantity to divide by. */
	value: number | QuantityString;
}

/** Raises the base value to the power of a number. */
export interface PowerOperation extends JSONObject {
	op: "pow";
	/** Exponent. Quantities can only be raised to integer powers. */
	value: number;
}

/** Extracts root of the Nth degree from the value. */
export interface RootOperation extends JSONObject {
	op: "root";
	/** Degree of the root. Must be a positive integer. */
	value: number;
}

/** Extracts square root from the value. */
export interface SquareRootOperation extends JSONObject {
	op: "sqrt";
	value?: never;
}

/** Trims the value by a percentage (syntactic sugar for multiply by 1 - percentage). */
export interface TrimOperation extends JSONObject {
	op: "trim";
	/** Percentage as fraction (e.g., 0.1 = 10%). */
	value: number;
}

/** Converts the base value to a different unit. */
export interface ConvertOperation extends JSONObject {
	op: "convert";
	/** Target unit for conversion. */
	value: Unit;
}

/** Rounds the value to the nearest integer or to specified decimal places. */
export interface RoundOperation extends JSONObject {
	op: "round";
	/** Number of decimal places (optional, defaults to 0 for integer rounding). */
	value?: number;
}

/** Rounds the value down to the nearest integer. */
export interface FloorOperation extends JSONObject {
	op: "floor";
	value?: never;
}

/** Rounds the value up to the nearest integer. */
export interface CeilOperation extends JSONObject {
	op: "ceil";
	value?: never;
}

/** Returns the absolute value. */
export interface AbsOperation extends JSONObject {
	op: "abs";
	value?: never;
}

/** Inverts the value (reciprocal: 1/x). */
export interface InvertOperation extends JSONObject {
	op: "invert";
	value?: never;
}

/** Rounds to a specified number of significant figures. */
export interface ToPrecisionOperation extends JSONObject {
	op: "toPrecision";
	/** Number of significant figures or a quantity string specifying precision. */
	value: number | QuantityString;
}
