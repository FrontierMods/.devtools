/**
 * @file Spawning `json_formatter` per file, and classifying each result.
 */

import pLimit from "p-limit";

/**
 * Outcome of formatting one file: `clean` when it needed no change, `formatted` when `json_formatter` rewrote it, or `failed` (with a message) when it could not be formatted.
 */
export type FileOutcome =
	| { file: string; status: "clean" }
	| { file: string; status: "formatted" }
	| { file: string; status: "failed"; message: string };

/**
 * Spawns the formatter for one file, injectable so the pool is testable without a real binary.
 */
export type RunFormatter = (
	formatter: string,
	file: string,
) => Promise<RunResult>;

/**
 * The raw result of one `json_formatter` invocation, as handed to {@link classify}.
 */
export interface RunResult {
	/** Everything the formatter printed to stdout. Its prefix distinguishes a reformat from a parse error. */
	stdout: string;
	/** Everything the formatter printed to stderr, used as the failure message when stdout is unhelpful. */
	stderr: string;
	/** The formatter's exit code. `0` is clean, non-zero is either a reformat or a failure. */
	exitCode: number;
}

/**
 * Interprets one formatter run into a {@link FileOutcome}.
 * The exit code is overloaded: `1` means both "reformatted" and "parse error", so the `stdout` prefix is authoritative.
 *
 * @param file The formatted file, echoed into the returned outcome.
 * @param result The raw output of that file's json_formatter run.
 */
export function classify(file: string, result: RunResult): FileOutcome {
	if (result.exitCode === 0) return { file, status: "clean" };

	if (result.stdout.startsWith("Has been linted"))
		return { file, status: "formatted" };

	if (result.stdout.startsWith("Json error"))
		return { file, status: "failed", message: result.stdout.trim() };

	return {
		file,
		status: "failed",
		message: result.stderr || result.stdout || `exit ${result.exitCode}`,
	};
}

/**
 * Default runner: spawn `json_formatter` with the file as its sole argument and capture its output.
 *
 * @param formatter Path to the `json_formatter` binary.
 * @param file The file to format, passed as the formatter's only argument.
 *
 * @returns Run results.
 */
export async function runViaBun(
	formatter: string,
	file: string,
): Promise<RunResult> {
	const proc = Bun.spawn([formatter, file], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	const exitCode = await proc.exited;

	return { stdout, stderr, exitCode };
}

/**
 * Formats every file through a bounded pool, preserving input order.
 *
 * @param formatter Path to the json_formatter binary each file is run through.
 * @param files The files to format.
 * @param parallel Maximum number of files to format at once.
 * @param run Spawns the formatter for one file. Drop it outside tests to use the default {@link runViaBun}.
 */
export function formatAll(
	formatter: string,
	files: string[],
	parallel: number,
	run: RunFormatter = runViaBun,
): Promise<FileOutcome[]> {
	const limit = pLimit(parallel);

	return Promise.all(
		files.map((file) =>
			limit(async () => classify(file, await run(formatter, file))),
		),
	);
}
