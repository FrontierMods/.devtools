/** @file pocket-multi transform test: a pocket with `multi` is replaced by that many `multi`-free copies. */

import { describe, expect, test } from "bun:test";
import type { TransformContext } from "@frmds/autodoc";
import POCKET_MULTI_TRANSFORMER from "../transformer.ts";

/** The transform reads nothing from context. */
const CONTEXT = {} as TransformContext;

describe("multiplyPockets", () => {
	test("replaces the pocket with `multi` cleaned copies", () => {
		const patches = POCKET_MULTI_TRANSFORMER.transform(
			{ description: "Pouch", multi: 3 },
			CONTEXT,
		);

		expect(patches).toEqual([
			{ op: "remove", path: [] },
			{ op: "insert", path: [], value: { description: "Pouch" } },
			{ op: "insert", path: [], value: { description: "Pouch" } },
			{ op: "insert", path: [], value: { description: "Pouch" } },
		]);
	});
});
