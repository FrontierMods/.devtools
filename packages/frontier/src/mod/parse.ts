/**
 * @file Parsing of `modinfo.json` into index entries, plus mod file-filter and missing-dependency helpers.
 */

import { JSON5 } from "bun";
import fs from "fs-extra";
import path from "path";
import { getTransitiveClosure } from "../dependency/graph.ts";
import { extractErrorMessage } from "../error.ts";
import { toCanonicalPath } from "../file/paths.ts";
import { pluralize } from "../format.ts";
import { logger } from "../logger.ts";
import type { GameObject } from "../object/types.ts";
import type { JSONValue } from "../types/data.ts";
import { isArray, isGameFile, isObject } from "../types/guards.ts";
import { ModResolverError } from "./error.ts";
import type {
	ModFileFilter,
	ModID,
	ModIndexEntry,
	ModInfo,
	ModSource,
	ParsedModInfo,
} from "./types.ts";

/**
 * The mod-parsing logger.
 */
const LOGGER = logger.getChild(["mod", "parse"]);

/**
 * Narrows a game object to a `MOD_INFO` record carrying the required `id` and `name`.
 *
 * @param object Game object to test.
 *
 * @returns True if the object is a `MOD_INFO` record with `id` and `name`.
 */
function isModInfoObject(object: GameObject): object is ModInfo {
	return object.type === "MOD_INFO" && "id" in object && "name" in object;
}

/**
 * Parses a modinfo.json file into structured data.
 *
 * @param modinfoPath Path to modinfo.json file.
 *
 * @returns Parsed mod info or null if invalid/unreadable
 */
export function parseModInfo(modinfoPath: string): ParsedModInfo | null {
	try {
		const canonical = toCanonicalPath(modinfoPath);
		const content = fs.readFileSync(canonical, "utf8");
		const parsed = JSON5.parse(content);

		if (!isGameFile(parsed)) {
			LOGGER.warn(
				`Invalid \`modinfo.json\` at \`${modinfoPath}\`: not array of game objects`,
			);

			return null;
		}

		const modInfo = parsed.find(isModInfoObject);

		if (!modInfo)
			throw new Error(
				`No valid \`MOD_INFO\` object in \`${modinfoPath}\``,
			);

		return {
			path: canonical,
			directory: toCanonicalPath(path.dirname(canonical)),
			data: modInfo,
		};
	} catch (error) {
		LOGGER.warn(
			`Failed to parse \`modinfo.json\` at \`${modinfoPath}\`: ${extractErrorMessage(error)}`,
		);

		return null;
	}
}

/**
 * Creates a ModIndexEntry from parsed mod info.
 *
 * @param modInfo Parsed modinfo data.
 * @param source Where the mod was discovered.
 *
 * @returns Mod index entry
 *
 * @throws ModResolverError if content root doesn't exist (for non-CWD mods)
 */
export function createModEntry(
	modInfo: ParsedModInfo,
	source: ModSource,
): ModIndexEntry {
	const { directory: modDir, path: modinfoPath, data } = modInfo;

	const contentRoot = data.path
		? toCanonicalPath(path.join(modDir, data.path))
		: modDir;

	const CWDPath = toCanonicalPath(process.cwd());
	const isCWDMod = modDir === CWDPath;

	// * skip content root validation for CWD mod (output may not exist yet)
	if (source !== "cwd" && !isCWDMod && !fs.pathExistsSync(contentRoot))
		throw new ModResolverError(
			`Content root does not exist: ${contentRoot}\n` +
				`  Mod: ${data.id}\n` +
				`  Path: ${data.path}`,
		);

	return {
		id: data.id,
		name: data.name,
		path: modDir,
		modinfoPath,
		contentRoot,
		dependencies: data.dependencies ?? [],
		source,
	};
}

/**
 * Extracts mod file filters from config.
 *
 * @param modsConfig The `mods` section of config.
 *
 * @returns Map of mod ID to file filter
 */
export function parseModFilters(
	modsConfig: JSONValue,
): Map<ModID, ModFileFilter> {
	const filters = new Map<ModID, ModFileFilter>();

	if (!isObject(modsConfig)) return filters;

	try {
		for (const [modId, filter] of Object.entries(modsConfig)) {
			if (
				filter &&
				isObject(filter) &&
				"ignorePaths" in filter &&
				filter.ignorePaths &&
				isArray(filter.ignorePaths)
			) {
				filters.set(modId, {
					ignorePaths: filter.ignorePaths.filter(
						(ignorePath) => typeof ignorePath === "string",
					),
				});
			}
		}

		if (filters.size)
			LOGGER.debug(
				`Loaded file filters for ${filters.size} ${pluralize(filters.size, "mod")}`,
			);
	} catch (error) {
		LOGGER.error(
			`Failed to load mod filters: ${extractErrorMessage(error)}`,
		);
	}

	return filters;
}

/**
 * Finds missing dependencies from a mod's transitive closure.
 *
 * @param rootModId Starting mod ID.
 * @param index Map of known mods.
 *
 * @returns Array of missing mod IDs (empty if all resolved)
 */
export function findMissingDependencies(
	rootModId: ModID,
	index: ReadonlyMap<ModID, ModIndexEntry>,
): ModID[] {
	const rootMod = index.get(rootModId);

	if (!rootMod) return [rootModId];

	const closure = getTransitiveClosure(
		rootMod.dependencies,
		(id) => index.get(id)?.dependencies,
	);

	// * add direct dependencies to closure for checking
	for (const dependency of rootMod.dependencies) closure.add(dependency);

	return [...closure].filter((id) => !index.has(id));
}
