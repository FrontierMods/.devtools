/**
 * @file inheritance engine: normalizes `inherit` specs, fetches the parent object, and builds the patches that splice inherited props in.
 *
 * Shape validation is the gate's job, so these functions trust the value they receive.
 */

import {
	isString,
	readKey,
	resolveObjectID,
	type CompoundKey,
	type ModScope,
	type Patch,
} from "@frmds/frontier";
import {
	getCompositionScope,
	type GameObject,
	type ObjectStoreReader,
	type TransformContext,
} from "@frmds/autodoc";
import type { InheritValue } from "./schema.ts";
import type { ResolvedInheritTarget } from "./types.ts";

/**
 * Normalize a gate-validated `inherit` value into resolution targets, defaulting each entry's lookup scope to the current scope unless it names its own.
 */
export function normalizeInheritSpecs(
	inheritValue: InheritValue,
	contextScope: ModScope,
): ResolvedInheritTarget[] {
	const entries = Array.isArray(inheritValue) ? inheritValue : [inheritValue];

	return entries.map((entry) =>
		isString(entry)
			? { id: entry.trim(), scope: contextScope }
			: {
					id: entry.id,
					type: entry.type,
					scope: entry.scope ? [entry.scope] : contextScope,
				},
	);
}

/**
 * Resolve one inheritance target to its parent object, hoisting a same-id lookup past the current mod (like `copy-from`) and falling back to a type-agnostic scan when no type is given.
 */
export function fetchParent(
	spec: ResolvedInheritTarget,
	objects: ObjectStoreReader,
	child: GameObject,
	context: TransformContext,
): GameObject {
	const { id, type, scope } = spec;
	const childId = resolveObjectID(child).id;

	// * hoist a same-ID `inherit` past the current mod so it resolves the base definition, just like `copy-from`
	const lookupScope = getCompositionScope(id, childId, scope);

	let parent = objects.get(id, type, lookupScope);

	if (!parent) {
		// Type-agnostic fallback: scan entries for a single match
		const candidates = Array.from(objects.entries())
			.filter(([key]) => {
				const [, , objectId] = readKey(key as CompoundKey);

				return (
					objectId === id &&
					lookupScope.some((modId) => key.startsWith(`${modId}:`))
				);
			})
			.map(([, object]) => object);

		if (candidates.length === 1) {
			parent = candidates[0];
		} else if (candidates.length > 1) {
			const types = candidates
				.map((candidate) => candidate.type)
				.join(", ");

			throw new Error(
				`Ambiguous inherit: "${id}" matches multiple types: ${types}\n` +
					`  at: ${child.type}:${childId}\n` +
					`  Specify type explicitly: { id: "${id}", type: "<TYPE>" }`,
			);
		}
	}

	if (!parent) {
		const typeInfo = type ? ` (type: ${type})` : "";

		throw new Error(
			`Cannot resolve inherit: ${id}${typeInfo}\n` +
				`  at: ${lookupScope[0]}:${child.type}:${childId}\n` +
				`  source: ${context.sourcePath}\n` +
				`Ensure ${id} exists in current mod or dependencies.`,
		);
	}

	return parent;
}

/**
 * Build inheritance patches: insert every parent property the child does not already declare, then drop the `inherit` directive.
 */
export function resolveInheritance(
	inheritValue: InheritValue,
	context: TransformContext,
): Patch[] {
	const child = context.currentObject;
	const specs = normalizeInheritSpecs(inheritValue, context.scope);

	const parent = specs.reduce(
		(accumulator, spec) =>
			Object.assign(
				accumulator,
				fetchParent(spec, context.objects, child, context),
			),
		{},
	);

	// * patches for inherited props only
	const patches = Object.entries<GameObject>(parent)
		.filter(([key]) => !(key in child))
		.map<Patch>(([key, value]) => ({
			op: "insert",
			path: ["..", key],
			value,
		}));

	// * remove `inherit`
	patches.push({ op: "remove", path: [] });

	return patches;
}
