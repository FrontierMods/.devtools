/**
 * @file Tests manifest fingerprints: environment fingerprints react to transformer and config changes.
 */

import { describe, expect, test } from "bun:test";
import { environmentFingerprint } from "../fingerprint.ts";

/**
 * Sample transformer identities for environment fingerprints.
 */
const TRANSFORMERS = [
	{ name: "math", version: "1.0.0" },
	{ name: "inherit", version: "2.1.0" },
];

/**
 * Sample config subset feeding the environment fingerprint.
 */
const CONFIG_SUBSET = { paths: { input: "/mod/src", output: "/mod/json" } };

describe("environmentFingerprint", () => {
	test("is independent of transformer order", () => {
		const reversed = [...TRANSFORMERS].reverse();

		expect(environmentFingerprint(TRANSFORMERS, CONFIG_SUBSET)).toBe(
			environmentFingerprint(reversed, CONFIG_SUBSET),
		);
	});

	test("changes when a transformer version changes", () => {
		const bumped = [{ name: "math", version: "1.0.1" }, TRANSFORMERS[1]!];

		expect(environmentFingerprint(TRANSFORMERS, CONFIG_SUBSET)).not.toBe(
			environmentFingerprint(bumped, CONFIG_SUBSET),
		);
	});

	test("changes when config changes", () => {
		const moved = { paths: { input: "/mod/source", output: "/mod/json" } };

		expect(environmentFingerprint(TRANSFORMERS, CONFIG_SUBSET)).not.toBe(
			environmentFingerprint(TRANSFORMERS, moved),
		);
	});
});
