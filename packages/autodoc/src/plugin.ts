/**
 * @file Plugin definition and entry point.
 */

import type { PluginDefinition } from "@frmds/frontier";
import { createBuildCommand } from "./commands/build/index.ts";

/**
 * Plugin definition registering the `build` command.
 */
const PLUGIN: PluginDefinition = {
	version: 1,
	command: "autodoc",
	name: "Autodoc",
	description: "Process source files into runtime JSON",
	register() {
		const target = createBuildCommand();

		return {
			routes: [
				{
					name: "build",
					target,
				},
			] as const,
		};
	},
};

export default PLUGIN;
