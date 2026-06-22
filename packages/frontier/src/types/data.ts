/**
 * @file Core data type aliases shared across the toolkit: paths, identifiers, formats, and the JSON value shape.
 */

import type { JSONPath } from "immutable-json-patch";

/**
 * A content hash, used to key caches and detect changes.
 */
export type Hash = string;

/**
 * Filesystem path to a mod's root or one of its sources.
 */
export type ModPath = string;

/**
 * Filesystem path where built output is written.
 */
export type OutputPath = string;

/**
 * Filesystem path to the on-disk build cache.
 */
export type CachePath = string;

/**
 * A logical grouping label for objects or functions.
 */
export type Namespace = string;

/**
 * A point in time in milliseconds since the epoch.
 */
export type Timestamp = number;

/**
 * An elapsed time span in milliseconds.
 */
export type Duration = number;

/**
 * A size in bytes.
 */
export type FileSize = number;

/**
 * An absolute filesystem path.
 */
export type AbsolutePath = string;

/**
 * A path relative to some known root.
 */
export type RelativePath = string;

/**
 * Normalized path reusable for any tool.
 */
export type CanonicalPath = string;

/**
 * Generic path type for when it's unclear which path goes in.
 */
export type Path = AbsolutePath | RelativePath | CanonicalPath;

/**
 * A path from a JSON root to a value, as positional segments (alias of `immutable-json-patch`'s `JSONPath`).
 */
export type PropertyPath = JSONPath;

/**
 * Any value expressible in JSON, including nested arrays and objects.
 */
export type JSONValue =
	| string
	| number
	| boolean
	| null
	| JSONValue[]
	| JSONObject;

/**
 * A game object's identifier property.
 * Can come from `id` or `abstract` for items, and from other props for other types.
 */
export type ObjectID = string;

/**
 * A game object's `type` prop.
 */
export type ObjectType = string;

/**
 * A source format the toolkit accepts as input.
 */
export type InputFormat = "json5" | "json";

/**
 * The format the toolkit emits as build output.
 */
export type OutputFormat = "json";

/**
 * A plain JSON object whose values may be absent.
 */
export interface JSONObject {
	[key: string]: JSONValue | undefined;
}
