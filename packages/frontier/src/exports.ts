/**
 * @file Public API surface of the `@frmds/frontier` package, re-exporting every consumer-facing symbol.
 */

/* # APP LOCATIONS */

export { appPaths } from "./locations.ts";
export type { AppPaths } from "./locations.ts";

/* # CACHE SERVICE */

export { Cache } from "./cache/cache.ts";
export type { CacheOptions } from "./cache/types.ts";
export { getFileMetadata, hasFileChanged } from "./cache/validation.ts";
export type { FileMetadata } from "./cache/validation.ts";

/* # CONFIG SERVICE */

export { getPluginConfig, resolveConfig } from "./config/config.ts";
export type { ResolveConfigOptions } from "./config/config.ts";
export type { ResolvedConfig, ResolvedPaths } from "./config/types.ts";
export { ConfigError } from "./config/error.ts";
export {
	clearGlobalConfig,
	globalConfigPath,
	readGlobalConfig,
	validateConfig,
	writeGlobalConfig,
} from "./config/global.ts";
export type { GlobalConfig } from "./config/global.ts";
export { paramForKey, PARAMS } from "./config/params.ts";
export type { ConfigParam } from "./config/params.ts";

/* # CONSTANTS */

export {
	BASE_GAME_MOD_ID,
	CATEGORIES,
	FRONTIER_CACHE_DIR,
	META_NAMESPACE,
} from "./constants.ts";

/* # DEPENDENCY GRAPH */

export { DependencySortError } from "./dependency/error.ts";
export {
	getTransitiveClosure,
	sortByDependencies,
} from "./dependency/graph.ts";
export type { SortByDependenciesOptions } from "./dependency/graph.ts";

/* # ERROR UTILITIES */

export { extractErrorMessage } from "./error.ts";

/* # FILE UTILITIES */

export {
	discoverFiles,
	filterByGlobs,
	findFilesRecursiveSync,
} from "./file/discovery.ts";
export type {
	DiscoveryOptions,
	FilterByGlobsOptions,
} from "./file/discovery.ts";
export {
	getCachePath,
	toAbsolutePath,
	toCanonicalPath,
	toCanonicalPathAsync,
	normalizePath as toForwardSlashes,
} from "./file/paths.ts";
export { readFile, readFiles } from "./file/reader.ts";
export type { ReadOptions, ReadResult } from "./file/reader.ts";
export { writeFiles } from "./file/writer.ts";
export type { WriteItem, WriteOptions, WriteResult } from "./file/writer.ts";

/* # FLAGS */

export { CORE_FLAGS, withCoreFlags } from "./flags.ts";
export type { CoreFlags, PathFlags } from "./flags.ts";

/* # FORMATTING */

export { pluralize } from "./format.ts";

/* # GAME UTILITIES */

export { isBaseGame, isPathDeeper, pathDepth } from "./game/quirks.ts";
export {
	discoverInstalls,
	gamePaths,
	hashFromInstall,
	installsFrom,
	listInstalls,
	resolveGamePath,
	resolveInstall,
} from "./game/installs.ts";
export type {
	DiscoverDeps,
	GameInstall,
	ResolveGamePathOptions,
} from "./game/installs.ts";
export { isSHA, parseSHA } from "./game/sha.ts";
export type { SHA } from "./game/sha.ts";
export { versionLabel } from "./game/version.ts";
export { STABLE_RELEASES } from "./game/stable.ts";

/* # HASHING */

export { hashFile, hashString } from "./hash.ts";

/* # LOGGING */

export { configureLogger, createLogger, logger } from "./logger.ts";
export type { Logger } from "@logtape/logtape";

/* # MOD RESOLVER */

export { ModResolverError } from "./mod/error.ts";
export { ModResolver } from "./mod/resolver.ts";
export type {
	Category,
	ModFile,
	ModFileFilter,
	ModID,
	ModIndexEntry,
	ModInfo,
	ModScope,
	ModSource,
	ParsedModInfo,
} from "./mod/types.ts";

/* # OBJECT REGISTRY */

export { ObjectRegistryError } from "./object/error.ts";
export {
	hasObjectID,
	makeKey,
	makeKeyFromObject,
	readKey,
	resolveObjectID,
} from "./object/identity.ts";
export { InMemoryObjectRegistry } from "./object/registry.ts";
export {
	appendEntry,
	appendTombstone,
	createTimelineForObject,
	foldTimeline,
	isTimelineTombstoned,
	timelineCurrent,
	timelineRaw,
	timelineRuntime,
} from "./object/timeline.ts";
export type {
	EntryOrigin,
	EntrySource,
	Timeline,
	TimelineAnchor,
	TimelineEntry,
} from "./object/timeline.ts";
export { ModWorkspace } from "./object/workspace.ts";
export type {
	ApplyLocation,
	ApplyResult,
	LazyObjectSource,
	LocatedTimeline,
} from "./object/workspace.ts";
export { ID_PROPERTIES } from "./object/types.ts";
export type {
	CompoundKey,
	GameObject,
	IDProperty,
	ObjectMetadata,
	ObjectRegistry,
	ReadableObjectRegistry,
	ResolvedID,
	RegistryEventHandler as WriteHandler,
} from "./object/types.ts";

/* # OBJECT ACCESS */

export {
	deepWalk,
	entries,
	fromEntries,
	getAtPath,
	keys,
} from "./object/access.ts";
export type { DeepWalkCallback } from "./object/access.ts";

/* # JSON PATCH LAYER */

export { compareValues } from "./patch/comparison.ts";
export { matchesAllFilters, matchesFilter } from "./patch/filters.ts";
export {
	applyPatch,
	applyPatches,
	arrayToJSONPointer,
	convertToJSONPatch,
	isPatch,
	normalizePath,
	PatchSchemas,
} from "./patch/patch.ts";
export type {
	AddPatch,
	AppendPatch,
	CopyPatch,
	DividePatch,
	DropPatch,
	InsertPatch,
	MergePatch,
	MovePatch,
	MultiplyPatch,
	Patch,
	PatchPath,
	PushPatch,
	RemovePatch,
	ReplacePatch,
	SubtractPatch,
	TestPatch,
} from "./patch/patch.ts";
export {
	isDescendantPath,
	resolvePatchPath,
	resolveRelativePath,
} from "./patch/paths.ts";
export type {
	Comparator,
	ComparatorSymbol,
	ComparatorText,
	ReferenceFilter,
} from "./patch/types.ts";

/* # PLUGIN SYSTEM */

export { RegistryReadError } from "./plugin/error.ts";
export {
	PLUGIN_API_VERSION,
	isCompatible,
	loadPlugins,
} from "./plugin/manager.ts";
export {
	addPlugin,
	readRegistry,
	removePlugin,
	resetRegistry,
	writeRegistry,
} from "./plugin/registry.ts";
export { PLUGIN_STATUSES } from "./plugin/types.ts";
export type {
	LoadMode,
	Plugin,
	PluginDefinition,
	LoadedPlugin as PluginLoadResult,
	PluginMetadata,
	PluginRegistration,
	PluginRegistry,
	PluginStatus,
	RouteContribution,
	RouteTarget,
} from "./plugin/types.ts";

/* # SCHEMA ARTIFACTS */

export {
	modSchemaPaths,
	readSchemaPin,
	storeEntryDir,
	writeSchemaPin,
	type ModSchemaPaths,
	type SchemaPin,
} from "./schema/paths.ts";

/* # TYPES */

export type {
	AbsolutePath,
	CachePath,
	CanonicalPath,
	Duration,
	FileSize,
	Hash,
	InputFormat,
	JSONObject,
	JSONValue,
	ModPath,
	Namespace,
	ObjectID,
	ObjectType,
	OutputFormat,
	OutputPath,
	Path,
	PropertyPath,
	RelativePath,
	Timestamp,
} from "./types/data.ts";
export {
	isArray,
	isDefined,
	isGameFile,
	isGameObject,
	isInteger,
	isNotNullLike,
	isNumericOnly,
	isObject,
	isString,
} from "./types/guards.ts";

export { ensureFlatArray } from "./types/transforms.ts";

/* # WORK QUEUE */

export { WorkQueue } from "./work-queue.ts";
export type { WorkQueueOptions } from "./work-queue.ts";
