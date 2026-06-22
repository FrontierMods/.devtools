/**
 * @file Maps a commit SHA to a human-readable release label.
 */

import type { SHA } from "./sha.ts";
import { STABLE_RELEASES } from "./stable.ts";

/**
 * Builds a display label for an install's version: the stable tag name when the SHA is a known stable release, otherwise `experimental · <short sha>`.
 *
 * @param sha Commit hash to label.
 *
 * @returns The stable tag name when known, otherwise an `experimental · <short sha>` label.
 */
export function versionLabel(sha: SHA): string {
	return STABLE_RELEASES[sha] ?? `experimental · ${sha.slice(0, 7)}`;
}
