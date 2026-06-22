/**
 * @file Runtime behavior of classify and the format pool.
 */

import { test, expect } from "bun:test";
import { classify, formatAll, type RunFormatter } from "../run.ts";

test("classify reports a clean file from exit 0", () => {
	expect(classify("a.json", { stdout: "", stderr: "", exitCode: 0 })).toEqual(
		{
			file: "a.json",
			status: "clean",
		},
	);
});

test("classify reports a reformat from the 'Has been linted' prefix", () => {
	expect(
		classify("a.json", {
			stdout: "Has been linted : a.json\nPlease read doc/JSON/JSON_STYLE.md\n",
			stderr: "",
			exitCode: 1,
		}),
	).toEqual({ file: "a.json", status: "formatted" });
});

test("classify reports a failure from the 'Json error' prefix", () => {
	const result = classify("a.json", {
		stdout: "Json error: a.json:EOF:\nexpected JSON value\n",
		stderr: "",
		exitCode: 1,
	});

	expect(result.status).toBe("failed");
	expect(result).toMatchObject({ file: "a.json" });
});

test("classify reports a spawn failure (exit -1) as failed", () => {
	const result = classify("a.json", {
		stdout: "",
		stderr: "ENOENT",
		exitCode: -1,
	});

	expect(result.status).toBe("failed");
});

test("formatAll classifies every file using the injected runner", async () => {
	const run: RunFormatter = (_formatter, file) =>
		Promise.resolve({
			stdout: file === "dirty.json" ? "Has been linted : dirty.json" : "",
			stderr: "",
			exitCode: file === "dirty.json" ? 1 : 0,
		});

	const outcomes = await formatAll(
		"json_formatter",
		["clean.json", "dirty.json"],
		2,
		run,
	);

	expect(outcomes).toEqual([
		{ file: "clean.json", status: "clean" },
		{ file: "dirty.json", status: "formatted" },
	]);
});
