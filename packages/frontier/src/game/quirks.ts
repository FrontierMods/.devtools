/**
 * @file Base game behaviors that are invalid in mods but must be tolerated to process base game data.
 */

import { BASE_GAME_MOD_ID } from "../constants.ts";
import { normalizePath } from "../file/paths.ts";
import type { ModID } from "../mod/types.ts";
import type { Path } from "../types/data.ts";

/**
 * Checks if a mod is the base game.
 *
 * @param modId Mod identifier to check.
 *
 * @returns Whether {@link modId} matches that of the base game.
 */
export function isBaseGame(modId: ModID): boolean {
	return modId === BASE_GAME_MOD_ID;
}

/**
 * Calculates path depth.
 *
 * @param path File path to analyze.
 *
 * @returns Number of directory levels in the path.
 *
 * @example
 * ```typescript
 * pathDepth("/data/json/items.json") // → 4
 * pathDepth("/data/json/items/groups/weapons.json") // → 6
 * ```
 */
export function pathDepth(path: Path): number {
	return normalizePath(path).split("/").length;
}

/**
 * Determines which source path should win in a duplicate conflict.
 * Deepest path wins.
 *
 * @param existingPath Path of the currently registered object.
 * @param newPath Path of the new duplicate object.
 *
 * @returns Whether {@link newPath} should replace {@link existingPath}.
 *
 * @example
 * ```typescript
 * shouldReplaceForBaseGame(
 *   "/data/json/items.json",
 *   "/data/json/items/groups/weapons.json"
 * ) // → true
 *
 * shouldReplaceForBaseGame(
 *   "/data/json/items/groups/weapons.json",
 *   "/data/json/items.json"
 * ) // → false
 * ```
 */
export function isPathDeeper(existingPath: Path, newPath: Path): boolean {
	return pathDepth(newPath) > pathDepth(existingPath);
}
