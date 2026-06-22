/**
 * @file The `patch` transformer: applies an object's `patch` array to the object itself.
 *
 * @example
 * ```json5
 * // `subtypes: ["GLOVES"]` → `subtypes: ["GLOVES", "ARMOR"]`
 * patch: [{ op: "append", key: "subtypes", value: "ARMOR" }]
 * ```
 */

import { normalizePath } from "@frmds/frontier";
import type { Patch, PropertyPath } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { Type } from "typebox";

/** An array of patch-shaped objects; positional targeting already pins it to the `patch` key, so the gate only confirms the array carries `op`-bearing entries. An empty array still matches, so a bare `patch: []` is claimed and removed rather than left behind. */
const ContentSchema = Type.Array(
	Type.Object({ op: Type.String() }, { additionalProperties: true }),
);

/** The `patch` transformer: a root `patch` array → its patches applied to the object, with the directive removed. */
const PATCH_TRANSFORMER: Transformer<Patch[]> = {
	name: "applyPatches",
	version: "2.0.0",
	api: "1.0.0",
	description: "Processes root-level patch property",
	target: { paths: [["patch"]], content: ContentSchema, strict: true },

	transform(patches): Patch[] {
		// author paths are object-relative; the matched value is the `patch` array, so rebase every path (and `from`) by one `..` step to reach the object
		const adjustedPatches = patches.map((patch) => {
			const { key, path, ...rest } = patch;

			const relativePath =
				key !== undefined ? [key] : normalizeToArray(path);

			const adjusted: Patch = { ...rest, path: ["..", ...relativePath] };

			if ("from" in adjusted && adjusted.from !== undefined)
				adjusted.from = ["..", ...normalizeToArray(adjusted.from)];

			return adjusted;
		});

		return [{ op: "remove", path: [] }, ...adjustedPatches];
	},
};

/**
 * Normalize an author path to array form.
 */
function normalizeToArray(path: Patch["path"]): PropertyPath {
	if (path === undefined) return [];
	if (typeof path === "string")
		return normalizePath({ op: "test", path } as Patch);

	return path;
}

export default PATCH_TRANSFORMER;
