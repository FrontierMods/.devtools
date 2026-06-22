/**
 * @file The `format` command: format JSON files with the game's json_formatter.
 */

import {
	configureLogger,
	type CoreFlags,
	logger,
	pluralize,
	withCoreFlags,
} from "@frmds/frontier";
import { buildCommand, type Command, type CommandContext } from "@stricli/core";
import { cpus } from "os";
import { discoverTargets } from "./discover.ts";
import { resolveTargetInstall } from "./install.ts";
import { locateFormatter } from "./locate.ts";
import { type FileOutcome, formatAll } from "./run.ts";

/**
 * Flags accepted by the format command, on top of the shared core flags.
 */
export interface FormatFlags extends CoreFlags {
	/** Game install to format against, as a commit hash or path. Prompts when omitted and several are registered. */
	game?: string;
	/** Maximum number of files to format at once. Defaults to the CPU count when omitted. */
	parallel?: number;
}

/**
 * `stricli` flag and positional spec for the format command.
 */
const parameters = {
	flags: withCoreFlags({
		game: {
			brief: "Game install to use (commit hash or path)",
			kind: "parsed",
			parse: String,
			optional: true,
			placeholder: "hash or path",
		},
		parallel: {
			brief: "Number of files to format in parallel (default: CPU count)",
			kind: "parsed",
			parse: Number,
			optional: true,
			placeholder: "n",
		},
	}),
	positional: {
		kind: "tuple",
		parameters: [
			{
				brief: "File or directory to format (default: current directory)",
				parse: String,
				optional: true,
				placeholder: "path",
			},
		],
	},
} as const;

/**
 * Builds the `stricli` command that formats a file or directory of `.json`.
 *
 * @returns the `format` {@link Command}.
 */
export function createFormatCommand(): Command<CommandContext> {
	return buildCommand({
		func: async function (
			this: CommandContext,
			flags: FormatFlags,
			target?: string,
		) {
			await configureLogger(flags);

			const log = logger.getChild("format");

			const gameDir = await resolveTargetInstall(flags);
			const formatter = locateFormatter(gameDir);

			log.debug(`Using formatter ${formatter}`);

			const files = await discoverTargets(target ?? process.cwd());

			if (files.length === 0)
				return log.info("No `.json` files to format");

			const parallel = flags.parallel ?? cpus().length;

			log.debug(
				`Formatting ${files.length} ${pluralize(files.length, "file")} (parallel: ${parallel})`,
			);

			const outcomes = await formatAll(formatter, files, parallel);

			const formatted = outcomes.filter(
				(outcome) => outcome.status === "formatted",
			);

			const clean = outcomes.filter(
				(outcome) => outcome.status === "clean",
			);

			const failed = outcomes.filter(
				(
					outcome,
				): outcome is Extract<FileOutcome, { status: "failed" }> =>
					outcome.status === "failed",
			);

			for (const outcome of failed)
				log.error(`${outcome.file}: ${outcome.message}`);

			log.info(
				`${formatted.length} formatted, ${clean.length} clean, ${failed.length} failed`,
			);

			if (failed.length > 0) process.exitCode = 1;
		},
		parameters,
		docs: {
			brief: "Format JSON files with the game's own json_formatter",
		},
	});
}
