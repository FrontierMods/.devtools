/**
 * @file Scope narrowing for `copy-from` parent resolution.
 */

import type { ModScope } from "@frmds/frontier";

/**
 * Narrows the lookup scope for `copy-from` parent resolution.
 *
 * When a mod overrides a base object with the same ID, parent lookup must skip the current mod to avoid self-resolution.
 *
 * @param parentId The `copy-from` target id being resolved.
 * @param childId The id of the child carrying `copy-from`.
 * @param scope The child's mod scope to narrow.
 *
 * @returns The scope minus the current mod when child and parent share an id, otherwise the original scope.
 */
export function getCompositionScope(
	parentId: string,
	childId: string,
	scope: ModScope,
): ModScope {
	// * we know `.slice(1)` returns at least one value because of the earlier `scope.length > 1` check
	return parentId === childId && scope.length > 1
		? (scope.slice(1) as ModScope)
		: scope;
}
