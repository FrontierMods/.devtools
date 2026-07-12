/**
 * @file Lookup: locates the base game's content root and source files for one install, mirroring the mod resolver's derivation so the shared cache and fingerprint agree.
 */

import path from "path";
import { glob } from "tinyglobby";
import { ConfigError } from "../config/error.ts";
import { BASE_GAME_MOD_ID } from "../constants.ts";
import { findFilesRecursiveSync } from "../file/discovery.ts";
import { toCanonicalPath } from "../file/paths.ts";
import { createModEntry, parseModInfo } from "../mod/parse.ts";
import type { CanonicalPath } from "../types/data.ts";

/**
 * Resolves the base game's content root from its declared mod info.
 *
 * Scans the install's default mod directory for the mod carrying {@link BASE_GAME_MOD_ID}, the same discovery the `ModResolver` performs, so the content root follows the mod's own declared `path`.
 *
 * @param install The canonical game install directory.
 *
 * @returns The base game's content root.
 *
 * @throws {@link ConfigError} When the install declares no base-game mod.
 */
export function resolveGameContent(install: CanonicalPath): CanonicalPath {
	const defaultMods = path.join(install, "data/mods");

	for (const modinfoPath of findFilesRecursiveSync(
		defaultMods,
		"modinfo.json",
	)) {
		const modInfo = parseModInfo(modinfoPath);

		if (modInfo?.data.id !== BASE_GAME_MOD_ID) continue;

		return createModEntry(modInfo, "default").contentRoot;
	}

	throw new ConfigError(
		`Not a recognizable CDDA install: no \`${BASE_GAME_MOD_ID}\` mod under \`${defaultMods}\``,
	);
}

/**
 * Discovers the base game's source files.
 *
 * @param contentRoot The dda content root to glob under.
 *
 * @returns Canonical paths of every source file.
 */
export async function discoverGameFiles(
	contentRoot: CanonicalPath,
): Promise<CanonicalPath[]> {
	const paths = await glob(["**/*.json"], {
		cwd: contentRoot,
		absolute: true,
		followSymbolicLinks: true,
	});

	return paths.map((file) => toCanonicalPath(file));
}
