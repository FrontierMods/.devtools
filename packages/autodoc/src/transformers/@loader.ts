/**
 * @file Per-mod transformer loader: validates a `TransformerRef`, imports its module, and asserts the transformer contract before registering it.
 */

import path from "path";
import { pathToFileURL } from "url";
import {
	extractErrorMessage,
	getPluginConfig,
	type ResolvedConfig,
} from "@frmds/frontier";
import { Type } from "typebox";
import { Value } from "typebox/value";
import {
	AUTODOC_TRANSFORMER_API_VERSION,
	isTransformerApiCompatible,
} from "../api-version.ts";
import { AUTODOC_LOGGER } from "../logger.ts";
import type {
	AutodocConfig,
	PackageRef,
	Transformer,
	TransformerRef,
} from "../types/types.ts";

/**
 * Child logger scoped to transformer loading.
 */
const logger = AUTODOC_LOGGER.getChild("transformer-loader");

/**
 * A single export name, or a non-empty list of them.
 */
const EXPORT_SCHEMA = Type.Union([
	Type.String({ minLength: 1 }),
	Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
]);

/**
 * Schema for a package-based transformer reference.
 */
const PACKAGE_REF_SCHEMA = Type.Object(
	{
		package: Type.String({ minLength: 1 }),
		export: Type.Optional(EXPORT_SCHEMA),
	},
	{ additionalProperties: false },
);

/**
 * Schema for a module-path transformer reference.
 */
const MODULE_REF_SCHEMA = Type.Object(
	{
		module: Type.String({ minLength: 1 }),
		export: Type.Optional(EXPORT_SCHEMA),
	},
	{ additionalProperties: false },
);

/**
 * Transformer reference schema.
 */
const TRANSFORMER_REF_SCHEMA = Type.Union([
	PACKAGE_REF_SCHEMA,
	MODULE_REF_SCHEMA,
]);

/**
 * Checks if the transformer reference is a package reference.
 *
 * @param ref The reference to discriminate.
 *
 * @returns `true` when the reference is a {@link PackageRef}.
 */
function isPackageRef(ref: TransformerRef): ref is PackageRef {
	return "package" in ref;
}

/**
 * Resolves one export of a loaded module into transformers.
 *
 * @param namespace The imported module namespace.
 * @param exportName The export to read transformers from.
 * @param specifier The import specifier, used in error messages.
 *
 * @returns The validated transformers from the export.
 *
 * @throws When the export is missing, is an empty array, or holds a value that is not a valid transformer.
 */
function resolveExport(
	namespace: Record<string, unknown>,
	exportName: string,
	specifier: string,
): Transformer[] {
	const value = namespace[exportName];
	const source = `${specifier}#${exportName}`;

	if (!value)
		throw new Error(
			`Transformer export "${exportName}" not found in "${specifier}".`,
		);

	if (!Array.isArray(value)) {
		assertTransformer(value, source);

		return [value];
	}

	if (!value.length)
		throw new Error(
			`Transformer export "${exportName}" in "${specifier}" is an empty array: it declares no transformers.`,
		);

	value.forEach((element, index) =>
		assertTransformer(element, `${source}[${index}]`),
	);

	return value;
}

/**
 * Asserts that a value is a well-formed transformer reference.
 *
 * @param ref The candidate reference.
 *
 * @throws When the reference is missing or malformed.
 */
export function validateTransformerRef(
	ref: unknown,
): asserts ref is TransformerRef {
	if (Value.Check(TRANSFORMER_REF_SCHEMA, ref)) return;

	throw new Error(
		`Invalid transformer reference: ${JSON.stringify(ref)}\n` +
			`  Each entry needs exactly one of "package" or "module", and an optional "export" (a string or an array of strings).`,
	);
}

/**
 * Maps a reference to an import specifier: bare package, or a file URL for local modules.
 *
 * @param ref The transformer reference to map.
 * @param modRoot Mod root used to resolve local module paths.
 *
 * @returns The import specifier for the reference.
 */
export function resolveSpecifier(ref: TransformerRef, modRoot: string): string {
	if (isPackageRef(ref)) return ref.package;

	return pathToFileURL(path.resolve(modRoot, ref.module)).href;
}

/**
 * Asserts that an imported value satisfies the transformer contract.
 *
 * @param value The imported value.
 * @param source The import specifier, used in error messages.
 *
 * @throws When the value is not a contract-compliant transformer.
 */
export function assertTransformer(
	value: unknown,
	source: string,
): asserts value is Transformer {
	if (typeof value !== "object" || value === null)
		throw new Error(`Transformer from \`${source}\` is not an object.`);

	const candidate = value as Record<string, unknown>;

	if (typeof candidate.transform !== "function")
		throw new Error(
			`Transformer from \`${source}\` is invalid: missing a \`transform()\` function.`,
		);

	const target = candidate.target;

	if (typeof target !== "object" || target === null || !("content" in target))
		throw new Error(
			`Transformer from \`${source}\` is invalid: missing a valid \`target\` property.`,
		);

	if (
		typeof candidate.api !== "string" ||
		!isTransformerApiCompatible(candidate.api)
	)
		throw new Error(
			`Transformer from \`${source}\` is invalid: declares API version ${JSON.stringify(candidate.api)}, ` +
				`incompatible with ${AUTODOC_TRANSFORMER_API_VERSION} on transformer handler.`,
		);
}

/**
 * Imports and validates the transformers named by a reference.
 *
 * @param ref The transformer reference to resolve.
 * @param modRoot Mod root used to resolve local module paths.
 *
 * @returns The validated transformers.
 *
 * @throws When the reference is malformed, the module fails to import, or an export is not a valid transformer.
 */
export async function loadTransformers(
	ref: TransformerRef,
	modRoot: string,
): Promise<Transformer[]> {
	validateTransformerRef(ref);

	const specifier = resolveSpecifier(ref, modRoot);

	const exportNames =
		typeof ref.export === "string"
			? [ref.export]
			: (ref.export ?? ["default"]);

	let namespace: Record<string, unknown>;

	try {
		namespace = await import(specifier);
	} catch (error) {
		throw new Error(
			`Failed to import transformer from "${specifier}": ${extractErrorMessage(error)}`,
		);
	}

	return exportNames.flatMap((exportName) =>
		resolveExport(namespace, exportName, specifier),
	);
}

/**
 * Drops transformers whose name has already appeared, keeping the first occurrence.
 *
 * @param transformers The transformers to deduplicate.
 *
 * @returns The transformers with later name duplicates removed.
 */
export function dedupeTransformers(transformers: Transformer[]): Transformer[] {
	const seen = new Set<string>();

	return transformers.filter((transformer) => {
		if (seen.has(transformer.name)) {
			logger.debug(
				`Dropping duplicate transformer "${transformer.name}": an earlier declaration already provides it.`,
			);

			return false;
		}

		seen.add(transformer.name);

		return true;
	});
}

/**
 * Resolves the full transformer set for a build.
 *
 * @param config The resolved build configuration.
 *
 * @returns The deduplicated transformers declared by the mod, in declaration order.
 *
 * @throws When a declared reference is malformed or fails to import.
 */
export async function resolveTransformerSet(
	config: ResolvedConfig,
): Promise<Transformer[]> {
	const { transformers: refs = [] } = getPluginConfig<AutodocConfig>(
		config,
		"autodoc",
	);

	const loaded = await Promise.all(
		refs.map((ref) => loadTransformers(ref, config.paths.cwd)),
	);

	return dedupeTransformers(loaded.flat());
}
