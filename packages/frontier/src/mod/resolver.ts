/**
 * @file The `ModResolver`: discovers and indexes mods, resolves dependency scopes, and lists a mod's files.
 */

import fs from "fs-extra";
import path from "path";
import { glob } from "tinyglobby";
import type { ResolvedConfig } from "../config/types.ts";
import {
	getTransitiveClosure,
	sortByDependencies,
} from "../dependency/graph.ts";
import { extractErrorMessage } from "../error.ts";
import { filterByGlobs, findFilesRecursiveSync } from "../file/discovery.ts";
import { findDeepestPrefix, toCanonicalPath } from "../file/paths.ts";
import { pluralize } from "../format.ts";
import { logger } from "../logger.ts";
import type { AbsolutePath, CanonicalPath, JSONValue } from "../types/data.ts";
import { ModResolverError } from "./error.ts";
import {
	createModEntry,
	findMissingDependencies,
	parseModFilters,
	parseModInfo,
} from "./parse.ts";
import type { ModID, ModIndexEntry, ModScope, ModSource } from "./types.ts";

/**
 * The mod-resolver logger.
 */
const LOGGER = logger.getChild(["mod", "resolver"]);

/**
 * Discovers and indexes mods in workspace and game installation.
 *
 * All mod discovery happens synchronously in the constructor.
 * Throws immediately if CWD mod is missing or has unresolvable dependencies.
 *
 * @example
 * ```typescript
 * const resolver = new ModResolver(config);
 *
 * // CWD mod is immediately available
 * console.log(resolver.currentMod.id);
 *
 * // Get dependency scope
 * const scope = resolver.scopeFor(resolver.currentMod.id);
 *
 * // Get mod files (async)
 * const files = await resolver.getFiles(resolver.currentMod.id);
 * ```
 */
export class ModResolver {
	/** The mod in the current working directory. Always available after construction. */
	readonly currentMod: ModIndexEntry;

	private readonly index = new Map<ModID, ModIndexEntry>();
	private readonly pathToModId = new Map<CanonicalPath, ModID>();
	private readonly contentRoots = new Set<CanonicalPath>();
	private readonly modFilters: ReturnType<typeof parseModFilters>;
	private readonly config: ResolvedConfig;

	/**
	 * Creates a new ModResolver.
	 *
	 * @param config Resolved configuration with paths.
	 *
	 * @throws ModResolverError if no modinfo.json in CWD
	 * @throws ModResolverError if CWD mod has missing dependencies
	 */
	constructor(config: ResolvedConfig) {
		this.config = config;

		this.modFilters = config.mods
			? parseModFilters(config.mods as JSONValue)
			: new Map();

		this.currentMod = this.discoverCurrentMod();

		this.register(this.currentMod);

		if (this.currentMod.dependencies.length && config.paths.game)
			this.discoverGameMods(config.paths.game);

		this.validateDependencies(this.currentMod.id);

		LOGGER.debug(
			`ModResolver initialized: ${this.index.size} ${pluralize(this.index.size, "mod")} indexed`,
		);
	}

	/**
	 * Finds a mod by its ID.
	 *
	 * @param id Mod ID.
	 *
	 * @returns Mod entry or undefined if not found
	 */
	findById(id: ModID): ModIndexEntry | undefined {
		return this.index.get(id);
	}

	/**
	 * Gets the dependency scope for a mod.
	 *
	 * Returns an array of mod IDs in load order: the mod itself first, followed by its transitive dependencies.
	 *
	 * @param modId Mod ID.
	 *
	 * @returns Array of mod IDs: [modId, ...dependencies]
	 *
	 * @throws ModResolverError if the mod is not found.
	 *
	 * @example
	 * ```typescript
	 * const scope = resolver.scopeFor("my_mod");
	 * // → ["my_mod", "some_dep", "dda"]
	 *
	 * // Get just dependencies:
	 * const deps = resolver.scopeFor("my_mod").slice(1);
	 * // → ["some_dep", "dda"]
	 * ```
	 */
	scopeFor(modId: ModID): ModScope {
		const dependencies = this.dependenciesOf(modId);

		return [modId, ...dependencies];
	}

	/**
	 * Gets transitive dependencies of a mod in load order.
	 *
	 * Equivalent to `scopeFor(modId).slice(1)`.
	 *
	 * @param modId Mod ID.
	 *
	 * @returns Array of dependency mod IDs
	 *
	 * @throws ModResolverError if the mod is not found.
	 * @throws DependencySortError if a circular dependency is detected.
	 */
	dependenciesOf(modId: ModID): ModID[] {
		const mod = this.index.get(modId);

		if (!mod) throw new ModResolverError(`Mod not found: \`${modId}\``);

		const closure = getTransitiveClosure(
			[modId],
			(id) => this.index.get(id)?.dependencies,
		);

		const modsInClosure = Array.from(closure)
			.map((id) => this.index.get(id))
			.filter((entry): entry is ModIndexEntry => !!entry);

		const sorted = sortByDependencies(
			modsInClosure,
			(entry) => entry.id,
			(entry) => entry.dependencies,
		);

		return sorted.map((entry) => entry.id);
	}

	/**
	 * Gets all JSON files belonging to a mod.
	 *
	 * Files are filtered by domain boundaries (excludes nested mods) and ignore patterns from config.
	 *
	 * This is the only async method: it globs the mod's content directory.
	 *
	 * @param modId Mod ID.
	 *
	 * @returns Array of canonical file paths
	 *
	 * @throws ModResolverError if the mod is not found.
	 */
	async getFiles(modId: ModID): Promise<CanonicalPath[]> {
		const mod = this.index.get(modId);

		if (!mod) throw new ModResolverError(`Mod not found: \`${modId}\``);

		const paths: AbsolutePath[] = await glob(["**/*.json"], {
			cwd: mod.contentRoot,
			absolute: true,
			followSymbolicLinks: true,
		});

		const canonical = paths.map((path) => toCanonicalPath(path));

		// * filter by domain boundaries
		// * this will exclude nested mods
		// * only the current mod will be processed
		let domain = canonical.filter(
			(file) =>
				findDeepestPrefix(file, this.contentRoots) === mod.contentRoot,
		);

		// * apply ignore patterns for dependency mods
		if (mod.source !== "cwd") {
			const filter = this.modFilters.get(modId);

			if (filter?.ignorePaths?.length) {
				const before = domain.length;

				domain = filterByGlobs(
					domain,
					filter.ignorePaths,
					mod.contentRoot,
				);

				const excluded = before - domain.length;

				if (excluded)
					LOGGER.debug(
						`Applied ignore patterns for \`${modId}\`: excluded ${excluded} ${pluralize(excluded, "file")}`,
					);
			}
		}

		return domain;
	}

	/**
	 * Discovers and parses the mod in the current working directory.
	 *
	 * @returns The indexed entry for the CWD mod.
	 *
	 * @throws ModResolverError if no `modinfo.json` exists in the CWD or it is invalid.
	 */
	private discoverCurrentMod(): ModIndexEntry {
		const modinfoPath = path.join(this.config.paths.cwd, "modinfo.json");

		if (!fs.pathExistsSync(modinfoPath))
			throw new ModResolverError(
				"No `modinfo.json` found in current directory.\n\n" +
					"Frontier must be run from a mod directory containing `modinfo.json`.",
			);

		const modInfo = parseModInfo(modinfoPath);

		if (!modInfo)
			throw new ModResolverError(
				"Invalid `modinfo.json`: Expected JSON array with one `MOD_INFO` object.",
			);

		return createModEntry(modInfo, "cwd");
	}

	/**
	 * Scans the game installation's user and default mod directories.
	 *
	 * @param gamePath Canonical path to the game installation.
	 */
	private discoverGameMods(gamePath: CanonicalPath): void {
		const userMods = path.join(gamePath, "mods");
		const defaultMods = path.join(gamePath, "data/mods");

		this.scanMods(userMods, "user");
		this.scanMods(defaultMods, "default");
	}

	/**
	 * Scans a directory for `modinfo.json` files and registers each valid mod.
	 *
	 * @param directory Canonical path to the directory to scan.
	 * @param source Where the discovered mods originate.
	 */
	private scanMods(directory: CanonicalPath, source: ModSource): void {
		if (!fs.pathExistsSync(directory))
			return LOGGER.debug(`Mod directory not found: ${directory}`);

		const modinfoFiles = findFilesRecursiveSync(directory, "modinfo.json");

		LOGGER.debug(
			`Found ${modinfoFiles.length} \`modinfo.json\` ${pluralize(modinfoFiles.length, "file")} in ${directory}`,
		);

		for (const modinfoPath of modinfoFiles) {
			const modInfo = parseModInfo(modinfoPath);

			if (!modInfo) {
				LOGGER.debug(
					`Skipping invalid \`modinfo.json\`: ${modinfoPath}`,
				);

				continue;
			}

			try {
				const mod = createModEntry(modInfo, source);

				this.register(mod);
			} catch (error) {
				LOGGER.warn(
					`Failed to register mod: ${extractErrorMessage(error)}`,
				);
			}
		}
	}

	/**
	 * Registers a mod in the index, guarding against path and ID conflicts.
	 *
	 * @param mod Mod entry to register.
	 *
	 * @throws ModResolverError if a different mod ID exists at the same path or the ID is already registered.
	 */
	private register(mod: ModIndexEntry): void {
		const existingId = this.pathToModId.get(mod.path);

		if (existingId) {
			if (existingId !== mod.id)
				throw new ModResolverError(
					`Conflicting mod IDs at same path: ${mod.path}\n` +
						`  First: \`${existingId}\`\n` +
						`  Second: \`${mod.id}\``,
				);

			// * same path + same ID = symlink → skip
			LOGGER.debug(`Skipping symlinked mod: \`${mod.id}\``);

			return;
		}

		const existing = this.index.get(mod.id);

		if (existing)
			throw new ModResolverError(
				`Duplicate mod ID: \`${mod.id}\`\n` +
					`  First: ${existing.path}\n` +
					`  Second: ${mod.path}`,
			);

		this.index.set(mod.id, mod);
		this.pathToModId.set(mod.path, mod.id);
		this.contentRoots.add(mod.contentRoot);

		LOGGER.debug(`Registered mod: \`${mod.id}\` at \`${mod.path}\``);
	}

	/**
	 * Verifies that every transitive dependency of a mod is present in the index.
	 *
	 * @param rootModId Mod whose dependency closure is validated.
	 *
	 * @throws ModResolverError if any dependency is missing.
	 */
	private validateDependencies(rootModId: ModID): void {
		const missing = findMissingDependencies(rootModId, this.index);

		if (missing.length) {
			const gamePath = this.config.paths.game;

			throw new ModResolverError(
				`Missing dependencies:\n` +
					missing.map((id) => `  - ${id}`).join("\n") +
					`\n\nRequired by: ${rootModId}\n\n` +
					`Ensure dependencies are in:\n` +
					`  - ${gamePath}/mods/\n` +
					`  - ${gamePath}/data/mods/`,
			);
		}
	}
}
