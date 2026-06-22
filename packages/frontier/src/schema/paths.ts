/**
 * @file Path conventions for generated schema artifacts: the global commit-keyed store and the per-mod materialized surface.
 */

import fs from "fs-extra";
import path from "path";
import { FRONTIER_CACHE_DIR } from "../constants.ts";
import { appPaths } from "../locations.ts";

/**
 * The per-mod materialized artifact locations under `<modRoot>/.frontier/`.
 */
export interface ModSchemaPaths {
	/** The composed JSON Schema the editor and validators consume. */
	schema: string;
	/** The generated TypeScript surface (types ship with schemata, never separately). */
	types: string;
	/** The sync pin recording which commit the artifacts derive from. */
	pin: string;
}

/**
 * The sync record: which commit the mod's materialized artifacts derive from, and by whom.
 */
export interface SchemaPin {
	/** The commit the materialized artifacts derive from. */
	commit: string;
	/** The toolkit version that produced the artifacts. */
	toolkitVersion: string;
	/** The timestamp of when the sync occurred. */
	syncedAt: string;
}

/**
 * Resolves the store entry directory holding one commit's derived artifacts. Mirrors the layout `loadOrBuildDomain` persists (`<cacheRoot>/<commit>/derived/`).
 *
 * @param commit Commit whose derived artifacts the directory holds.
 * @param cacheRoot Root cache directory the entry lives under.
 *
 * @returns Path to the commit's derived-artifact directory
 */
export function storeEntryDir(
	commit: string,
	cacheRoot: string = appPaths().cache,
): string {
	return path.join(cacheRoot, commit, "derived");
}

/**
 * Resolves the per-mod artifact paths. Creates nothing.
 *
 * @param modRoot Root directory of the mod.
 *
 * @returns The mod's materialized artifact paths under `.frontier/`
 */
export function modSchemaPaths(modRoot: string): ModSchemaPaths {
	const base = path.join(modRoot, FRONTIER_CACHE_DIR);

	return {
		schema: path.join(base, "schema.json"),
		types: path.join(base, "game.ts"),
		pin: path.join(base, "schema.lock.json"),
	};
}

/**
 * Reads the mod's sync pin, returning `null` when the mod has never been synced (the expected miss path).
 *
 * @param modRoot Root directory of the mod.
 *
 * @returns The parsed sync pin, or `null` when the mod has never been synced
 *
 * @throws When the pin file exists but holds malformed JSON.
 */
export function readSchemaPin(modRoot: string): SchemaPin | null {
	const { pin } = modSchemaPaths(modRoot);

	if (!fs.pathExistsSync(pin)) return null;

	return JSON.parse(fs.readFileSync(pin, "utf8")) as SchemaPin;
}

/**
 * Writes the mod's sync pin, creating `.frontier/` when absent.
 *
 * @param modRoot Root directory of the mod.
 * @param pin Sync pin to serialize and persist.
 */
export function writeSchemaPin(modRoot: string, pin: SchemaPin): void {
	const paths = modSchemaPaths(modRoot);

	fs.ensureDirSync(path.dirname(paths.pin));
	fs.writeFileSync(paths.pin, JSON.stringify(pin, null, "\t"));
}
