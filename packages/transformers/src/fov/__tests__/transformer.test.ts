/** @file Tests the FoV transform: window and distance branches each yield an MoA scalar, magnification widening the angle inversely. */

import { describe, expect, test } from "bun:test";
import type { TransformContext } from "@frmds/autodoc";
import type { Patch } from "@frmds/frontier";
import FOV_TRANSFORMER from "../transformer.ts";

/** The transformer only reads `currentObject` on its failure path; the cast documents that contract rather than fabricating the full pipeline state. */
const CONTEXT = {
	currentObject: { type: "ITEM", id: "test_scope" },
} as TransformContext;

/** The MoA scalar a successful run writes in place of the FoV object. */
function moa(fov: Record<string, unknown>): number {
	const [patch] = FOV_TRANSFORMER.transform(fov, CONTEXT) as Patch[];

	if (patch?.op !== "replace") throw new Error("expected a replace patch");

	return patch.value as number;
}

describe("calculateFOV", () => {
	test("replaces a distance object in place with a positive MoA scalar", () => {
		const value = moa({ height: "2 m", distance: "10 m" });

		expect(value).toBeGreaterThan(0);
		expect(Number.isFinite(value)).toBe(true);
	});

	test("resolves the window branch via its diagonal aperture", () => {
		const value = moa({
			height: "10 cm",
			width: "10 cm",
			distance: "50 cm",
		});

		expect(value).toBeGreaterThan(0);
	});

	test("magnification narrows the angle inversely", () => {
		const plain = moa({ height: "2 m", distance: "10 m" });

		const magnified = moa({
			height: "2 m",
			distance: "10 m",
			magnification: 2,
		});

		expect(magnified).toBeLessThan(plain);
	});

	test("fails with the object id when a measurement cannot be parsed", () => {
		expect(() =>
			FOV_TRANSFORMER.transform(
				{ height: "tall", distance: "10 m" },
				CONTEXT,
			),
		).toThrow("test_scope");
	});
});
