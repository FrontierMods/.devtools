/**
 * @file Type guards for validating loaded mod config shapes.
 */

import { isObject } from "../types/guards.ts";
import type { ModConfig } from "./types.ts";

/**
 * Narrows a partial mod config to a full `ModConfig`. A `game` block, when present, must carry a string `path`.
 *
 * @param data Partial mod config to validate.
 *
 * @returns `true` when the config satisfies the `ModConfig` contract.
 */
export function isValidModConfig(data: Partial<ModConfig>): data is ModConfig {
	if (!("game" in data)) return true;

	return (
		isObject(data.game) &&
		"path" in data.game &&
		typeof data.game.path === "string"
	);
}
