/**
 * @file CLI flag definitions shared across commands, plus the core-flag merge helper.
 */

import type { FlagParametersForType } from "@stricli/core";

/**
 * Type for resolved core flags.
 * All flags are optional except `cache` which defaults to true.
 */
export interface CoreFlags {
	/** Enables verbose logging output. */
	verbose?: boolean;
	/** Suppresses all non-error output. */
	silent?: boolean;
	/** Treats warnings as errors. */
	strict?: boolean;
	/** Cleans caches before the operation. */
	clean?: boolean;
	/** Writes logs to a file. */
	log?: boolean;
	/** Enables persistent caching. */
	cache: boolean;
}

/**
 * Flags that affect path resolution.
 * Extended by commands that override input/output paths.
 */
export interface PathFlags {
	/** Overrides the input directory. */
	input?: string;
	/** Overrides the output directory. */
	output?: string;
	/** Overrides the game install path. */
	game?: string;
}

/**
 * Core CLI flags shared across all commands.
 */
export const CORE_FLAGS = {
	verbose: {
		kind: "boolean",
		brief: "Enable verbose logging output",
		optional: true,
	},
	silent: {
		kind: "boolean",
		brief: "Suppress all non-error output",
		optional: true,
	},
	strict: {
		kind: "boolean",
		brief: "Treat warnings as errors",
		optional: true,
	},
	clean: {
		kind: "boolean",
		brief: "Clean caches before operation",
		optional: true,
	},
	log: {
		kind: "boolean",
		brief: "Write logs to file",
		optional: true,
	},
	cache: {
		kind: "boolean",
		brief: "Enable persistent caching",
		default: true,
	},
} as const satisfies FlagParametersForType<CoreFlags>;

/**
 * Merges core flags with command-specific flags.
 * Used in plugin definition to align plugin flags with core ones.
 *
 * @param flags The command-specific flags to merge atop the core flags.
 *
 * @returns The combined flag set, with core flags overridden by any matching command flags.
 */
export function withCoreFlags<
	// * `const` is required to maintain precision over the strings we supply (e.g. `"parsed"` instead of `string`)
	// * without `const`, the type becomes too wide, and `buildCommand()`'s `parameters` no longer accepts the output
	const T extends Record<string, unknown>,
>(flags: T = {} as T): typeof CORE_FLAGS & T {
	return { ...CORE_FLAGS, ...flags } as typeof CORE_FLAGS & T;
}
