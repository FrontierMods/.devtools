/**
 * @file Plugin definition for `@frmds/init`, registering the `init` command with frontier.
 */

import type { PluginDefinition } from "@frmds/frontier";
import { createInitCommand } from "./commands/init.ts";

/**
 * Plugin definition registering the `init` scaffolding command.
 */
const PLUGIN: PluginDefinition = {
	version: 1,
	command: "init",
	name: "Init",
	description: "Initialize a new Frontier mod structure",
	/**
	 * Register the plugin's routes with frontier.
	 *
	 * @returns The plugin's command routes and default route.
	 */
	register() {
		return {
			routes: [
				{
					name: "init",
					target: createInitCommand(),
				},
			],
			defaultRoute: "init",
		};
	},
};

export default PLUGIN;
