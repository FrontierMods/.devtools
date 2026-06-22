/**
 * @file Assembles the CLI root route map, folding active plugins into a `run` namespace.
 */

import type { CommandContext, RouteMap } from "@stricli/core";
import { buildRouteMap } from "@stricli/core";
import { CONFIG_ROUTE_MAP } from "./config/route.ts";
import { GAME_ROUTE_MAP } from "./game/route.ts";
import { loadPlugins } from "./plugin/manager.ts";
import { readRegistry } from "./plugin/registry.ts";
import { PLUGINS_ROUTE_MAP } from "./plugin/route.ts";
import type { ActivePlugin, LoadedPlugin } from "./plugin/types.ts";

/**
 * Narrows a loaded plugin to one that loaded successfully and is active.
 *
 * @param plugin The loaded plugin to test.
 *
 * @returns `true` when the plugin's status is `"active"`.
 */
function isActive(plugin: LoadedPlugin): plugin is ActivePlugin {
	return plugin.status === "active";
}

/**
 * Reads the plugin registry, loads the registered plugins, and builds the root route map combining core routes with active plugin routes.
 *
 * @returns The assembled root route map.
 */
export async function buildRootRoute(): Promise<RouteMap<CommandContext>> {
	const registry = await readRegistry();

	const plugins = await loadPlugins(
		registry.plugins.map((plugin) => plugin.id),
	);

	const pluginRoutes = Object.fromEntries(
		plugins.filter(isActive).map((plugin) => [
			plugin.metadata.command,
			buildRouteMap({
				routes: Object.fromEntries(
					plugin.routes.map((route) => [route.name, route.target]),
				),
				defaultCommand: plugin.defaultRoute,
				docs: {
					brief:
						plugin.metadata.description ??
						`Run ${plugin.metadata.command} commands`,
				},
			}),
		]),
	);

	const routes: Record<string, RouteMap<CommandContext>> = {
		config: CONFIG_ROUTE_MAP,
		game: GAME_ROUTE_MAP,
		plugins: PLUGINS_ROUTE_MAP,
	};

	if (Object.keys(pluginRoutes).length)
		routes.run = buildRouteMap({
			routes: pluginRoutes,
			docs: {
				brief: "Run plugin commands",
			},
		});

	return buildRouteMap({
		routes,
		docs: {
			brief: "Frontier core toolkit",
		},
	});
}
