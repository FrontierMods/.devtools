/**
 * @file Runtime behavior of formatter location.
 */

import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { FORMATTER_NAME, locateFormatter } from "../locate.ts";

/**
 * A fresh empty temp directory, holding no formatter binary.
 */
function emptyDir(): string {
	return mkdtempSync(path.join(tmpdir(), "format-locate-"));
}

test("locateFormatter returns the binary path when present", () => {
	const dir = emptyDir();
	const binary = path.join(dir, FORMATTER_NAME);

	writeFileSync(binary, "");

	expect(locateFormatter(dir)).toBe(binary);
});

test("locateFormatter throws when the binary is absent", () => {
	expect(() => locateFormatter(emptyDir())).toThrow(/json_formatter/);
});
