/**
 * @file Tests for glob-based file discovery.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "fs-extra";
import os from "os";
import path from "path";
import type { CanonicalPath } from "../../types/data.ts";
import { discoverFiles } from "../discovery.ts";

let root: CanonicalPath;

beforeAll(async () => {
	root = (await fs.mkdtemp(
		path.join(os.tmpdir(), "discovery-test-"),
	)) as CanonicalPath;

	// Several directories so the glob has multiple concurrent walks to interleave
	for (const directory of ["rigs", "pouches", "ammo"]) {
		await fs.mkdirp(path.join(root, directory));

		for (const file of ["b.json5", "a.json5", "c.json5"])
			await fs.writeFile(path.join(root, directory, file), "[]");
	}
});

afterAll(async () => {
	await fs.remove(root);
});

describe("discoverFiles", () => {
	test("returns deterministically sorted paths", async () => {
		const first = await discoverFiles(root, { patterns: ["**/*.json5"] });
		const second = await discoverFiles(root, { patterns: ["**/*.json5"] });

		expect(first).toEqual([...first].sort());
		expect(second).toEqual(first);
		expect(first).toHaveLength(9);
	});
});
