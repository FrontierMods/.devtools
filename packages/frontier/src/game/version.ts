/**
 * @file Maps a commit SHA to a human-readable release label.
 */

import { STABLE_RELEASES } from "./stable.ts";

/**
 * Builds a display label for a commit's version.
 * If commit matches a known stable version, display that version instead.
 *
 * @param sha Commit hash to label.
 *
 * @returns The stable tag name when known, otherwise an `experimental · <short sha>` label.
 */
export function versionLabel(sha: string): string {
	return STABLE_RELEASES[sha] ?? `experimental · ${sha.slice(0, 7)}`;
}
