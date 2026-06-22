/**
 * @file Unit tests for app-data directory resolution.
 */

import { test, expect } from "bun:test";
import path from "path";
import { appPaths } from "../locations.ts";

test("appPaths returns absolute config, cache, and data directories", () => {
	const paths = appPaths();

	expect(path.isAbsolute(paths.config)).toBe(true);
	expect(path.isAbsolute(paths.cache)).toBe(true);
	expect(path.isAbsolute(paths.data)).toBe(true);
});

test("appPaths namespaces directories under `.frontier`", () => {
	expect(appPaths().config).toContain(".frontier");
});
