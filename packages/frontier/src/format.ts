/**
 * @file String formatting helpers for human-readable output.
 */

/**
 * Picks the singular or plural form of a word based on a count. Singular applies to `1` and `-1`, plural to everything else.
 *
 * @param count The quantity the word describes.
 * @param word The singular form.
 * @param plural The plural form, defaulting to `word` plus an `s` suffix.
 *
 * @returns The form matching `count`.
 */
export function pluralize(
	count: number,
	word: string,
	plural = word + "s",
): string {
	return [1, -1].includes(count) ? word : plural;
}
