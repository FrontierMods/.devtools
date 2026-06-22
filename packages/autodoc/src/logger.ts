/**
 * @file Logger setup and configuration for the build.
 */

import type { CoreFlags } from "@frmds/frontier";
import { getFileSink } from "@logtape/file";
import {
	configure,
	getConsoleSink,
	getLevelFilter,
	getLogger,
	getTextFormatter,
	type Sink,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import path from "path";

/**
 * Cache directory name under the mod root.
 */
const FRONTIER_CACHE_DIR = ".frontier";

/**
 * No-op sink that disables a logging channel.
 */
const NO_SINK = (): void => {};

/**
 * Absolute path of the log file.
 */
const LOG_FILE_PATH = path.join(
	process.cwd(),
	FRONTIER_CACHE_DIR,
	"autodoc.log",
);

/**
 * Text formatter for {@link FILE_SINK}.
 */
const FILE_FORMATTER = getTextFormatter({
	timestamp: "time",
	level: "FULL",
	category: "/",
});

/**
 * Buffered sink writing to {@link LOG_FILE_PATH}.
 */
const FILE_SINK = getFileSink(LOG_FILE_PATH, {
	lazy: true,
	bufferSize: 8192,
	flushInterval: 5000,
	nonBlocking: true,
	formatter: FILE_FORMATTER,
}) satisfies Sink;

/**
 * Pretty formatter for {@link CONSOLE_SINK}.
 */
const CONSOLE_FORMATTER = getPrettyFormatter({
	icons: false,
});

/**
 * Console sink using {@link CONSOLE_FORMATTER}.
 */
const CONSOLE_SINK = getConsoleSink({
	formatter: CONSOLE_FORMATTER,
}) satisfies Sink;

/**
 * Root logger for the plugin.
 */
export const AUTODOC_LOGGER = getLogger(["frontier", "autodoc"]);

/**
 * Configures Autodoc logger based on CLI flags.
 *
 * - `--verbose`: Enable console logging (replaces task TUI with log output)
 * - `--silent`: Only show errors
 * - `--log`: Write logs to file
 *
 * @param flags The CLI flags driving sink selection and log level.
 */
export async function configureAutodocLogger(flags: CoreFlags): Promise<void> {
	const needConsole = flags.verbose;
	const needFile = flags.log;

	const desiredLevel = getLevelFilter(
		flags.silent ? "error" : flags.verbose ? "debug" : "info",
	);

	await configure({
		sinks: {
			console: needConsole ? CONSOLE_SINK : NO_SINK,
			file: needFile ? FILE_SINK : NO_SINK,
		},
		filters: {
			desiredLevel,
		},
		loggers: [
			{
				category: "frontier",
				filters: ["desiredLevel"],
				sinks: ["console", "file"],
			},
			// * silence logtape's own meta logs
			{
				category: ["logtape", "meta"],
				lowestLevel: "error",
				sinks: ["console"],
			},
		],
	});
}
