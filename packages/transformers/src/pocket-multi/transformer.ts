/**
 * @file The `pocket-multi` transformer: expands a pocket carrying an integer `multi` into that many copies of itself.
 *
 * @example
 * ```json5
 * // input: one pocket with multi: 2
 * pocket_data: [
 *   {
 *     pocket_type: "CONTAINER",
 *     description: "Inner pocket",
 *     multi: 2,
 *   },
 * ]
 *
 * // output: that pocket twice, multi removed
 * pocket_data: [
 *   {
 *     pocket_type: "CONTAINER",
 *     description: "Inner pocket",
 *   },
 *   {
 *     pocket_type: "CONTAINER",
 *     description: "Inner pocket",
 *   },
 * ]
 * ```
 */

import type { JSONObject, Patch } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { Type } from "typebox";

/** A pocket carrying the integer `multi` duplication directive. */
interface PocketWithMulti extends JSONObject {
	multi: number;
	pocket_type: string;
}

/** A pocket carrying an integer `multi` of at least 1. The `pocket_type` requirement keeps the gate on real pockets and off a bare `{ multi: N }` directive payload (e.g. a reference's unapplied `patch` merge value), which would otherwise match here and expand before the directive resolves. Other pocket fields pass through, so `additionalProperties` stays open. */
const ContentSchema = Type.Object(
	{ multi: Type.Integer({ minimum: 1 }), pocket_type: Type.String() },
	{ additionalProperties: true },
);

/** The `pocket-multi` transformer: a pocket with `multi` → `multi` copies of the pocket without it. */
const POCKET_MULTI_TRANSFORMER: Transformer<PocketWithMulti> = {
	name: "multiplyPockets",
	version: "3.0.0",
	api: "1.0.0",
	description: "Duplicates pockets in pocket_data with multi field",
	target: { content: ContentSchema },

	transform(value): Patch[] {
		const { multi, ...cleaned } = value;

		const patches: Patch[] = Array.from({ length: multi }, () => ({
			op: "insert",
			path: [],
			value: structuredClone(cleaned),
		}));

		// * drop the original pocket carrying the `multi` directive
		patches.unshift({ op: "remove", path: [] });

		return patches;
	},
};

export default POCKET_MULTI_TRANSFORMER;
