/**
 * @file Math engine: dispatches each `math` operation to its handler and folds a sequence of operations over a base value.
 */

import { extractErrorMessage } from "@frmds/frontier";
import {
	applyAbsOperation,
	applyCeilOperation,
	applyConvertOperation,
	applyFloorOperation,
	applyInvertOperation,
	applyQuantityOperation,
	applyRoundOperation,
	applyToPrecisionOperation,
	applyTrimOperation,
} from "./handlers.ts";
import type { MathOperation, OperableValue } from "./operations.ts";

/**
 * Custom error class for math operation failures.
 */
class MathError extends Error {
	readonly name = "MathError";

	constructor(
		message: string,
		public operation: MathOperation,
		public index: number,
	) {
		super(message);
	}
}

/**
 * Apply a single operation to a value.
 *
 * @param accumulator Current value
 * @param operation Operation to apply
 * @param index Operation index (for error messages)
 *
 * @returns Result of applying the operation
 */
function applyOperation(
	accumulator: OperableValue,
	operation: MathOperation,
	index: number,
): OperableValue {
	try {
		switch (operation.op) {
			case "trim":
				return applyTrimOperation(accumulator, operation);

			case "convert":
				return applyConvertOperation(accumulator, operation);

			case "round":
				return applyRoundOperation(accumulator, operation);

			case "floor":
				return applyFloorOperation(accumulator);

			case "ceil":
				return applyCeilOperation(accumulator);

			case "abs":
				return applyAbsOperation(accumulator);

			case "invert":
				return applyInvertOperation(accumulator);

			case "toPrecision":
				return applyToPrecisionOperation(accumulator, operation);

			case "add":
			case "subtract":
			case "multiply":
			case "divide":
			case "pow":
			case "root":
			case "sqrt":
				return applyQuantityOperation(accumulator, operation);

			default:
				throw new MathError(
					`Unsupported math operation`,
					operation,
					index,
				);
		}
	} catch (error) {
		if (error instanceof MathError) throw error;

		throw new MathError(extractErrorMessage(error), operation, index);
	}
}

/**
 * Apply sequential math operations to a base value.
 *
 * @param value {@link OperableValue}.
 * @param operations Array of operations to apply.
 *
 * @returns Result of all operations.
 */
export function applyMathOperations(
	value: OperableValue,
	operations: MathOperation[],
): OperableValue {
	if (!operations.length) return value;

	return operations.reduce(
		(accumulator, operation, index) =>
			applyOperation(accumulator, operation, index),
		value,
	);
}

export type {
	MathOperation,
	OperableValue,
	QuantityString,
	Unit,
} from "./operations.ts";

export { assertOperableValue } from "./handlers.ts";
