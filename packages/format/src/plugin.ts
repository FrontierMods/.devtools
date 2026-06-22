/**
 * @file Plugin definition for the `format` command.
 */

import type { PluginDefinition } from "@frmds/frontier";
import { createFormatCommand } from "./command.ts";

/**
 * The `format` plugin: registers a single `format` route.
 */
const PLUGIN: PluginDefinition = {
	version: 1,
	command: "format",
	name: "Format",
	description: "Format JSON files with the game's own json_formatter",
	register() {
		return {
			routes: [
				{ name: "format", target: createFormatCommand() },
			] as const,
			defaultRoute: "format",
		};
	},
};

export default PLUGIN;
