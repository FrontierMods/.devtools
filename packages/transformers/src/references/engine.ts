/**
 * @file Reference resolution: find a target object, extract a value (whole/key/path), filter it, apply patches, and return the result.
 */

import {
	applyPatches,
	ensureFlatArray,
	getAtPath,
	isObject,
	logger,
	matchesAllFilters,
	pluralize,
	resolveObjectID,
} from "@frmds/frontier";
import type {
	GameObject,
	JSONObject,
	JSONValue,
	ModID,
	ModScope,
	ObjectID,
	ObjectType,
	Patch,
	PropertyPath,
	ReferenceFilter,
} from "@frmds/frontier";
import type { TransformContext } from "@frmds/autodoc";

/**
 * Reference to another object with optional extraction and transformation.
 */
export interface ReferenceObject extends JSONObject {
	// oxlint-disable-next-line typescript/no-redundant-type-constituents -- `ObjectID` is `string`, but the sentinel union documents the self-reference intent
	ref: ObjectID | typeof SELF_REFERENCE_KEY;
	key?: string;
	path?: PropertyPath;
	type?: ObjectType;
	scope?: ModID;
	filter?: ReferenceFilter | ReferenceFilter[];
	patch?: Patch[];
	firstMatch?: boolean;
	raw?: boolean;
}

/** Sentinel `ref` value denoting a reference to the current object. Duplicated locally to keep the transformer independent. */
export const SELF_REFERENCE_KEY = "$" as const;

/** Narrow a JSON value to an object, preserving the `JSONObject` type filters expect. Duplicated locally to keep the transformer independent. */
function isJsonObject(value: JSONValue): value is JSONObject {
	return isObject(value);
}

/**
 * Format reference display for error messages.
 * Shows resolved ID for self-references.
 */
function formatRefDisplay(
	reference: ReferenceObject,
	resolvedId: ObjectID,
): string {
	return reference.ref === SELF_REFERENCE_KEY
		? `$ (${resolvedId})`
		: resolvedId;
}

/**
 * Type guard to check if a value is a ReferenceObject.
 */
export function isReferenceObject(value: unknown): value is ReferenceObject {
	return isObject(value) && "ref" in value && typeof value.ref === "string";
}

/**
 * Resolve a single ReferenceObject.
 *
 * Steps:
 * 1. Find target object (use `raw` or `runtime` layer)
 * 2. Extract value (whole object, key, or path)
 * 3. Apply filters (validate target)
 * 4. Apply patches (transform value)
 * 5. Return resolved value
 */
export function resolveReference(
	reference: ReferenceObject,
	context: TransformContext,
	resolvingStack: Set<string> = new Set(),
): JSONValue {
	let target: JSONValue | undefined;
	let targetId: string;

	const isSelfReference = reference.ref === SELF_REFERENCE_KEY;

	if (isSelfReference) {
		const { id } = resolveObjectID(context.currentObject);

		targetId = id;

		if (!reference.raw) {
			logger.debug(
				`References: self-reference to runtime object, using \`context.currentObject\` directly`,
			);

			target = context.currentObject;
		}
	} else {
		targetId = reference.ref;
	}

	const key = `${context.modId}:${reference.type || "*"}:${targetId}`;

	if (resolvingStack.has(key)) {
		const chain = Array.from(resolvingStack).join(" → ");

		throw new Error(
			`References: circular reference detected: ${key}\n` +
				`  Chain: ${chain} → ${key}\n` +
				`  at: ${context.modId}:${context.sourcePath}\n` +
				`Check for circular reference chains between these objects.`,
		);
	}

	resolvingStack.add(key);

	try {
		if (!target) {
			const targetScope = reference.scope
				? ([reference.scope] as ModScope)
				: context.scope;

			const registryResult = context.objects.get(
				targetId,
				reference.type,
				targetScope,
				{ at: reference.raw ? "raw" : "runtime" },
			);

			if (!registryResult) {
				const scopeInfo = reference.scope
					? ` (scope: ${reference.scope})`
					: "";

				const typeInfo = reference.type
					? ` (type: ${reference.type})`
					: "";

				const refDisplay = formatRefDisplay(reference, targetId);

				throw new Error(
					`References: Cannot resolve \`${refDisplay}${typeInfo}${scopeInfo}\`\n` +
						`  at: ${context.modId}:${context.sourcePath}\n` +
						`  store: ${reference.raw ? "raw" : "runtime"}\n` +
						`Ensure ${targetId} exists in current mod or dependencies.`,
				);
			}

			target = registryResult;

			logger.debug(
				`References: found target object from registry: ${JSON.stringify(
					target,
					null,
					2,
				)}`,
			);
		}

		// `target` is a `GameObject` by construction: either `context.currentObject` (the in-progress object) or a non-undefined registry result, both of which the store only ever yields as objects. The runtime anchor already carries derived properties; raw is intentionally as-authored.
		const resolvedTarget = target as GameObject;

		// 3. Extract value
		let value: JSONValue = resolvedTarget;

		if (reference.key) {
			const key = resolvedTarget[reference.key];

			if (key === undefined)
				throw new Error(
					`References: referenced object ${formatRefDisplay(
						reference,
						targetId,
					)} has no key \`${reference.key}\`\n` +
						`  at: ${context.modId}:${context.sourcePath}`,
				);

			value = key;
		} else if (reference.path) {
			const path = getAtPath(resolvedTarget, reference.path);

			if (path === undefined)
				throw new Error(
					`References: referenced object ${formatRefDisplay(
						reference,
						targetId,
					)} has no value at path \`${reference.path.join(".")}\`\n` +
						`  at: ${context.modId}:${context.sourcePath}`,
				);

			value = path;
		}

		if (reference.filter) {
			const filters = ensureFlatArray(reference.filter);

			if (filters.length) {
				// If value is an array, filter is used to SELECT a matching element
				if (Array.isArray(value)) {
					const matches = value.filter(
						(item) =>
							isJsonObject(item) &&
							matchesAllFilters(item, filters),
					);

					if (!matches.length) {
						const elementTypes = value.map((item) =>
							typeof item === "object" && item !== null
								? Array.isArray(item)
									? "array"
									: "object"
								: typeof item,
						);

						throw new Error(
							`References: no array elements match filters\n` +
								`  object: ${targetId} (${
									reference.type || "unknown type"
								})\n` +
								`  at: ${context.modId}:${context.sourcePath}\n` +
								`  filters: ${JSON.stringify(filters)}\n` +
								`  array has ${
									value.length
								} ${pluralize(value.length, "element")} with types: [${elementTypes.join(
									", ",
								)}]`,
						);
					}

					if (matches.length > 1)
						throw new Error(
							`References: multiple array elements match filters (found ${matches.length})\n` +
								`  at: ${context.modId}:${context.sourcePath}\n` +
								`  filters: ${JSON.stringify(filters)}\n` +
								`  Consider making your filter more specific to match exactly one element.`,
						);

					// Extract the single matching element (length validated above)
					value = matches[0]!;
				} else {
					// If value is not an array, filter VALIDATES the object
					if (!isObject(value)) {
						throw new Error(
							`References: cannot apply filters to non-object value (type: ${typeof value})\n` +
								`  at: ${context.modId}:${context.sourcePath}`,
						);
					}

					if (!matchesAllFilters(value, filters))
						throw new Error(
							`References: extracted value does not match filters\n` +
								`  at: ${context.modId}:${context.sourcePath}\n` +
								`  filters: ${JSON.stringify(filters)}`,
						);
				}
			}
		}

		// 5. Apply patches (if specified)
		if (reference.patch && reference.patch.length) {
			logger.debug(
				`References: applying ${reference.patch.length} ${pluralize(reference.patch.length, "patch", "patches")} to extracted value`,
			);
			logger.debug(
				`References: before patches: ${JSON.stringify(value, null, 2)}`,
			);

			value = applyPatches(value, reference.patch);

			logger.debug(
				`References: after patches: ${JSON.stringify(value, null, 2)}`,
			);
		}

		return value;
	} finally {
		resolvingStack.delete(key);
	}
}
