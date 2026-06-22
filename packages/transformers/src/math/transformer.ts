/**
 * @file The `math` transformer: resolves `math` objects into the result of their calculation.
 *
 * @example
 * ```json5
 * { math: [
 *   { ref: "$", path: ["dimensions", "length"], raw: true },
 *   { op: "multiply", value: "4 in" },
 *   { op: "multiply", value: 0.95 },
 * ] }
 * ```
 * @example
 * ```json5
 * { math: { ref: "stanag40ranger", key: "weight" },
 *   ops: [
 *     { op: "add", value: { math: [
 *       { ref: "300blk_ss", key: "weight" },
 *       { op: "multiply", value: 30 },
 *     ] } },
 *   ] }
 * ```
 */

import { extractErrorMessage, logger } from "@frmds/frontier";
import type { JSONValue, Patch } from "@frmds/frontier";
import { TransformerSkip } from "@frmds/autodoc";
import type { TransformContext, Transformer } from "@frmds/autodoc";
import { Type } from "typebox";
import {
	applyMathOperations,
	assertOperableValue,
	type MathOperation,
	type OperableValue,
} from "./engine.ts";

/**
 * Math expression for performing calculations on numbers and quantity strings.
 *
 * Two forms are supported for authoring ergonomics:
 * - Array shorthand: `{ math: [base, op1, op2, ...] }`
 * - Object form: `{ math: base, ops: [op1, op2, ...] }`
 *
 * The base value can be a number, a quantity string, a reference object, or another (nested) math expression. Operations are applied sequentially, left-to-right.
 */
export type MathExpression =
	| { math: JSONValue; ops?: MathOperation[] }
	| { math: [JSONValue, ...MathOperation[]]; ops?: never };

/** Any object carrying a `math` key. Other fields (e.g. `ops`) pass through, so `additionalProperties` stays open. */
const ContentSchema = Type.Object(
	{ math: Type.Unknown() },
	{ additionalProperties: true },
);

/** The `math` transformer: a math expression → its computed scalar/quantity result. */
const MATH_TRANSFORMER: Transformer<MathExpression> = {
	name: "resolveMath",
	version: "3.0.0",
	api: "1.0.0",
	description: "Resolves math expressions",
	target: { content: ContentSchema },

	transform(expression, context): Patch[] {
		const value = resolveMath(expression, context);

		return [{ op: "replace", value }];
	},
};

/**
 * Resolve a single MathExpression.
 *
 * Steps:
 * 1. Parse expression (array shorthand vs object form)
 * 2. Apply operations sequentially
 * 3. Return result
 */
function resolveMath(
	expression: MathExpression,
	context: TransformContext,
): OperableValue {
	let base: unknown;
	let operations: MathOperation[];

	if (Array.isArray(expression.math)) {
		// * array form: `{ math: [base, op1, op2, ...] }`

		if (!expression.math.length)
			throw new Error(
				`Math: expression array cannot be empty\n` +
					`  at: ${context.modId}:${context.sourcePath}\n` +
					`  Provide at least a base value: \`{ math: [ <baseValue> ] }\``,
			);

		const [baseValue, ...ops] = expression.math;

		base = baseValue;
		operations = ops as MathOperation[];

		logger.debug(
			`Math: array shorthand, ${operations.length} operations, base: ${JSON.stringify(base)}`,
		);
	} else {
		// * object form: `{ math: base, ops: [...] }`

		const { math, ops = [] } = expression;

		base = math;
		operations = ops;

		logger.debug(
			`Math: object form, ${operations.length} operations, base: ${JSON.stringify(base)}`,
		);
	}

	try {
		assertOperableValue(base);
	} catch {
		const type = Array.isArray(base) ? "array" : typeof base;

		// * skip on unresolved value: doesn't align with schema, likely temporary
		throw new TransformerSkip(
			`resolveMath(): \`math\` base is not a number or string (got ${type}: ${JSON.stringify(base)})`,
		);
	}

	// * return base if nothing to process
	if (!operations.length) return base;

	try {
		const result = applyMathOperations(base, operations);

		logger.debug(`Math: final result: ${result}`);

		return result;
	} catch (error) {
		throw new Error(
			`Math: failed to resolve expression\n` +
				`  at: ${context.modId}:${context.sourcePath}\n` +
				`  error: ${extractErrorMessage(error)}`,
		);
	}
}

export default MATH_TRANSFORMER;
