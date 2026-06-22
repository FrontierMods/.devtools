/**
 * @file Shared plugin types: the on-disk registry shape, the loaded-plugin outcomes, and the contract a plugin module must export.
 */

import type { Command, CommandContext, RouteMap } from "@stricli/core";

/**
 * Whether a load should register routes (`register`) or only report metadata (`inspect`).
 */
export type LoadMode = "register" | "inspect";

/**
 * A command a plugin contributes, either a leaf command or a nested route map.
 */
export type RouteTarget = Command<CommandContext> | RouteMap<CommandContext>;

/**
 * An ISO-8601 timestamp string, recorded when a plugin was last verified.
 */
export type ISOTimestamp = string;

/**
 * One of {@link PLUGIN_STATUSES}, the outcome of resolving and loading a plugin.
 */
export type PluginStatus = (typeof PLUGIN_STATUSES)[number];

/**
 * The outcome of a load attempt, either a failure or an active plugin.
 */
export type LoadedPlugin = FailedPlugin | ActivePlugin;

/**
 * A single command a plugin contributes under its top-level command.
 */
export interface RouteContribution {
	/** The subcommand name as typed on the CLI. */
	readonly name: string;
	/** The command or nested route map invoked by `name`. */
	readonly target: RouteTarget;
}

/**
 * What a plugin returns from `register()`: its routes and an optional default.
 */
export interface PluginRegistration {
	/** The commands this plugin contributes. */
	readonly routes: ReadonlyArray<RouteContribution>;
	/**
	 * Name of the route to use as default when the plugin command is invoked without a subcommand.
	 * Must match a route name in `routes`.
	 */
	readonly defaultRoute?: string;
}

/**
 * A plugin's user-facing identity: how it presents itself in listings and on the CLI.
 */
export interface PluginMetadata {
	/** Display name shown to users. */
	readonly name: string;
	/** One-line summary of what the plugin does. */
	readonly description: string;
	/** Top-level command word the plugin registers under. */
	readonly command: string;
}

/**
 * The contract a plugin module's default export must satisfy to be loadable.
 */
export interface PluginDefinition extends Required<PluginMetadata> {
	/** Plugin API version the module targets, checked against the core version. */
	readonly version: number;
	/**
	 * Produces the plugin's route contributions, called only in register mode.
	 *
	 * @returns The plugin's route contributions, optionally as a promise.
	 */
	register(): Promise<PluginRegistration> | PluginRegistration;
}

/**
 * The fields shared by every resolved plugin: how it is located, its identity, and the API version it was resolved against.
 */
interface PluginIdentity {
	/** Package name used to locate the plugin on disk. */
	readonly id: string;
	/** Resolved identity, shown without reloading the module. */
	readonly metadata: PluginMetadata;
	/** API version recorded at registration time. */
	readonly apiVersion: number;
}

/**
 * A plugin as persisted in the on-disk registry, the minimal record needed to re-resolve it.
 */
export interface Plugin extends PluginIdentity {
	/** When the plugin was last verified, for staleness reporting. */
	readonly lastCheckedAt: ISOTimestamp;
}

/**
 * A load attempt that did not produce a usable plugin, carrying the failure reason.
 */
export interface FailedPlugin {
	/** Package name that failed to load. */
	readonly id: string;
	/** The failure mode, any status except `active`. */
	readonly status: Exclude<PluginStatus, "active">;
	/** Human-readable explanation of the failure. */
	readonly reason: string;
}

/**
 * A successfully loaded plugin, with its resolved metadata and route contributions.
 */
export interface ActivePlugin extends PluginIdentity {
	/** Always `active` for a loaded plugin. */
	readonly status: "active";
	/** Routes the plugin contributed, empty in inspect mode. */
	readonly routes: ReadonlyArray<RouteContribution>;
	/** Name of the route used when invoked without a subcommand. */
	readonly defaultRoute?: string;
}

/**
 * The registry file's top-level shape: the list of persisted plugins.
 */
export interface PluginRegistry {
	/** Every plugin recorded in the registry. */
	readonly plugins: Plugin[];
}

/**
 * The full set of statuses a load attempt can resolve to, `active` plus every failure mode.
 */
export const PLUGIN_STATUSES = [
	"active",
	"missing",
	"conflict",
	"missing-export",
	"import-error",
	"invalid-export",
	"incompatible",
] as const;
