/**
 * @file The `references` transformer: resolves an object carrying a string `ref` into the referenced value, in place.
 *
 * @example
 * ```json5
 * min_item_length: { ref: "stanag20", key: "longest_side" }
 * ```
 */

import { makeKey } from "@frmds/frontier";
import type { Patch } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { Type } from "typebox";
import {
	resolveReference,
	SELF_REFERENCE_KEY,
	type ReferenceObject,
} from "./engine.ts";

/** Any object carrying a string `ref`. Extraction/filter/patch fields pass through, so `additionalProperties` stays open. */
const ContentSchema = Type.Object(
	{ ref: Type.String() },
	{ additionalProperties: true },
);

/** The `references` transformer: a reference object → its resolved value. */
const REFERENCE_TRANSFORMER: Transformer<ReferenceObject> = {
	name: "resolveReferences",
	version: "3.0.0",
	api: "1.0.0",
	description: "Resolves ReferenceObjects",
	target: { content: ContentSchema },

	extractDependencies(value, context) {
		// * self-references are not dependencies
		if (value.ref === SELF_REFERENCE_KEY) return [];

		return [makeKey(value.ref, undefined, context.modId)];
	},

	transform(value, context): Patch[] {
		const resolved = resolveReference(value, context);

		return [{ op: "replace", value: resolved }];
	},
};

export default REFERENCE_TRANSFORMER;
