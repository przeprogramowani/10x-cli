// Configuration for the repo-map wide-scan engine (10x-cli).
//
// The one place to tune the scan for this repo. Plain data: which modules exist,
// how deep to bucket churn, which paths are noise, and which root the dependency
// graph analyses. Engine code (lib.mjs, scan.mjs) is generic — ported verbatim
// from przeprogramowani-edu; only this file is repo-specific.

export const config = {
  // Human label used in the synthesized map title.
  repoLabel: '10x-cli',

  // How far back the git-history signals look. Stated on the map as a limitation.
  since: '12 months ago',

  // Depth used when bucketing churn into "areas". 2 => src/commands, src/lib.
  areaDepth: 2,

  // How many rows each ranked table keeps.
  topN: 15,

  // Noise for an architecture map: lockfiles, generated code, artifacts.
  noise: ['bun.lock', 'package-lock.json', 'node_modules/', 'dist/', 'src/generated/'],
  noiseExt: ['.lock', '.png', '.jpg', '.svg', '.ico', '.map', '.snap'],

  // The modules that make up this repo. Single-package CLI: the interesting
  // split is commands vs lib vs tests.
  modules: [
    { label: 'commands (CLI surface)', root: 'src/commands', app: 'commands' },
    { label: 'lib (core logic)', root: 'src/lib', app: 'lib' },
    { label: 'tests', root: 'tests', app: 'tests' },
  ],

  // The module the structural graph zooms into by default.
  primaryModule: 'src',

  // Source extensions the dependency-graph tools follow.
  sourceExt: ['ts', 'tsx', 'js', 'mjs', 'cjs'],

  // Paths the dependency graph excludes — tests, generated, vendored.
  graphExclude: 'node_modules|\\.test\\.|\\.spec\\.|src/generated|\\.d\\.ts$',

  // Where artifacts land. Relative to repo root.
  outDir: 'context/map',
};

export default config;
