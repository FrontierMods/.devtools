/**
 * @file The toolkit logger: sink configuration, the shared root logger, and a namespaced child factory.
 */

import { getFileSink } from "@logtape/file";
import {
	configure,
	getConsoleSink,
	getLevelFilter,
	getLogger,
	getTextFormatter,
	type Logger,
	type Sink,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import path from "path";
import { FRONTIER_CACHE_DIR } from "./constants.ts";
import type { CoreFlags } from "./flags.ts";

/**
 * A no-op sink, swapped in to silence console or file output without removing the logger wiring.
 */
const NO_SINK = (): void => {};

/**
 * Absolute path of the on-disk log file, under the toolkit cache directory of the current working directory.
 */
const LOG_FILE_PATH = path.join(
	process.cwd(),
	FRONTIER_CACHE_DIR,
	"frontier.log",
);

/**
 * Plain-text formatter for the file sink, with full level names and slash-joined categories.
 */
const FILE_FORMATTER = getTextFormatter({
	timestamp: "time",
	level: "FULL",
	category: "/",
});

/**
 * Buffered, non-blocking file sink for persistent logs.
 */
const FILE_SINK = getFileSink(LOG_FILE_PATH, {
	lazy: true,
	bufferSize: 8192,
	flushInterval: 5000,
	nonBlocking: true,
	formatter: FILE_FORMATTER,
}) satisfies Sink;

/**
 * Pretty console formatter, with icons disabled to keep output greppable.
 */
const CONSOLE_FORMATTER = getPrettyFormatter({
	icons: false,
});

/**
 * Console sink using the pretty formatter.
 */
const CONSOLE_SINK = getConsoleSink({
	formatter: CONSOLE_FORMATTER,
}) satisfies Sink;

/**
 * The shared root logger for the toolkit. All toolkit logging nests beneath this category.
 */
export const logger = getLogger(["frontier"]);

/**
 * Configures the logging system from resolved flags, wiring the console and file sinks and setting the level filter. Plugins may reconfigure this to suit their own needs.
 *
 * @param flags The resolved core flags driving sink selection and verbosity.
 */
export async function configureLogger(flags: CoreFlags): Promise<void> {
	// * we may want no console but a persistent log
	// * so we configure this always, but change params based on flags
	// TODO: allow plain logs outside of Autodoc
	// * reconfig on the Autodoc level?
	const needConsole = true; /* flags.verbose */
	const needFile = flags.log;

	const desiredLevel = getLevelFilter(flags.silent ? "error" : "info");

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
			// ↓ this is required to silence the default `logtape` message
			{
				category: ["logtape", "meta"],
				lowestLevel: "error",
				sinks: ["console"],
			},
		],
	});
}

/**
 * Creates a logger scoped to a caller-chosen namespace beneath the toolkit root, so any component (including externally-loaded plugins) logs through the same sinks, filters, and level configuration as the rest of the toolkit. The caller supplies the namespace, so this stays agnostic of who logs: pass a single segment or a path (e.g. `["transformer", "applyFieldOfView"]`).
 *
 * @param namespace The category segments to nest under the toolkit root.
 *
 * @returns A logger scoped to the given namespace beneath the toolkit root.
 */
export function createLogger(...namespace: [string, ...string[]]): Logger {
	return logger.getChild(namespace);
}
