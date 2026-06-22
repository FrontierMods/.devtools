/**
 * @file Type definitions for the game object transformation pipeline.
 */

import type {
	GameObject as BaseGameObject,
	Cache,
	CanonicalPath,
	CompoundKey,
	JSONObject,
	JSONValue,
	ModID,
	ModScope,
	ObjectID,
	ObjectType,
	Patch,
	PropertyPath,
} from "@frmds/frontier";
import type { TSchema } from "typebox";
import type { ObjectStoreReader } from "../object/store-view.ts";

/**
 * Key identifying a cross-object dependency.
 */
export type DependencyKey = string;

/**
 * A semantic version string.
 */
export type SemVer = `${number}.${number}.${number}`;

/**
 * Valid `inherit` value.
 */
export type InheritValue = ObjectID | InheritSpec | (ObjectID | InheritSpec)[];

/**
 * How transformers may be referenced in the mod config.
 */
export type TransformerRef = PackageRef | ModuleRef;

/**
 * Declarative target for a transformer. Either {@link TraversalTarget} (match anywhere) or {@link PositionalTarget} (visit declared paths).
 * Modeled as a union so `strict` cannot be set without `paths`.
 */
export type TransformerTarget = TraversalTarget | PositionalTarget;

/** A {@link Transformer} whose target is narrowed to {@link PositionalTarget} (declares `paths`). */
export type PositionalTransformer = Transformer & { target: PositionalTarget };

/**
 * Base {@link BaseGameObject | GameObject} extended with Autodoc-specific fields.
 *
 * TODO: derive these props from Autodoc-side custom schema
 */
export interface GameObject extends BaseGameObject {
	/** Inheritance declaration resolved before the object is processed. */
	inherit?: InheritValue;
	/** Patches applied to this object during transformation. */
	patch?: Patch[];
}

/**
 * Extended inheritance specification with optional scope and type.
 */
export interface InheritSpec extends JSONObject {
	/** ID of the object to inherit from. */
	id: ObjectID;
	/** Mod scope to resolve the parent within, when narrower than the default chain. */
	scope?: ModID;
	/** Object type to resolve the parent as, when it differs from the inheritor. */
	type?: ObjectType;
}

/**
 * Traversal target: `content` is matched anywhere in the tree.
 */
export interface TraversalTarget {
	/** Schema matched anywhere in the object tree. */
	content: TSchema;
}

/**
 * Positional target: visits the declared `paths` and matches `content` there.
 */
export interface PositionalTarget {
	/** The declared paths this transformer visits. */
	paths: PropertyPath[];
	/** Schema matched at each declared path. */
	content: TSchema;
	/**
	 * When `true`, the declared `paths` are owned exclusively by this transformer: any value left occupying one of them that fails `content` (and was not produced by transformation) is reported as a validation error after the rescan loop settles, rather than silently skipped. Use for keys that are solely this transformer's input (e.g. `inherit`); leave unset for paths that may legitimately hold values outside `content` (e.g. a quantity field another transformer handles).
	 */
	strict?: boolean;
}

/**
 * Schema-based transformer. The runtime gates on {@link TransformerTarget} and ordering emerges from the rescan loop.
 *
 * @template TValue The value shape this transformer processes.
 */
export interface Transformer<TValue extends JSONValue = JSONValue> {
	/** Unique transformer name, used for deduplication. */
	name: string;
	/** Transformer version. */
	version: string;
	/** Human-readable description of what the transformer does. */
	description?: string;
	/** API version this transformer targets, checked for host compatibility. */
	api: SemVer;
	/** Declarative target gating where the transformer runs. */
	target: TransformerTarget;
	/**
	 * Extracts the cross-object dependencies a value introduces during the scan phase.
	 *
	 * @param value The value being scanned.
	 * @param context The scan context for the current value.
	 *
	 * @returns The compound keys this value depends on.
	 */
	extractDependencies?(value: TValue, context: ScanContext): CompoundKey[];
	/**
	 * Transforms a matched value into the patches that replace it.
	 *
	 * @param value The value being transformed.
	 * @param context The transform context for the current value.
	 *
	 * @returns The patches to apply for this value.
	 */
	transform(value: TValue, context: TransformContext): Patch[];
}

/**
 * Context available while a transformer is detected and its dependencies extracted.
 * The object store and mod scope do not exist yet during the scan phase, so they are absent here.
 */
export interface ScanContext {
	/** Canonical path of the source file the object came from. */
	sourcePath: CanonicalPath;
	/** ID of the mod that owns the object. */
	modId: ModID;
	/** The object currently being scanned. */
	currentObject: GameObject;
	/**
	 * Path to the value being transformed within the object.
	 * Empty array `[]` indicates root-level transformation.
	 *
	 * @example
	 * ```typescript
	 * // * this targets `object.pocket_data[0].volume`
	 * context.propertyPath = ["pocket_data", 0, "volume"]
	 *
	 * // * this transforms at root level
	 * context.propertyPath = []
	 * ```
	 */
	propertyPath: PropertyPath;
	/** Abort signal that cancels the scan when triggered. */
	signal?: AbortSignal;
}

/**
 * Context provided to transformers during processing.
 * Extends {@link ScanContext} with the object store and mod scope, which become available by the execute phase.
 */
export interface TransformContext extends ScanContext {
	/** Read-only anchored access to every object's history: past (`raw`) and future (`runtime`) selves. */
	objects: ObjectStoreReader;
	/** The declaring object's mod dependency chain. */
	scope: ModScope;
}

/**
 * Record of where a transformer should execute within an object.
 */
export interface ExecutionTarget {
	/** Path to the value that needs transformation. */
	path: PropertyPath;
	/** Transformer to apply. */
	transformer: Transformer;
	/** Nesting depth. */
	depth: number;
}

/**
 * Execution plan for a single object.
 */
export interface ExecutionMap {
	/** ID of the object being processed. */
	objectId: ObjectID;
	/** All transformer applications for this object. */
	targets: ExecutionTarget[];
}

/**
 * Result of scanning a single object.
 */
export interface ObjectScanResult {
	/** ID of the scanned object. */
	objectId: ObjectID;
	/** Execution plan for this object. */
	executionMap: ExecutionMap;
	/** Compound keys of objects this object depends on. */
	dependencies: Set<CompoundKey>;
}

/**
 * File context for build process.
 */
export interface FileContext {
	/** Canonical path of the source file. */
	sourcePath: CanonicalPath;
	/** ID of the mod that owns the file. */
	modId: ModID;
	/** Objects loaded from the file. */
	objects: GameObject[];
}

/**
 * Result from loading files into registry.
 */
export interface LoadFilesResult {
	/** Number of files loaded. */
	filesLoaded: number;
	/** Number of objects loaded across all files. */
	objectsLoaded: number;
	/** Per-file context for the loaded files. */
	fileContexts: FileContext[];
	/** The dependency's still-open cache, when a lazy source kept it alive. The build closes it after the run. */
	openCache?: Cache;
}

/**
 * Processing item with metadata for topological sort.
 */
export interface ProcessingItem {
	/** The object to process. */
	object: GameObject;
	/** ID of the mod that owns the object. */
	modId: ModID;
	/** Canonical path of the object's source file. */
	sourcePath: CanonicalPath;
}

/**
 * Context metadata for an object.
 */
export interface ObjectContext {
	/** Canonical path of the object's source file. */
	sourcePath: CanonicalPath;
	/** ID of the mod that owns the object. */
	modId: ModID;
}

/**
 * A transformer sourced from a bare package specifier. Each named export may hold a single transformer or an array of them.
 */
export interface PackageRef extends JSONObject {
	/** Bare package specifier the transformer is imported from. */
	package: string;
	/** Export name or names to read transformers from, defaulting to `default`. */
	export?: string | string[];
}

/**
 * A transformer sourced from a mod-root-relative module path. Each named export may hold a single transformer or an array of them.
 */
export interface ModuleRef extends JSONObject {
	/** Mod-root-relative module path the transformer is imported from. */
	module: string;
	/** Export name or names to read transformers from, defaulting to `default`. */
	export?: string | string[];
}

/**
 * Autodoc-specific configuration from `frontier.json5`.
 */
export interface AutodocConfig extends JSONObject {
	/**
	 * Maximum concurrent operations during scan phase.
	 *
	 * @default 16
	 */
	concurrency?: number;
	/** Transformers to load and run, in declaration order. None run unless declared here. */
	transformers?: TransformerRef[];
}
