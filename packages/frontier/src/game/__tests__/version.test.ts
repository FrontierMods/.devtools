/**
 * @file Runtime behavior of the version labeller.
 */

import { test, expect } from "bun:test";
import { parseSHA } from "../sha.ts";
import { versionLabel } from "../version.ts";

/**
 * A SHA present in the stable-releases table, expected to label as `0.I`.
 */
const STABLE = parseSHA("27939e29b8b4ddc081490d9f51de59a459c88df6"); // 0.I

/**
 * A SHA absent from the table, expected to fall back to an experimental label.
 */
const UNKNOWN = parseSHA("0123456789abcdef0123456789abcdef01234567");

test("versionLabel returns the release name for a known stable sha", () => {
	expect(versionLabel(STABLE)).toBe("0.I");
});

test("versionLabel falls back to an experimental label with a 7-char sha", () => {
	expect(versionLabel(UNKNOWN)).toBe("experimental · 0123456");
});
