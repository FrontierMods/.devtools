#!/usr/bin/env bun

/**
 * @file CLI entry point: builds the root route map and runs the Stricli application.
 */

import { buildApplication, run } from "@stricli/core";
import { logger } from "./logger.ts";
import { buildRootRoute } from "./route.ts";

/**
 * Builds the application from the assembled routes and runs it against the process arguments.
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const rootRoute = await buildRootRoute();

	const app = buildApplication(rootRoute, {
		name: "frontier",
		scanner: {
			caseStyle: "allow-kebab-for-camel",
		},
	});

	await run(app, args, { process });
}

main().catch((error) => {
	logger.error(error);

	process.exitCode = 1;
});
