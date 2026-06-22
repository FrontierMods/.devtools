/**
 * @file `build` command: compile JSON5 mod sources into Cataclysm-compatible JSON.
 */

import {
	type CoreFlags,
	type PathFlags,
	pluralize,
	resolveConfig,
	withCoreFlags,
} from "@frmds/frontier";
import { buildCommand, type Command, type CommandContext } from "@stricli/core";
import { initContext } from "../../context.ts";
import { AUTODOC_LOGGER, configureAutodocLogger } from "../../logger.ts";
import { assertState, type BuildTaskContext } from "./state.ts";
import { createBuildTasks } from "./tasks.ts";

/**
 * Flags accepted by the `build` command.
 */
export interface BuildFlags extends CoreFlags, PathFlags {
	/** Number of objects to scan in parallel. */
	parallel: number;
}

/**
 * Flag definitions parsed for the `build` command.
 */
const parameters = {
	flags: withCoreFlags({
		input: {
			brief: "Override input directory",
			kind: "parsed",
			parse: String,
			optional: true,
			placeholder: "./src",
		},
		output: {
			brief: "Override output directory",
			kind: "parsed",
			parse: String,
			optional: true,
			placeholder: "./json",
		},
		game: {
			brief: "Override game installation directory",
			kind: "parsed",
			parse: String,
			optional: true,
			placeholder: "/path/to/cdda",
		},
		clean: {
			brief: "Remove output directory and all caches before running",
			kind: "boolean",
			optional: true,
		},
		parallel: {
			brief: "Number of objects to scan in parallel",
			kind: "parsed",
			parse: Number,
			default: "16",
		},
	}),
} as const;

/**
 * Builds the `build` command with its flags and run handler.
 *
 * @returns The `build` {@link Command}.
 */
export function createBuildCommand(): Command<CommandContext> {
	return buildCommand({
		func: async function (this: CommandContext, flags: BuildFlags) {
			await configureAutodocLogger(flags);

			const config = resolveConfig({ cwd: process.cwd(), flags });

			initContext(config);

			const logger = AUTODOC_LOGGER.getChild("build");

			const tasks = createBuildTasks(flags);
			const context: BuildTaskContext = {};

			try {
				await tasks.run(context);
			} finally {
				for (const cache of context.openCaches ?? [])
					await cache.close();
			}

			if (context.freshness?.upToDate) {
				logger.debug("Build up to date; nothing to do");

				return;
			}

			assertState(
				context,
				"Build summary",
				"filesWritten",
				"processedCount",
			);

			logger.debug(
				`Complete: ${context.filesWritten} ${pluralize(context.filesWritten, "file")} written (${context.processedCount} ${pluralize(context.processedCount, "object")} processed)`,
			);
		},
		parameters,
		docs: {
			brief: "Compile JSON5 mod sources into Cataclysm-compatible JSON",
		},
	});
}
