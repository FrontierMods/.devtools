/**
 * @file Tests the deferral fixpoint.
 */

import { describe, expect, test } from "bun:test";
import {
	ModWorkspace,
	makeKeyFromObject,
	timelineCurrent,
	type CanonicalPath,
	type GameObject,
	type ModScope,
} from "@frmds/frontier";
import { Type } from "typebox";
import { createObjectsView } from "../../object/store-view.ts";
import { TransformerSkip } from "../../transformers/skip.ts";
import type { Transformer } from "../../types/types.ts";
import { executePhase } from "../execute.ts";
import { scanObject } from "../scan.ts";
import { sortPhase } from "../sort.ts";

/**
 * Source path stamped onto the loaded object and its context.
 */
const FILE = "/m/f.json5" as CanonicalPath;
/**
 * Single-mod lookup scope.
 */
const SCOPE = ["m"] as ModScope;

/**
 * Inserts a sibling key (named by `produce`) with a constant value, then drops itself.
 */
const PRODUCER: Transformer = {
	name: "producer",
	version: "1.0.0",
	api: "1.0.0",
	description: "produce a sibling key",
	target: {
		content: Type.Object(
			{ produce: Type.String() },
			{ additionalProperties: true },
		),
	},
	transform: (value) => [
		{
			op: "insert",
			path: ["..", (value as { produce: string }).produce],
			value: "VALUE",
		},
		{ op: "remove", path: [] },
	],
};

/**
 * Replaces itself with the value at sibling key `consume`; defers until that key exists.
 */
const CONSUMER: Transformer = {
	name: "consumer",
	version: "1.0.0",
	api: "1.0.0",
	description: "consume a sibling key",
	target: {
		content: Type.Object(
			{ consume: Type.String() },
			{ additionalProperties: true },
		),
	},
	transform: (value, context) => {
		const key = (value as { consume: string }).consume;
		const got = context.currentObject[key];

		if (got === undefined)
			throw new TransformerSkip(`waiting for \`${key}\``);

		return [{ op: "replace", path: [], value: got }];
	},
};

/**
 * Derives sibling key `[target]` from sibling key `[source]`, then drops itself; defers until the source exists. Chains cross-subtree dependencies.
 */
const DERIVER: Transformer = {
	name: "deriver",
	version: "1.0.0",
	api: "1.0.0",
	description: "derive one sibling key from another",
	target: {
		content: Type.Object(
			{ derive: Type.Array(Type.String()) },
			{ additionalProperties: true },
		),
	},
	transform: (value, context) => {
		const [target, source] = (value as { derive: [string, string] }).derive;
		const got = context.currentObject[source];

		if (got === undefined)
			throw new TransformerSkip(`waiting for \`${source}\``);

		return [
			{ op: "insert", path: ["..", target], value: got },
			{ op: "remove", path: [] },
		];
	},
};

/**
 * Runs one object through scan → sort → execute and return its settled state.
 */
async function run(
	object: GameObject,
	transformers: Transformer[],
): Promise<GameObject> {
	const workspace = new ModWorkspace();

	workspace.load(object, "m", FILE);

	const objects = createObjectsView(workspace, SCOPE);
	const key = makeKeyFromObject(object, "m");

	const scan = scanObject(object, transformers, {
		sourcePath: FILE,
		modId: "m",
	});

	const sortResults = sortPhase([object], {
		executionMaps: new Map([[key, scan.executionMap]]),
		objectDependencies: new Map(),
	});

	await executePhase(
		sortResults,
		new Map([[key, { sourcePath: FILE, modId: "m" }]]),
		{ workspace, objects, scope: SCOPE },
		transformers,
	);

	return timelineCurrent(workspace.timeline(key)!)!;
}

describe("execute deferral fixpoint", () => {
	test("resolves a deferral whose producer runs after it (cross-subtree)", async () => {
		// `aaa` (consumer) sorts before `zzz` (producer), so the consumer is tried first and must defer
		const final = await run(
			{
				id: "o",
				type: "ITEM",
				aaa: { consume: "x" },
				zzz: { produce: "x" },
			},
			[PRODUCER, CONSUMER],
		);

		expect(final.aaa).toBe("VALUE");
		expect(final.x).toBe("VALUE");
		expect(final.zzz).toBeUndefined();
	});

	test("resolves a chain of deferrals seeded in reverse order", async () => {
		const final = await run(
			{
				id: "o",
				type: "ITEM",
				aaa: { consume: "c" },
				bbb: { derive: ["c", "b"] },
				ccc: { derive: ["b", "seed"] },
				seed: "SEED",
			},
			[CONSUMER, DERIVER],
		);

		expect(final.aaa).toBe("SEED");
		expect(final.b).toBe("SEED");
		expect(final.c).toBe("SEED");
	});

	test("is order-independent: producer-first input resolves identically", async () => {
		const final = await run(
			{
				id: "o",
				type: "ITEM",
				aaa: { produce: "x" },
				zzz: { consume: "x" },
			},
			[PRODUCER, CONSUMER],
		);

		expect(final.zzz).toBe("VALUE");
	});

	test("transforms normally when nothing defers", async () => {
		const final = await run(
			{ id: "o", type: "ITEM", prod: { produce: "x" } },
			[PRODUCER],
		);

		expect(final.x).toBe("VALUE");
		expect(final.prod).toBeUndefined();
	});

	test("fails with the skip message when a deferral can never resolve", async () => {
		await expect(
			run({ id: "o", type: "ITEM", aaa: { consume: "missing" } }, [
				CONSUMER,
			]),
		).rejects.toThrow(
			/unresolved transformers[\s\S]*waiting for `missing`/,
		);
	});

	test("fails on a stuck deferral even when others made progress", async () => {
		await expect(
			run(
				{
					id: "o",
					type: "ITEM",
					ok: { consume: "k" },
					bad: { consume: "absent" },
					prod: { produce: "k" },
				},
				[PRODUCER, CONSUMER],
			),
		).rejects.toThrow(/waiting for `absent`/);
	});
});
