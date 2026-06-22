/**
 * @file `init` command: scaffold a toolkit-compatible mod in the current directory.
 */

import type { CoreFlags } from "@frmds/frontier";
import {
	configureLogger,
	logger,
	pluralize,
	withCoreFlags,
} from "@frmds/frontier";
import { buildCommand, type Command, type CommandContext } from "@stricli/core";
import fs from "fs-extra";
import path from "path";

/**
 * A scaffold template, mapping its on-disk name to the name it takes once scaffolded.
 */
interface TemplateFile {
	/** Filename as stored in the package's `templates/` directory. */
	source: string;
	/** Filename written into the scaffolded mod. */
	target: string;
}

/**
 * Child logger scoped to the `init` command.
 */
const LOGGER = logger.getChild("init");

/**
 * Directory holding the scaffold templates, resolved relative to the built command.
 */
const TEMPLATES_DIR = path.resolve(
	import.meta.dirname,
	"..",
	"..",
	"templates",
);

/**
 * Empty directories the scaffold creates.
 */
const DIRECTORIES = ["src"];

/**
 * Template files the scaffold copies, paired by on-disk `source` and scaffolded `target`.
 *
 * npm and bun strip files literally named `.gitignore` from published packages, so the template ships dotless and is renamed to its `target` on copy.
 */
const TEMPLATE_FILES: TemplateFile[] = [
	{ source: "modinfo.json", target: "modinfo.json" },
	{ source: "frontier.json5", target: "frontier.json5" },
	{ source: "gitignore", target: ".gitignore" },
];

/**
 * Build the `init` command, which scaffolds a mod structure into the current working directory without overwriting existing files.
 *
 * @returns The configured `init` {@link Command}.
 */
export function createInitCommand(): Command<CommandContext> {
	return buildCommand({
		func: async function (this: CommandContext, flags: CoreFlags) {
			await configureLogger(flags);

			const cwd = process.cwd();

			LOGGER.info("Initializing Frontier mod structure...");

			let created = 0;
			let skipped = 0;

			for (const file of TEMPLATE_FILES) {
				const source = path.join(TEMPLATES_DIR, file.source);
				const target = path.join(cwd, file.target);

				if (await fs.pathExists(target)) {
					LOGGER.info(`Skipping \`${file.target}\`: already exists`);

					skipped++;

					continue;
				}

				await fs.copy(source, target);

				LOGGER.info(`Created \`${file.target}\``);

				created++;
			}

			for (const directory of DIRECTORIES) {
				const target = path.join(cwd, directory);

				if (await fs.pathExists(target)) {
					LOGGER.info(`Skipping \`${directory}/\`: already exists`);

					skipped++;

					continue;
				}

				await fs.ensureDir(target);

				LOGGER.info(`Created \`${directory}/\``);

				created++;
			}

			if (created)
				LOGGER.info(
					`Done: ${created} ${pluralize(created, "item")} created`,
				);

			if (skipped && !created)
				LOGGER.info("Nothing to create: all files already exist");
		},
		parameters: {
			flags: withCoreFlags(),
		},
		docs: {
			brief: "Initialize a new Frontier mod structure in the current directory",
		},
	});
}
