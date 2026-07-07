import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import type { McpServer } from '../store/types';
import { callMcpTool, type ProbedTool } from './connect';

export interface LoadedServer {
	server: McpServer;
	authToken: string | null;
	tools: ProbedTool[];
}

/** A tool wrapper (from `defineTool`); typed loosely to sit in the agent's tool list. */
type McpTool = ReturnType<typeof defineTool>;

/**
 * Normalizes a string into a short, identifier-safe slug: lowercases it,
 * collapses any run of non-alphanumeric characters into a single underscore,
 * trims leading/trailing underscores, and caps the result at 24 characters.
 * @param s - The raw string to slugify (e.g. a server or tool name).
 * @returns The slugified string, or `'server'` if the input reduces to an empty string.
 */
function slug(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'server';
}

/**
 * Maps a single JSON Schema property definition to a Valibot schema, covering
 * the primitive types (`string`, `number`/`integer`, `boolean`, `array`) and
 * falling back to a permissive `v.any()` for objects, unions, `$ref`s, or any
 * other shape too complex for Catalyst GLM's tool-calling. Preserves the
 * property's `description`, if present, on the resulting schema.
 * @param prop - The JSON Schema property value (untyped, since it comes from an external MCP tool's schema).
 * @returns A Valibot schema matching the property's declared type.
 */
function propToValibot(prop: unknown): v.GenericSchema {
	const p = (prop && typeof prop === 'object' ? prop : {}) as Record<string, unknown>;
	const desc = typeof p.description === 'string' ? p.description : undefined;
	let base: v.GenericSchema;
	switch (p.type) {
		case 'string': base = v.string(); break;
		case 'number': case 'integer': base = v.number(); break;
		case 'boolean': base = v.boolean(); break;
		case 'array': base = v.array(v.any()); break;
		default: base = v.any(); // objects / unions / $ref → permissive (kept simple for GLM)
	}
	return desc ? v.pipe(base, v.description(desc)) : base;
}

/**
 * Converts an MCP tool's JSON Schema into a *shallow* Valibot object schema:
 * top-level properties mapped to primitive/permissive types, complex shapes
 * flattened to `any`. This keeps the schema the model sees simple — no `$ref`,
 * `$defs`, `anyOf`, or `outputSchema` that Catalyst GLM rejects.
 * @param schema - The MCP tool's input JSON Schema, or `undefined` if it declared none.
 * @returns A Valibot object schema whose properties are required/optional per the input schema's `required` list, or an empty permissive object schema if `schema` isn't a top-level object schema.
 */
export function jsonSchemaToValibot(schema: Record<string, unknown> | undefined): v.GenericSchema<Record<string, unknown>> {
	const props = schema && schema.type === 'object' && schema.properties && typeof schema.properties === 'object'
		? (schema.properties as Record<string, unknown>)
		: null;
	// defineTool requires a top-level object schema; an empty object accepts any args.
	if (!props) return v.object({}) as v.GenericSchema<Record<string, unknown>>;

	const required = new Set(Array.isArray(schema!.required) ? (schema!.required as string[]) : []);
	const shape: Record<string, v.GenericSchema> = {};
	for (const [key, prop] of Object.entries(props)) {
		const s = propToValibot(prop);
		shape[key] = required.has(key) ? s : v.optional(s);
	}
	return v.object(shape) as v.GenericSchema<Record<string, unknown>>;
}

/**
 * Builds Flue tools for a user's connected MCP servers. Each remote tool becomes
 * a `defineTool` wrapper whose `run` calls the server (SSRF-guarded) and returns
 * its text output. Names are prefixed per server to avoid collisions.
 * @param loaded - The user's connected MCP servers, each with its resolved auth token and probed tool list.
 * @returns One Flue tool per remote MCP tool across all loaded servers, with globally unique, server-prefixed names.
 */
export function buildMcpTools(loaded: LoadedServer[]): McpTool[] {
	const out: McpTool[] = [];
	const seen = new Set<string>();

	for (const { server, authToken, tools } of loaded) {
		const target = { url: server.url, transport: server.transport, authToken };
		for (const t of tools) {
			let name = `mcp_${slug(server.name)}_${slug(t.name)}`.slice(0, 60);
			while (seen.has(name)) name = `${name}_`.slice(0, 62) + Math.random().toString(36).slice(2, 4);
			seen.add(name);

			out.push(defineTool({
				name,
				description: `[${server.name}] ${t.description || t.name}`.slice(0, 1024),
				input: jsonSchemaToValibot(t.inputSchema),
				output: v.any(),
				async run({ input }) {
					try {
						return [{ type: 'text', text: await callMcpTool(target, t.name, (input ?? {}) as Record<string, unknown>) }];
					} catch (err) {
						return [{ type: 'text', text: `MCP tool "${t.name}" on ${server.name} failed: ${err instanceof Error ? err.message : String(err)}` }];
					}
				},
			}));
		}
	}
	return out;
}
