/**
 * Fix broken imports left by the migration script.
 * Handles: dynamic imports, aliased imports, type-only imports.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_DIR = './src';
const EXTENSIONS = ['.ts', '.tsx'];

function getAllFiles(dir) {
    const results = [];
    const items = readdirSync(dir);
    for (const item of items) {
        const full = join(dir, item);
        if (statSync(full).isDirectory()) {
            if (item === 'node_modules' || item === '.next') continue;
            results.push(...getAllFiles(full));
        } else if (EXTENSIONS.includes(extname(item))) {
            results.push(full);
        }
    }
    return results;
}

const replacements = [
    // Fix broken aliased imports like "import { as createServiceClient }"
    [/import\s*\{\s*as\s+\w+\s*\}\s*from\s*['"]@supabase\/supabase-js['"]\s*\n?/g,
     `import { createAdminClient } from '@/utils/postgres/admin';\n`],

    // Fix remaining: "import { createClient as X } from '@supabase/supabase-js'"
    [/import\s*\{\s*createClient\s+as\s+(\w+)\s*\}\s*from\s*['"]@supabase\/supabase-js['"]/g,
     `import { createAdminClient } from '@/utils/postgres/admin'`],

    // Fix broken: "import { as createSupabaseClient } from '@supabase/supabase-js'"
    [/import\s*\{\s*as\s+createSupabaseClient\s*\}\s*from\s*['"]@supabase\/supabase-js['"]/g,
     `import { createAdminClient } from '@/utils/postgres/admin'`],

    // Dynamic imports: const { createClient } = await import('@supabase/supabase-js')
    [/const\s*\{\s*createClient(?:\s*:\s*\w+)?\s*\}\s*=\s*await\s+import\s*\(\s*['"]@supabase\/supabase-js['"]\s*\)\s*;?\s*\n?/g,
     ''],

    // Remaining static: import { createClient } from '@supabase/supabase-js'
    [/import\s*\{\s*createClient\s*\}\s*from\s*['"]@supabase\/supabase-js['"]/g,
     `import { createAdminClient } from '@/utils/postgres/admin'`],

    // Type imports: import type { User } from '@supabase/supabase-js'
    [/import\s+type\s+\{\s*User(?:\s+as\s+\w+)?\s*\}\s*from\s*['"]@supabase\/supabase-js['"]\s*\n?/g,
     ''],

    // Type imports: import type { SupabaseClient } from '@supabase/supabase-js'
    [/import\s+type\s+\{\s*SupabaseClient(?:\s+as\s+\w+)?\s*\}\s*from\s*['"]@supabase\/supabase-js['"]\s*\n?/g,
     ''],

    // Type: import { SupabaseClient } from '@supabase/supabase-js' (non-type)
    [/import\s*\{\s*SupabaseClient\s*\}\s*from\s*['"]@supabase\/supabase-js['"]\s*\n?/g,
     ''],

    // Replace createServiceClient(url, key) → createAdminClient()
    [/createServiceClient\s*\([^)]*\)/g, 'createAdminClient()'],

    // Replace createSvc(url, key) → createAdminClient() (dynamic import was removed)
    [/createSvc\s*\(\s*env\.SUPABASE_URL[^)]*\)/g, 'createAdminClient()'],

    // Replace createSbClient(url, key) → createAdminClient()
    [/createSbClient\s*\(\s*env\.SUPABASE_URL[^)]*\)/g, 'createAdminClient()'],

    // Replace remaining createClient(url, key) patterns
    [/createClient\s*\(\s*env\.SUPABASE_URL[^)]*\)/g, 'createAdminClient()'],

    // Replace SupabaseClient type usages in function signatures
    [/:\s*SupabaseClient<[^>]*>/g, ': DbClient'],
    [/SupabaseClient\b/g, 'DbClient'],

    // Replace User type from supabase with SessionUser (used in bookings, preferences)
    // Only replace if it's used as a parameter type in these service files
];

let totalModified = 0;

for (const file of getAllFiles(SRC_DIR)) {
    const normalised = file.replace(/\\/g, '/');
    const original = readFileSync(file, 'utf8');
    let content = original;

    for (const [pattern, replacement] of replacements) {
        content = content.replace(pattern, replacement);
    }

    // Add DbClient import if SupabaseClient was replaced and the file uses DbClient
    if (content !== original && content.includes(': DbClient') && !content.includes("from '@/lib/db/query-builder'")) {
        // Add import at top
        const firstImport = content.indexOf('import ');
        if (firstImport !== -1) {
            content = content.slice(0, firstImport) +
                `import type { DbClient } from '@/lib/db/query-builder';\n` +
                content.slice(firstImport);
        }
    }

    // Add createAdminClient import if used but not yet imported
    if (content.includes('createAdminClient()') && !content.includes("from '@/utils/postgres/admin'")) {
        const firstImport = content.indexOf('import ');
        if (firstImport !== -1) {
            content = content.slice(0, firstImport) +
                `import { createAdminClient } from '@/utils/postgres/admin';\n` +
                content.slice(firstImport);
        }
    }

    if (content !== original) {
        writeFileSync(file, content, 'utf8');
        console.log('✓ Fixed:', normalised);
        totalModified++;
    }
}

console.log(`\nFixed ${totalModified} files.`);
