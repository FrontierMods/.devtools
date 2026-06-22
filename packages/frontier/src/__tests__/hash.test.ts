/**
 * @file Tests for string hashing used by build manifests.
 */

import { describe, expect, test } from "bun:test";
import { hashString } from "../hash.ts";

describe("hashString", () => {
	test("is deterministic for equal input", () => {
		expect(hashString("alpha")).toBe(hashString("alpha"));
	});

	test("differs for different input", () => {
		expect(hashString("alpha")).not.toBe(hashString("beta"));
	});

	test("returns a non-empty hex string", () => {
		expect(hashString("alpha")).toMatch(/^[0-9a-f]+$/);
	});
});
