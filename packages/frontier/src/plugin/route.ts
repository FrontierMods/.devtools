/**
 * @file The `frontier plugin` command tree: list, add, remove, and reset subcommands wired over the registry and plugin loader.
 */

import {
	buildCommand,
	buildRouteMap,
	type CommandContext,
} from "@stricli/core";
import { type CoreFlags, withCoreFlags } from "../flags.ts";
import { configureLogger, logger } from "../logger.ts";
import { loadPlugins } from "./manager.ts";
import {
	addPlugin,
	readRegistry,
	removePlugin,
	resetRegistry,
} from "./registry.ts";

/**
 * Child logger for the plugin command tree.
 */
const LOGGER = logger.getChild("plugins");

/**
 * The `plugin list` command: reports every registered plugin and whether it loads.
 */
const PLUGINS_LIST_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags) {
		await configureLogger(flags);

		const registry = await readRegistry();

		const results = await loadPlugins(
			registry.plugins.map((plugin) => plugin.id),
			"inspect",
		);

		if (!results.length) return LOGGER.info("No plugins registered");

		for (const result of results) {
			if (result.status === "active") {
				LOGGER.info(`✔ ${result.id}: ${result.metadata.description}`);
			} else {
				LOGGER.warn(`✖ ${result.id}: ${result.reason}`);
			}
		}
	},
	parameters: {
		flags: withCoreFlags(),
	},
	docs: {
		brief: "List registered plugins and their status",
	},
});

/**
 * The `plugin add` command: inspects a package and registers it when it loads cleanly.
 */
const PLUGINS_ADD_COMMAND = buildCommand({
	func: async function (
		this: CommandContext,
		flags: CoreFlags,
		name: string,
	) {
		await configureLogger(flags);

		const [result] = await loadPlugins([name], "inspect");

		if (!result || result.status !== "active") {
			LOGGER.error(
				`Cannot add plugin \`${name}\`: ${result?.reason ?? "plugin not found"}`,
			);

			process.exitCode = 1;

			return;
		}

		await addPlugin({
			id: result.id,
			metadata: result.metadata,
			apiVersion: result.apiVersion,
			lastCheckedAt: new Date().toISOString(),
		});

		LOGGER.info(`Registered plugin \`${name}\``);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "Package name of the plugin",
					parse: String,
					placeholder: "name",
				},
			],
		},
	},
	docs: {
		brief: "Register a globally-installed plugin by package name",
	},
});

/**
 * The `plugin remove` command: unregisters a plugin by package name.
 */
const PLUGINS_REMOVE_COMMAND = buildCommand({
	func: async function (
		this: CommandContext,
		flags: CoreFlags,
		name: string,
	) {
		await configureLogger(flags);

		const registry = await readRegistry();

		if (!registry.plugins.some((plugin) => plugin.id === name)) {
			LOGGER.error(`Plugin \`${name}\` is not registered`);

			process.exitCode = 1;

			return;
		}

		await removePlugin(name);

		LOGGER.info(`Removed plugin \`${name}\``);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "Package name of the plugin",
					parse: String,
					placeholder: "name",
				},
			],
		},
	},
	docs: {
		brief: "Unregister a plugin by package name",
	},
});

/**
 * The `plugin reset` command: deletes the registry file, clearing all registrations.
 */
const PLUGINS_RESET_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags) {
		await configureLogger(flags);

		try {
			await resetRegistry();

			LOGGER.info("Plugin registry has been reset.");
		} catch (error) {
			const fsError = error as NodeJS.ErrnoException;

			if (fsError.code === "EACCES" || fsError.code === "EPERM") {
				LOGGER.error(
					`Permission denied: cannot delete plugin registry. Check file permissions.`,
				);
			} else {
				LOGGER.error(
					`Failed to reset plugin registry: ${fsError.message}`,
				);
			}

			process.exitCode = 1;
		}
	},
	parameters: {
		flags: withCoreFlags(),
		positional: { kind: "tuple", parameters: [] },
	},
	docs: {
		brief: "Reset the plugin registry",
	},
});

/**
 * The assembled `frontier plugin` route map, the package's public command surface.
 */
export const PLUGINS_ROUTE_MAP = buildRouteMap({
	routes: {
		list: PLUGINS_LIST_COMMAND,
		add: PLUGINS_ADD_COMMAND,
		remove: PLUGINS_REMOVE_COMMAND,
		reset: PLUGINS_RESET_COMMAND,
	},
	docs: {
		brief: "Manage Frontier Mods `.devtools` plugins",
	},
});
