/**
 * Migration script: replace @supabase/supabase-js database client usage
 * with the new postgres.js-based client.
 *
 * Run once: node scripts/migrate-supabase-imports.mjs
 *
 * Transforms:
 *   import { createClient } from '@supabase/supabase-js'
 *   const supabase = createClient(url, key)
 *
 * → import { createAdminClient } from '@/utils/postgres/admin'
 *   const supabase = createAdminClient()
 *
 * Also replaces type imports:
 *   import type { SupabaseClient } from '@supabase/supabase-js'
 * → import type { DbClient } from '@/lib/db/query-builder'
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_DIR = './src';
const EXTENSIONS = ['.ts', '.tsx'];

// Files to skip (they have already been migrated or should be left alone)
const SKIP_FILES = [
    'src/lib/db/postgres.ts',
    'src/lib/db/query-builder.ts',
    'src/utils/postgres/server.ts',
    'src/utils/postgres/admin.ts',
    'src/utils/postgres/client.ts',
    'src/utils/postgres/middleware.ts',
    'src/utils/postgres/functions.ts',
    'src/lib/auth/lucia.ts',
    'src/lib/auth/session.ts',
    'src/lib/server/auth.ts',
    'src/lib/server/admin/auth.ts',
    'src/stores/authStore.ts',
    'src/middleware.ts',
];

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

let totalModified = 0;

for (const file of getAllFiles(SRC_DIR)) {
    const normalised = file.replace(/\\/g, '/');
    if (SKIP_FILES.some(s => normalised.includes(s))) continue;

    const original = readFileSync(file, 'utf8');
    let content = original;

    // 1. Replace type-only import for SupabaseClient
    content = content.replace(
        /import\s+type\s+\{([^}]*?)SupabaseClient([^}]*?)\}\s+from\s+['"]@supabase\/supabase-js['"]/g,
        (match, before, after) => {
            const otherTypes = (before + after).split(',').map(s => s.trim()).filter(Boolean).filter(s => s !== 'SupabaseClient');
            const parts = [];
            if (otherTypes.length > 0) {
                parts.push(`import type { ${otherTypes.join(', ')} } from '@supabase/supabase-js'`);
            }
            parts.push(`import type { DbClient } from '@/lib/db/query-builder'`);
            return parts.join('\n');
        }
    );

    // 2. Replace mixed import that includes createClient + SupabaseClient
    content = content.replace(
        /import\s*\{([^}]*?)createClient([^}]*?)\}\s+from\s+['"]@supabase\/supabase-js['"]/g,
        (match, before, after) => {
            const others = (before + after).split(',').map(s => s.trim()).filter(Boolean).filter(s => s !== 'createClient' && s !== '');
            const parts = [`import { createAdminClient } from '@/utils/postgres/admin'`];
            if (others.length > 0) {
                parts.unshift(`import { ${others.join(', ')} } from '@supabase/supabase-js'`);
            }
            return parts.join('\n');
        }
    );

    // 3. Replace type-only imports for User, Session that come from supabase
    // Only if the file no longer uses any supabase features for User/Session
    // (auth.ts replacements already done — skip those)

    // 4. Replace createClient(url, key) call patterns with createAdminClient()
    content = content.replace(
        /createClient\s*\(\s*(?:env\.SUPABASE_URL|supabaseUrl|process\.env\.NEXT_PUBLIC_SUPABASE_URL)[^)]*\)/g,
        'createAdminClient()'
    );

    // 5. Replace SupabaseClient type in function parameters/return types
    content = content.replace(/:\s*SupabaseClient\b/g, ': DbClient');
    content = content.replace(/<SupabaseClient>/g, '<DbClient>');
    content = content.replace(/SupabaseClient\s*\|/g, 'DbClient |');
    content = content.replace(/\|\s*SupabaseClient/g, '| DbClient');

    if (content !== original) {
        writeFileSync(file, content, 'utf8');
        console.log('✓ Migrated:', normalised);
        totalModified++;
    }
}

console.log(`\nMigration complete. Modified ${totalModified} files.`);
console.log('\nRemaining steps:');
console.log('1. Run: pnpm tsc --noEmit  (fix any type errors)');
console.log('2. Remove @supabase/supabase-js from package.json once all imports are gone');
console.log('3. Remove @supabase/ssr from package.json once src/utils/supabase/ is fully replaced');
