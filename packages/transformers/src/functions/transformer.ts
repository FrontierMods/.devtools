/**
 * @file The `functions` transformer: matches function invocations via FunctionInvocationSchema and substitutes the looked-up definition's body.
 */

import { assertSchema, type Transformer } from "@frmds/autodoc";
import { makeKey } from "@frmds/frontier";
import {
	createBindings,
	substitute,
	validateArgumentCount,
	validateArgumentTypes,
	validateFunctionDefinition,
} from "./engine.ts";
import { FunctionInvocationSchema, FunctionObjectSchema } from "./schema.ts";
import type { FunctionInvocation } from "./types.ts";

/** The `functions` transformer: traversal content gate on function invocations → substituted definition body. */
const FUNCTION_TRANSFORMER: Transformer<FunctionInvocation> = {
	name: "resolveFunctions",
	version: "1.0.0",
	api: "1.0.0",
	description: "Resolves function invocations by substituting arguments",
	target: { content: FunctionInvocationSchema },

	extractDependencies(value, context) {
		return [makeKey(value.fn, "FUNCTION", context.modId)];
	},

	transform(value, context) {
		const fnDef = context.objects.get(value.fn, "FUNCTION", context.scope);

		if (!fnDef)
			throw new Error(
				`Function not found: ${value.fn}\n` +
					`  at: ${context.modId}:${context.sourcePath} (object: ${context.currentObject.id})`,
			);

		// validate-and-narrow the fetched game object to a `FunctionObject` so the rest of the flow is statically typed without a cast
		assertSchema(
			FunctionObjectSchema,
			fnDef,
			`Invalid function definition structure for ${value.fn}`,
		);

		validateFunctionDefinition(fnDef, context);
		validateArgumentCount(value, fnDef, context);
		validateArgumentTypes(value, fnDef, context);

		const bindings = createBindings(value.args, fnDef.args);
		const clonedTemplate = structuredClone(fnDef.returns);
		const result = substitute(clonedTemplate, bindings);

		return [{ op: "replace", value: result }];
	},
};

export default FUNCTION_TRANSFORMER;
