/**
 * @file Tests for the public barrel: `ALL_TRANSFORMERS` must aggregate every individually-exported transformer.
 */

import { describe, expect, test } from "bun:test";
import * as barrel from "../index.ts";

describe("ALL_TRANSFORMERS", () => {
	test("contains every individually-exported transformer", () => {
		const individuals = Object.entries(barrel)
			.filter(([name]) => name !== "ALL_TRANSFORMERS")
			.map(([, transformer]) => transformer);

		expect(individuals.length).toBeGreaterThan(0);
		expect(barrel.ALL_TRANSFORMERS).toEqual(individuals);
	});
});
