/**
 * What fields does ChatWonder's /chat accept? Looking for a language/locale knob — its
 * refusals mention "the la locale language" and "must communicate in the Korean language
 * only", which reads like a templated system prompt.
 *
 *   npx tsx scratch/probe-chatwonder-schema.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const spec = await (await fetch(`${base}/openapi.json`)).json() as {
    paths: Record<string, Record<string, { requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> } }>>;
    components: { schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }> };
};

const chat = spec.paths['/chat']?.post;
const ref = chat?.requestBody?.content?.['application/json']?.schema?.$ref?.split('/').pop();
console.log('request schema:', ref);
const schema = ref ? spec.components.schemas[ref] : undefined;
console.log('required:', schema?.required);
for (const [k, v] of Object.entries(schema?.properties ?? {})) {
    console.log(`  ${k}: ${JSON.stringify(v).slice(0, 200)}`);
}
