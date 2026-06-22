/**
 * @file Object enrichment: resolves `copy-from` inheritance and runtime derivations, appending each as a step on the object's timeline.
 */

import {
	appendEntry,
	type CompoundKey,
	entries,
	type GameObject,
	type JSONValue,
	type ModScope,
	type ModWorkspace,
	type Patch,
	readKey,
	type Timeline,
	timelineCurrent,
	timelineRuntime,
} from "@frmds/frontier";
import { getCompositionScope } from "./composition.ts";
import { derive } from "./derivations.ts";

/**
 * Resolves `copy-from` inheritance for {@link child}.
 *
 * @param workspace Workspace holding all object timelines.
 * @param key The child's compound key.
 * @param timeline The child's timeline, to which the `compose` entry is appended.
 * @param child The child object carrying `copy-from`.
 * @param parentId The `copy-from` target id to inherit from.
 * @param scope The child's mod scope, used to resolve the parent.
 * @param composing Keys currently being finalized, for circular-chain detection.
 *
 * @returns The child merged with its inherited parent properties.
 *
 * @throws If `copy-from` cannot be resolved or resolves to a removed object.
 */
function compose(
	workspace: ModWorkspace,
	key: CompoundKey,
	timeline: Timeline,
	child: GameObject,
	parentId: string,
	scope: ModScope,
	composing: Set<CompoundKey>,
): GameObject {
	const [, , childId] = readKey(key);
	const parentScope = getCompositionScope(parentId, childId, scope);
	const parentLocated = workspace.find(parentId, child.type, parentScope);

	if (!parentLocated)
		throw new Error(
			`composeStep(): cannot resolve \`copy-from\`: \`${parentId}\` (type: \`${child.type}\`)\n` +
				`  at: ${key}\n` +
				`Ensure \`${parentId}\` exists in the mod or its dependencies.`,
		);

	const parent = finalize(
		workspace,
		parentLocated.key,
		parentScope,
		composing,
	);

	if (!parent)
		throw new Error(
			`composeStep(): \`copy-from\` parent \`${parentLocated.key}\` resolved to a removed object\n` +
				`  at: ${key}`,
		);

	// * patches record only genuinely inherited props
	// * drop `undefined` and any prop the child already defines
	// * child's props win once resolved
	const inherited = entries(parent).filter(
		(entry): entry is [string, JSONValue] =>
			entry[1] !== undefined && !(entry[0] in child),
	);

	if (!inherited.length) return child;

	const patches = inherited.map<Patch>(([property, value]) => ({
		op: "insert",
		path: [property],
		value,
	}));

	const composed = { ...parent, ...child };

	appendEntry(timeline, { via: "compose" }, patches, composed);

	return composed;
}

/**
 * Finalizes the object at `key`: applies `copy-from` composition then runtime derivations, caching the enriched result on its timeline. Recurses through `copy-from` parents, guarding against circular chains.
 *
 * @param workspace Workspace holding all object timelines.
 * @param key The object's compound key.
 * @param scope The object's mod scope, used to resolve `copy-from` parents.
 * @param composing Keys currently being finalized, for internal recursion checks.
 *
 * @returns The finalized runtime object, or `undefined` if the object was removed.
 *
 * @throws On a circular `copy-from` chain.
 */
export function finalize(
	workspace: ModWorkspace,
	key: CompoundKey,
	scope: ModScope,
	composing: Set<CompoundKey> = new Set(),
): GameObject | undefined {
	const timeline = workspace.timeline(key);

	if (!timeline) return undefined;
	if (workspace.isComplete(key)) return timelineRuntime(timeline);

	if (composing.has(key))
		throw new Error(
			`finalizeObject(): circular copy-from chain: ${[...composing, key].join(" → ")}`,
		);

	composing.add(key);

	let current = timelineCurrent(timeline);

	if (!current) return undefined;

	const parentId = current["copy-from"];

	if (parentId) {
		current = compose(
			workspace,
			key,
			timeline,
			current,
			parentId,
			scope,
			composing,
		);
	}

	current = derive(timeline, key, current);

	workspace.markComplete(key);
	composing.delete(key);

	return current;
}
