/**
 * @file The `inheritance` transformer: resolves an `inherit` directive into patches that splice the parent's props in.
 *
 * @example
 * ```json5
 * inherit: ["@gloves/tactical"]
 * ```
 */

import { makeKey } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { resolveInheritance } from "./engine.ts";
import { ContentSchema, type InheritValue } from "./schema.ts";

/** The `inheritance` transformer. */
const INHERITANCE_TRANSFORMER: Transformer<InheritValue> = {
	name: "resolveInheritance",
	version: "3.0.0",
	api: "1.0.0",
	description: "Resolves inherit directives via patches",
	target: { paths: [["inherit"]], content: ContentSchema, strict: true },

	extractDependencies(value, context) {
		const entries = Array.isArray(value) ? value : [value];

		return entries.map((entry) =>
			typeof entry === "string"
				? makeKey(entry, undefined, context.modId)
				: makeKey(entry.id, entry.type, entry.scope ?? context.modId),
		);
	},

	transform: resolveInheritance,
};

export default INHERITANCE_TRANSFORMER;
