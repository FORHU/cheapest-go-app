/**
 * Move every workflow off npm and onto pnpm, so one lockfile governs CI and the image.
 *
 * Both lockfiles were committed and neither tool updated the other, so a dependency added
 * with one left the other stale — which is how the AWS SDK reached main with a
 * package-lock.json that did not contain it, failing `npm ci` before CI reached typecheck.
 * The Dockerfile was already on pnpm and is the fussier of the two, so pnpm wins.
 *
 *   node scratch/switch-ci-to-pnpm.mjs
 */
import fs from 'fs';

const PNPM_VERSION = '10.32.1'; // keep in step with the Dockerfile

const setupBlock = nodeVersion => `      # pnpm, not npm. Both lockfiles used to be committed and neither tool updated the
      # other, so a dependency added with one left CI installing from a stale lockfile —
      # which is how the AWS SDK reached main with a package-lock.json that did not have
      # it. package-lock.json is gone; pnpm-lock.yaml is the only lockfile now.
      #
      # Pinned to the version the lockfile was produced by, and kept in step with the
      # Dockerfile: pnpm 10 changed lockfile handling mid-series, so an unpinned install
      # can fail on a lockfile nobody has touched.
      - uses: pnpm/action-setup@v4
        with:
          version: ${PNPM_VERSION}
      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: pnpm
`;

const FILES = {
    'ci.yml': '24',
    'cron-etg-dump-sync.yml': "'20'",
    'deploy-production.yml': '24',
    'deploy-airanggo.yml': '24',
};

for (const [file, nodeVersion] of Object.entries(FILES)) {
    const path = '.github/workflows/' + file;
    let source = fs.readFileSync(path, 'utf8');

    if (source.includes('pnpm/action-setup')) {
        console.log(`${file}: already on pnpm`);
        continue;
    }

    // Find the setup-node block by its literal text rather than by regex — the node-version
    // values contain quotes and dots that would have to be escaped, and a mis-escaped
    // pattern here silently matches nothing.
    const target = `      - uses: actions/setup-node@v4\n        with:\n          node-version: ${nodeVersion}\n`;
    if (!source.includes(target)) {
        console.log(`${file}: SETUP BLOCK NOT FOUND — left unchanged`);
        continue;
    }
    source = source.replace(target, setupBlock(nodeVersion));

    // `--ignore-scripts` is kept where it was: the repo pins onlyBuiltDependencies in
    // pnpm-workspace.yaml, and CI has no reason to run install hooks to typecheck.
    source = source.split('npm ci --ignore-scripts').join('pnpm install --frozen-lockfile --ignore-scripts');
    source = source.split('run: npm ci\n').join('run: pnpm install --frozen-lockfile\n');
    source = source.split('npm test -- --run').join('pnpm test -- --run');
    source = source.split('npx tsc --noEmit').join('pnpm exec tsc --noEmit');

    fs.writeFileSync(path, source);
    console.log(`${file}: patched`);
}
