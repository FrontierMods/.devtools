/**
 * @file Tests for the dda lazy source: hydration by ID loads only the owning file, exactly once; hydrateAll loads everything.
 */

import { describe, expect, test } from "bun:test";
import { Cache, ModWorkspace } from "@frmds/frontier";
import type { CanonicalPath, ModID } from "@frmds/frontier";
import {
	createLazyDependencySource,
	writeDependencyIndex,
} from "../lazy-source.ts";

/**
 * Base game mod ID under test.
 */
const DDA = "dda" as ModID;

/**
 * Path of a cached items file.
 */
const ITEMS = "/game/data/json/items.json" as CanonicalPath;

/**
 * Path of a cached tools file.
 */
const TOOLS = "/game/data/json/tools.json" as CanonicalPath;

/**
 * Builds an in-memory cache seeded with two indexed files.
 *
 * @returns A non-persistent cache ready for hydration tests.
 */
async function makeCache(): Promise<Cache> {
	const cache = new Cache({ persistent: false });
	const store = cache.objects("objects");

	await store.setObjects(ITEMS, [{ id: "steel", type: "material" }]);
	await store.setObjects(TOOLS, [{ id: "hammer", type: "TOOL" }]);

	writeDependencyIndex(
		cache,
		"fingerprint-a",
		new Map([
			["steel", [ITEMS]],
			["hammer", [TOOLS]],
		]) as never,
		[ITEMS, TOOLS],
	);

	return cache;
}

describe("createLazyDependencySource", () => {
	test("hydrates only the owning file", async () => {
		const workspace = new ModWorkspace();

		const source = createLazyDependencySource(
			await makeCache(),
			DDA,
			workspace,
		);

		expect(source.hydrate("steel")).toBe(true);
		expect(workspace.has("steel", "material", [DDA])).toBe(true);
		expect(workspace.has("hammer", "TOOL", [DDA])).toBe(false);
	});

	test("hydrating the same file twice is a no-op", async () => {
		const workspace = new ModWorkspace();

		const source = createLazyDependencySource(
			await makeCache(),
			DDA,
			workspace,
		);

		source.hydrate("steel");

		expect(source.hydrate("steel")).toBe(false);
	});

	test("unknown IDs hydrate nothing", async () => {
		const workspace = new ModWorkspace();

		const source = createLazyDependencySource(
			await makeCache(),
			DDA,
			workspace,
		);

		expect(source.hydrate("unobtainium")).toBe(false);
	});

	test("hydrateAll loads every indexed file", async () => {
		const workspace = new ModWorkspace();

		const source = createLazyDependencySource(
			await makeCache(),
			DDA,
			workspace,
		);

		expect(source.hydrateAll()).toBe(true);
		expect(workspace.has("steel", "material", [DDA])).toBe(true);
		expect(workspace.has("hammer", "TOOL", [DDA])).toBe(true);
	});
});
