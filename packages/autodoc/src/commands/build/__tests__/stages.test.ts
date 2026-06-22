/**
 * @file Tests for build-stage helpers that need no live mod context.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { writeSchemaPin } from "@frmds/frontier";
import { checkSchemaArtifacts } from "../stages.ts";

describe("checkSchemaArtifacts", () => {
	test("reports missing artifacts as a warning string", () => {
		const modRoot = mkdtempSync(path.join(tmpdir(), "mod-"));

		expect(checkSchemaArtifacts(modRoot)).toContain(
			"frontier run schema sync",
		);
	});

	test("accepts a synced mod silently", () => {
		const modRoot = mkdtempSync(path.join(tmpdir(), "mod-"));

		writeSchemaPin(modRoot, {
			commit: "abc",
			toolkitVersion: "0",
			syncedAt: "2026-06-12T00:00:00.000Z",
		});

		expect(checkSchemaArtifacts(modRoot)).toBeNull();
	});
});
