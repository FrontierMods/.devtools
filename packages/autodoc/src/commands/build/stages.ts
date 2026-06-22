/**
 * @file Build stage functions.
 */

import {
	Cache,
	type CanonicalPath,
	type CompoundKey,
	discoverFiles,
	type FileMetadata,
	fromEntries,
	getPluginConfig,
	type ModID,
	type ModScope,
	ModWorkspace,
	pluralize,
	readSchemaPin,
	type WriteResult,
} from "@frmds/frontier";
import fs from "fs-extra";
import path from "path";

import { config, modResolver } from "../../context.ts";
import { loadDependencies, loadFiles, statFiles } from "../../loader.ts";
import { AUTODOC_LOGGER } from "../../logger.ts";
import { computeDirtySources } from "../../manifest/dirty.ts";
import {
	aggregateFingerprint,
	environmentFingerprint,
	type TransformerIdentity,
} from "../../manifest/fingerprint.ts";
import { checkFreshness } from "../../manifest/freshness.ts";
import {
	buildQueryResolver,
	queryFromKey,
	type QueryResolver,
	type ReadQuery,
} from "../../manifest/queries.ts";
import { readManifest, writeManifest } from "../../manifest/store.ts";
import { MANIFEST_VERSION, type BuildManifest } from "../../manifest/types.ts";
import type { ReadLog } from "../../object/recording-view.ts";
import { scanObject } from "../../phases/scan.ts";
import type {
	FileContext,
	ObjectContext,
	ProcessingItem,
	Transformer,
} from "../../types/types.ts";

/**
 * Results of cleaning caches via {@link cleanCaches cleanCaches()}.
 */
export interface CleanCachesResult {
	/** Whether the output directory was removed. */
	outputDirCleared: boolean;
	/** Whether the mod cache was cleared. */
	modCacheCleared: boolean;
}

/**
 * Prepared context produced by {@link setupBuildContext setupBuildContext()}.
 */
export interface SetupBuildContextResult {
	/** The workspace files are loaded into. */
	workspace: ModWorkspace;
	/** The current mod detected from the working directory. */
	modId: ModID;
	/** The mod's dependency scope. */
	scope: ModScope;
	/** The resolved input directory. */
	inputDir: CanonicalPath;
	/** The resolved output directory. */
	outputDir: CanonicalPath;
	/** The discovered source files. */
	sources: CanonicalPath[];
}

/**
 * Load totals produced by {@link loadModFiles loadModFiles()}.
 */
export interface LoadModFilesResult {
	/** Count of files loaded from the current mod. */
	filesLoaded: number;
	/** Count of objects loaded from the current mod. */
	objectsLoaded: number;
	/** Per-file contexts produced while loading. */
	fileContexts: FileContext[];
	/** Totals describing the dependency mods loaded. */
	dependenciesLoaded: {
		/** Count of dependency mods loaded. */
		modsLoaded: number;
		/** Count of dependency files loaded. */
		filesLoaded: number;
		/** Count of dependency objects loaded. */
		objectsLoaded: number;
	};
	/** Dependency caches kept open by lazy sources, which the build closes after the run. */
	openCaches: Cache[];
}

/**
 * Dependency-ordered objects produced by {@link analyzeDependencies}.
 */
export interface AnalyzeDependenciesResult {
	/** The flattened objects in processing order. */
	processingOrder: ProcessingItem[];
	/** Count of objects in the processing order. */
	objectCount: number;
}

/**
 * Freshness verdict produced by {@link checkBuildFreshness}.
 */
export interface FreshnessStageResult {
	/** Whether the previous build is still valid. */
	upToDate: boolean;
	/** Why the build is stale, when it is not up to date. */
	reason: string;
	/** Fingerprint of the build environment. */
	environment: string;
	/** Metadata for each source file, gathered by the stat sweep. */
	sourceStats: Map<CanonicalPath, FileMetadata>;
	/** Aggregate fingerprint per dependency mod. */
	dependencyFingerprints: Map<ModID, string>;
	/** The manifest read this run. */
	manifest: BuildManifest | undefined;
}

/**
 * Changed and removed sources produced by {@link computeDirtyStage computeDirtyStage()}.
 */
export interface DirtyStageResult {
	/** Sources that must re-run the pipeline. */
	dirty: Set<CanonicalPath>;
	/** Sources that no longer exist and were removed. */
	removed: Set<CanonicalPath>;
	/** Outputs recorded for removed sources, for deletion at write time. */
	staleOutputs: CanonicalPath[];
	/** Owner resolution over the loaded `CWD` objects. */
	resolveOwners: QueryResolver;
}

/**
 * Inputs needed by {@link recordBuildManifest recordBuildManifest()} to persist the manifest.
 */
export interface ManifestRecordInputs {
	/** The freshness verdict carrying the prior manifest and source stats. */
	freshness: FreshnessStageResult;
	/** Sources that re-ran the pipeline this run. */
	dirty: Set<CanonicalPath>;
	/** Owner resolution used to record read owners. */
	resolveOwners: QueryResolver;
	/** Runtime reads from the recording view, keyed by consumer source files. */
	readsByFile: Map<CanonicalPath, ReadLog>;
	/** Scan-phase dependencies keyed by object, mapped to files via object contexts. */
	objectDependencies: Map<CompoundKey, Set<CompoundKey>>;
	/** Source path and mod for each processed object. */
	objectContexts: Map<CompoundKey, ObjectContext>;
	/** Source-to-output pairs actually written this run. */
	written: WriteResult[];
}

/**
 * Child logger scoped to caching and build stages.
 */
const logger = AUTODOC_LOGGER.getChild("cache");

/**
 * Cleans caches and output directory.
 *
 * @param outputDir The output directory to remove.
 *
 * @returns Whether the output directory and mod cache were cleared.
 *
 * @throws When the output directory is or contains the mod root.
 */
export async function cleanCaches(
	outputDir: CanonicalPath,
): Promise<CleanCachesResult> {
	logger.info("Cleaning caches and output directory...");

	const relativeToRoot = path.relative(outputDir, config.paths.cwd);

	const outputContainsMod =
		relativeToRoot === "" ||
		(!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot));

	if (outputContainsMod)
		throw new Error(
			`Refusing to clean: output \`${outputDir}\` is or contains the mod root \`${config.paths.cwd}\``,
		);

	const result: CleanCachesResult = {
		outputDirCleared: false,
		modCacheCleared: false,
	};

	if (await fs.pathExists(outputDir)) {
		await fs.remove(outputDir);

		result.outputDirCleared = !(await fs.pathExists(outputDir));
	}

	const cwdCache = new Cache();

	await cwdCache.clear();

	result.modCacheCleared = true;

	logger.info("Clean complete");

	return result;
}

/**
 * Reports whether the mod's materialized schema artifacts are usable.
 *
 * @param modRoot The mod root directory to inspect for schema artifacts.
 *
 * @returns A warning message when artifacts are missing, otherwise `null`.
 */
export function checkSchemaArtifacts(modRoot: string): string | null {
	const pin = readSchemaPin(modRoot);

	if (!pin)
		return "No schema artifacts found. Run `frontier run schema sync` to enable schema-backed validation and editor support";

	return null;
}

/**
 * Initializes build context: creates registry stores, discovers files, and detects `modId`.
 *
 * @returns The workspace, mod, scope, directories, and discovered sources.
 *
 * @throws When no source files are found or the current mod cannot be detected.
 */
export async function setupBuildContext(): Promise<SetupBuildContextResult> {
	const { cwd: modRoot, input: inputDir, output: outputDir } = config.paths;

	logger.debug(`Starting build: ${inputDir} → ${outputDir}`);

	const schemaWarning = checkSchemaArtifacts(modRoot);

	if (schemaWarning) logger.warn(schemaWarning);

	const sources = await discoverFiles(inputDir, {
		patterns: ["**/*.json5"],
	});

	if (!sources.length)
		throw new Error(`No source files found in ${inputDir}`);

	logger.debug(
		`Discovered ${sources.length} source ${pluralize(sources.length, "file")}`,
	);

	const workspace = new ModWorkspace();
	const cwdModEntry = modResolver.currentMod;

	if (!cwdModEntry) throw new Error("Failed to detect current mod from CWD");

	const modId = cwdModEntry.id;

	logger.debug(`Building mod: ${modId}`);

	const scope = modResolver.scopeFor(modId);

	logger.debug(`Mod scope: ${scope.join(", ")}`);

	return { workspace, modId, scope, inputDir, outputDir, sources };
}

/**
 * Loads files from the current mod and dependencies into the workspace.
 *
 * @param workspace The workspace files are loaded into.
 * @param sources The source files of the current mod.
 * @param modId The current mod being built.
 * @param dependencyFingerprints Prior dependency fingerprints reused to skip unchanged dependencies, omitted on a full load.
 *
 * @returns Load totals for the current mod and its dependencies, plus the caches left open.
 */
export async function loadModFiles(
	workspace: ModWorkspace,
	sources: CanonicalPath[],
	modId: ModID,
	dependencyFingerprints?: Map<ModID, string>,
): Promise<LoadModFilesResult> {
	logger.debug(`Parsing source files...`);

	const { filesLoaded, objectsLoaded, fileContexts } = await loadFiles(
		sources,
		modId,
		workspace,
	);

	logger.debug(
		`Loaded ${filesLoaded} ${pluralize(filesLoaded, "file")} from \`${modId}\`, loaded ${objectsLoaded} ${pluralize(objectsLoaded, "object")} into the workspace`,
	);

	const dependencies = modResolver.dependenciesOf(modId);

	logger.debug(
		`Loading ${dependencies.length} dependency ${pluralize(dependencies.length, "mod")}...`,
	);

	const resolvedDependencies = await loadDependencies(
		dependencies,
		workspace,
		dependencyFingerprints,
	);

	logger.debug(
		`Loaded ${resolvedDependencies.modsLoaded} dependency ${pluralize(resolvedDependencies.modsLoaded, "mod")}: ${resolvedDependencies.filesLoaded} ${pluralize(resolvedDependencies.filesLoaded, "file")}, ${resolvedDependencies.objectsLoaded} ${pluralize(resolvedDependencies.objectsLoaded, "object")}`,
	);

	return {
		filesLoaded,
		objectsLoaded,
		fileContexts,
		dependenciesLoaded: resolvedDependencies,
		openCaches: resolvedDependencies.openCaches,
	};
}

/**
 * Flattens loaded file contexts into processing items.
 *
 * @param fileContexts The loaded file contexts to flatten.
 *
 * @returns The processing order and its object count.
 */
export function analyzeDependencies(
	fileContexts: FileContext[],
): AnalyzeDependenciesResult {
	const processingOrder: ProcessingItem[] = fileContexts.flatMap(
		({ objects, modId, sourcePath }) =>
			objects.map((object) => ({ object, modId, sourcePath })),
	);

	return {
		processingOrder,
		objectCount: processingOrder.length,
	};
}

/**
 * Decides whether the previous build is still valid.
 *
 * Always runs (even after cleaning, where it finds no manifest) because its stat sweep doubles as the input snapshot recorded after the build.
 *
 * @param sources The source files to stat and compare.
 * @param transformers The transformer identities folded into the environment fingerprint.
 * @param modId The mod whose dependencies are fingerprinted.
 *
 * @returns The freshness verdict with the environment fingerprint, source stats, dependency fingerprints, and prior manifest.
 */
export async function checkBuildFreshness(
	sources: CanonicalPath[],
	transformers: TransformerIdentity[],
	modId: ModID,
): Promise<FreshnessStageResult> {
	const cache = new Cache();

	let manifest;

	try {
		manifest = readManifest(cache);
	} finally {
		await cache.close();
	}

	const environment = environmentFingerprint(transformers, {
		paths: config.paths,
		mods: config["mods"] ?? null,
		autodoc: getPluginConfig(config, "autodoc"),
	});

	const sourceStats = await statFiles(sources);
	const dependencyFingerprints = new Map<ModID, string>();

	for (const dependencyId of modResolver.dependenciesOf(modId)) {
		const dependencyFiles = await modResolver.getFiles(dependencyId);

		dependencyFingerprints.set(
			dependencyId,
			aggregateFingerprint(await statFiles(dependencyFiles)),
		);
	}

	const outputPaths = manifest
		? Object.values(manifest.sources).flatMap((entry) =>
				entry.output ? [entry.output.path] : [],
			)
		: [];

	const outputStats = await statFiles(outputPaths);

	const result = checkFreshness({
		manifest,
		environment,
		sources: sourceStats,
		dependencies: dependencyFingerprints,
		outputs: outputStats,
	});

	logger.debug(
		`Freshness: ${result.upToDate ? "up to date" : `stale (${result.reason})`}`,
	);

	return {
		...result,
		environment,
		sourceStats,
		dependencyFingerprints,
		manifest,
	};
}

/**
 * Computes which sources re-run the pipeline.
 *
 * @param freshness The freshness verdict carrying the prior manifest and source stats.
 * @param fileContexts The loaded file contexts used to build owner resolution and scan reads.
 * @param transformers The transformers used to scan reads for each object.
 *
 * @returns The dirty and removed sources, stale outputs, and owner resolver.
 */
export async function computeDirtyStage(
	freshness: FreshnessStageResult,
	fileContexts: FileContext[],
	transformers: Transformer[],
): Promise<DirtyStageResult> {
	const resolveOwners = buildQueryResolver(fileContexts);
	const manifest = freshness.manifest;
	const allSources = new Set(freshness.sourceStats.keys());

	if (!manifest || manifest.environment !== freshness.environment) {
		logger.debug(
			`Dirty: all ${allSources.size} ${pluralize(allSources.size, "source")} (${!manifest ? "no manifest" : "environment changed"})`,
		);

		return {
			dirty: allSources,
			removed: new Set(),
			staleOutputs: [],
			resolveOwners,
		};
	}

	const objectsByFile = new Map(
		fileContexts.map(({ sourcePath, objects, modId }) => [
			sourcePath,
			{ objects, modId },
		]),
	);

	function scanReads(file: CanonicalPath): ReadQuery[] {
		const context = objectsByFile.get(file);

		if (!context) return [];

		const queries = new Set<ReadQuery>();

		for (const object of context.objects) {
			const result = scanObject(object, transformers, {
				sourcePath: file,
				modId: context.modId,
			});

			for (const dependency of result.dependencies)
				queries.add(queryFromKey(dependency));
		}

		return [...queries];
	}

	const outputPaths = Object.values(manifest.sources).flatMap((entry) =>
		entry.output ? [entry.output.path] : [],
	);

	const outputStats = await statFiles(outputPaths);

	const result = computeDirtySources({
		manifest,
		currentSources: freshness.sourceStats,
		outputStats,
		resolveOwners,
		scanReads,
	});

	const staleOutputs = [...result.removed].flatMap((file) => {
		const output = manifest.sources[file]?.output;

		return output ? [output.path] : [];
	});

	for (const [file, reason] of result.reasons)
		logger.debug(`Dirty: ${file} (${reason})`);

	return {
		dirty: result.dirty,
		removed: result.removed,
		staleOutputs,
		resolveOwners,
	};
}

/**
 * Persists the build manifest.
 *
 * @param inputs The freshness verdict, dirty set, reads, dependencies, contexts, and written outputs needed to assemble the manifest.
 *
 * @throws When a clean source has no previous manifest entry to carry forward.
 */
export async function recordBuildManifest(
	inputs: ManifestRecordInputs,
): Promise<void> {
	const {
		freshness,
		dirty,
		resolveOwners,
		readsByFile,
		objectDependencies,
		objectContexts,
		written,
	} = inputs;

	const scanQueriesByFile = new Map<CanonicalPath, Set<ReadQuery>>();

	for (const [key, dependencies] of objectDependencies) {
		const sourcePath = objectContexts.get(key)?.sourcePath;

		if (!sourcePath) continue;

		let queries = scanQueriesByFile.get(sourcePath);

		if (!queries) {
			queries = new Set();

			scanQueriesByFile.set(sourcePath, queries);
		}

		for (const dependency of dependencies)
			queries.add(queryFromKey(dependency));
	}

	const writtenBySource = new Map(
		written.map((entry) => [entry.sourcePath, entry.outputPath]),
	);

	const outputStats = await statFiles([...writtenBySource.values()]);
	const previousSources = freshness.manifest?.sources ?? {};
	const sources: BuildManifest["sources"] = {};

	for (const [filePath, sourceMetadata] of freshness.sourceStats) {
		if (!dirty.has(filePath)) {
			const previous = previousSources[filePath];

			if (!previous)
				throw new Error(
					`recordBuildManifest(): clean source \`${filePath}\` has no previous manifest entry`,
				);

			sources[filePath] = previous;

			continue;
		}

		const runtimeLog = readsByFile.get(filePath);

		const queries = new Set<ReadQuery>([
			...(scanQueriesByFile.get(filePath) ?? []),
			...(runtimeLog?.queries ?? []),
		]);

		const outputPath = writtenBySource.get(filePath);

		const outputMetadata = outputPath
			? outputStats.get(outputPath)
			: undefined;

		sources[filePath] = {
			source: sourceMetadata,
			reads: [...queries]
				.sort()
				.map((query) => ({ query, owners: resolveOwners(query) })),
			readsGlobally: runtimeLog?.global ?? false,
			output:
				outputPath && outputMetadata
					? { path: outputPath, metadata: outputMetadata }
					: null,
		};
	}

	const manifest: BuildManifest = {
		version: MANIFEST_VERSION,
		environment: freshness.environment,
		dependencies: fromEntries(
			freshness.dependencyFingerprints,
		) as BuildManifest["dependencies"],
		sources,
	};

	const cache = new Cache();

	try {
		writeManifest(cache, manifest);
	} finally {
		await cache.close();
	}

	logger.debug(
		`Manifest recorded: ${dirty.size} fresh, ${freshness.sourceStats.size - dirty.size} carried forward`,
	);
}
