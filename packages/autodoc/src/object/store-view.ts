/**
 * @file The read-only anchored view of the workspace handed to transformers as `context.objects`.
 *
 * `raw` reads are as-authored.
 * `runtime` reads finalize lazily, so dependency-mod objects gain enrichment on first access.
 */

import type {
	CompoundKey,
	GameObject,
	ModScope,
	ModWorkspace,
	ObjectID,
	ObjectType,
	TimelineAnchor,
} from "@frmds/frontier";
import { finalize } from "./enrichment.ts";

/**
 * Options for an anchored read.
 */
export interface ObjectReadOptions {
	/** Timeline anchor to read; defaults to `"runtime"`. */
	at?: TimelineAnchor;
}

/**
 * Read-only anchored access to every object's timeline.
 * Gives access to `raw` and `runtime` entries of the object.
 */
export interface ObjectStoreReader {
	/** Reads a single object at the requested anchor, or `undefined` when absent. */
	get(
		id: ObjectID,
		type?: ObjectType,
		scope?: ModScope,
		options?: ObjectReadOptions,
	): GameObject | undefined;
	/** Reports whether an object exists within the given scope. */
	has(id: ObjectID, type?: ObjectType, scope?: ModScope): boolean;
	/** Iterates current shapes of all live objects, the type-agnostic scan surface (e.g. inherit fallback). */
	entries(): IterableIterator<[CompoundKey, GameObject]>;
}

/**
 * Builds the transformer-facing view over a workspace.
 *
 * @param workspace The workspace whose object timelines back the view.
 * @param defaultScope The scope applied when a read passes no explicit scope.
 *
 * @returns The read-only anchored reader handed to transformers.
 */
export function createObjectsView(
	workspace: ModWorkspace,
	defaultScope: ModScope,
): ObjectStoreReader {
	return {
		get(id, type, scope, options) {
			const { at = "runtime" } = options ?? {};
			const effectiveScope = scope ?? defaultScope;

			if (at === "raw")
				return workspace.get(id, type, effectiveScope, "raw");

			const located = workspace.find(id, type, effectiveScope);

			if (!located) return undefined;

			return finalize(workspace, located.key, effectiveScope);
		},

		has(id, type, scope) {
			return workspace.has(id, type, scope ?? defaultScope);
		},

		entries() {
			return workspace.entries();
		},
	};
}
