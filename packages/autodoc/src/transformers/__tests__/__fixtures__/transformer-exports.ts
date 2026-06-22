/**
 * @file Fixture module for loader tests: exports transformers as singles, arrays, and invalid shapes.
 */

import { Type } from "typebox";
import type { Transformer } from "../../../types/types.ts";

/**
 * A single transformer export.
 */
export const SINGLE = makeTransformer("single");

/**
 * An array of two transformer exports.
 */
export const PAIR = [makeTransformer("pair-a"), makeTransformer("pair-b")];

/**
 * An empty transformer array export.
 */
export const EMPTY: Transformer[] = [];

/**
 * An array holding one valid and one invalid entry, for failure tests.
 */
export const BAD_ARRAY = [makeTransformer("good"), { name: "bad" }];

/**
 * Builds a minimal valid transformer.
 *
 * @param name - The transformer name.
 * @returns The assembled transformer.
 */
function makeTransformer(name: string): Transformer {
	return {
		name,
		version: "1.0.0",
		api: "1.0.0",
		target: { content: Type.Object({}) },
		transform: () => [],
	};
}

export default makeTransformer("default-export");
