/**
 * @file Local oxlint config for `@frmds/transformers`.
 */

import baseConfig from "../../oxlint.config.ts";
import { defineConfig } from "oxlint";

export default defineConfig({
	extends: [baseConfig],
	rules: {
		"frontier-style/module-const-screaming-snake": [
			"error",
			{ exceptions: ["Quantity"], exceptionPatterns: ["Schema"] },
		],
	},
});
