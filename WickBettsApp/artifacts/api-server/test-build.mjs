/**
 * Builds and runs the Clerk auth smoke tests.
 * Uses esbuild-plugin-pino so pino's worker threads are placed correctly.
 *
 * Usage: node test-build.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { spawnSync } from "node:child_process";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(artifactDir, "dist/test");
const testEntries = {
  "clerk.test": path.resolve(artifactDir, "src/routes/clerk.test.ts"),
  "stripe.test": path.resolve(artifactDir, "src/routes/stripe.test.ts"),
};

await esbuild({
  entryPoints: testEntries,
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  external: [
    // supertest must stay external so its http-server helpers work correctly
    "supertest",
    // Native addons / optional deps that cannot be bundled
    "*.node",
    "pg-native",
    "bufferutil",
    "utf-8-validate",
  ],
  sourcemap: "inline",
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
  },
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
});

// Run the compiled test suite
const result = spawnSync(
  process.execPath,
  ["--test", "--test-force-exit", ...Object.keys(testEntries).map((name) => path.resolve(outDir, `${name}.mjs`))],
  { stdio: "inherit" },
);
process.exit(result.status ?? 0);
