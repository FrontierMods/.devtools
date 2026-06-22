/**
 * @file Tests for the workspace lazy-source hook: a find() miss consults registered sources once; entries() hydrates everything first.
 */

import { describe, expect, test } from "bun:test";
import type { CanonicalPath, ModID } from "@frmds/frontier";
import { ModWorkspace, type LazyObjectSource } from "@frmds/frontier";

/**
 * A lazy source that records its hydration calls so tests can assert on them.
 */
interface TestSource extends LazyObjectSource {
	/** IDs passed to `hydrate`, in call order. */
	hydrateCalls: string[];
	/** Number of times `hydrateAll` was invoked. */
	hydrateAllCalls: number;
}

/**
 * The mod ID every fixture object belongs to.
 */
const DDA = "dda" as ModID;

/**
 * The file path fixture objects are loaded into.
 */
const FILE = "/game/data/json/items.json" as CanonicalPath;

/**
 * Builds a recording lazy source backed by the given fixture objects.
 */
function makeSource(
	workspace: ModWorkspace,
	objects: Array<{ id: string; type: string }>,
): TestSource {
	const source: TestSource = {
		hydrateCalls: [],
		hydrateAllCalls: 0,
		hydrate(id) {
			source.hydrateCalls.push(id);

			const matching = objects.filter((object) => object.id === id);

			for (const object of matching)
				workspace.load(object as never, DDA, FILE);

			return matching.length > 0;
		},
		hydrateAll() {
			source.hydrateAllCalls++;

			for (const object of objects)
				workspace.load(object as never, DDA, FILE);

			return objects.length > 0;
		},
	};

	return source;
}

describe("ModWorkspace lazy sources", () => {
	test("find() miss hydrates and retries", () => {
		const workspace = new ModWorkspace();

		const source = makeSource(workspace, [
			{ id: "steel", type: "material" },
		]);

		workspace.registerLazySource(DDA, source);

		const located = workspace.find("steel", "material", [DDA]);

		expect(located).toBeDefined();
		expect(source.hydrateCalls).toEqual(["steel"]);
	});

	test("loaded objects resolve without hydration", () => {
		const workspace = new ModWorkspace();
		const source = makeSource(workspace, []);

		workspace.load({ id: "steel", type: "material" } as never, DDA, FILE);
		workspace.registerLazySource(DDA, source);

		expect(workspace.find("steel", "material", [DDA])).toBeDefined();
		expect(source.hydrateCalls).toEqual([]);
	});

	test("a genuine miss stays a miss", () => {
		const workspace = new ModWorkspace();

		workspace.registerLazySource(DDA, makeSource(workspace, []));

		expect(
			workspace.find("unobtainium", "material", [DDA]),
		).toBeUndefined();
	});

	test("scope excludes unrelated lazy sources", () => {
		const workspace = new ModWorkspace();

		const source = makeSource(workspace, [
			{ id: "steel", type: "material" },
		]);

		workspace.registerLazySource(DDA, source);
		workspace.find("steel", "material", ["other_mod" as ModID]);

		expect(source.hydrateCalls).toEqual([]);
	});

	test("entries() hydrates all sources first", () => {
		const workspace = new ModWorkspace();

		const source = makeSource(workspace, [
			{ id: "steel", type: "material" },
		]);

		workspace.registerLazySource(DDA, source);

		const keys = [...workspace.entries()].map(([key]) => key);

		expect(source.hydrateAllCalls).toBe(1);
		expect(keys).toHaveLength(1);
	});
});
