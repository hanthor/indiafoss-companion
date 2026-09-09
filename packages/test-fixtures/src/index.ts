/**
 * Golden fixtures for the versioned contracts in `@indiafoss/model/contracts`.
 *
 * These files are the cross-language conformance suite. The TypeScript
 * validators, the Kotlin core and any future Swift adapter all read the *same*
 * JSON and must agree on which cases are accepted and which are rejected. That
 * agreement is the only thing standing between three hand-written parsers and
 * silent divergence — see ADR 0009.
 *
 * ## Layout
 *
 * ```
 * fixtures/
 *   index.json                    the machine-readable case list
 *   <contract>/valid/<case>.json
 *   <contract>/invalid/<case>.json
 * ```
 *
 * `index.json` is the contract between platforms. A non-TypeScript runner
 * reads it, loads each file, and asserts the outcome — without needing to
 * parse TypeScript or agree on exact issue wording. Invalid cases carry
 * `expectIssue`, a substring the reported message must contain, so wording can
 * improve without breaking other platforms.
 *
 * ## Adding a case
 *
 * Add the JSON file, add its entry to `index.json`, run `pnpm -r test`. A
 * contract change is not complete until its invalid cases change with it: a
 * validator with no rejection fixtures has not been shown to reject anything.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const test_fixturesVersion = '0.1.0';

/** Contracts covered by the fixture suite. Matches the module names. */
export type ContractName =
  | 'event-manifest'
  | 'conference-directory'
  | 'contact-card'
  | 'identity-binding'
  | 'app-handoff'
  | 'capability-record'
  | 'personal-data';

/** One fixture case as listed in `index.json`. */
export interface FixtureCase {
  /** File name within the contract's `valid/` or `invalid/` directory. */
  file: string;
  /** Why this case exists. Shows up in the test name, so make it a sentence. */
  describes: string;
  /**
   * For invalid cases: a substring the reported issue must contain. Absent on
   * valid cases.
   */
  expectIssue?: string;
}

export interface ContractFixtures {
  valid: FixtureCase[];
  invalid: FixtureCase[];
}

/** The whole suite, as loaded from `index.json`. */
export type FixtureIndex = Record<ContractName, ContractFixtures>;

/**
 * Resolve a path relative to the repository root by walking up to the
 * `pnpm-workspace.yaml` marker — same approach as
 * `@indiafoss/sources`, and robust to vitest transforms.
 */
export function repoRoot(...parts: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break;
    dir = dirname(dir);
  }
  return join(dir, ...parts);
}

/** Absolute path to the fixture tree, for non-TypeScript runners. */
export function fixturesDir(...parts: string[]): string {
  return repoRoot('packages', 'test-fixtures', 'fixtures', ...parts);
}

/** Load and parse `fixtures/index.json`. */
export function loadFixtureIndex(): FixtureIndex {
  return JSON.parse(readFileSync(fixturesDir('index.json'), 'utf8')) as FixtureIndex;
}

/**
 * Load one fixture's parsed JSON.
 *
 * Returns `unknown` on purpose: these are the untrusted-input cases, and
 * handing back a typed value would defeat what the validators are being
 * tested for.
 */
export function loadFixture(
  contract: ContractName,
  validity: 'valid' | 'invalid',
  file: string,
): unknown {
  return JSON.parse(readFileSync(fixturesDir(contract, validity, file), 'utf8')) as unknown;
}

/** Every case in the suite, flattened, for a table-driven test. */
export function allFixtureCases(): {
  contract: ContractName;
  validity: 'valid' | 'invalid';
  fixture: FixtureCase;
}[] {
  const index = loadFixtureIndex();
  const cases: {
    contract: ContractName;
    validity: 'valid' | 'invalid';
    fixture: FixtureCase;
  }[] = [];
  for (const [contract, group] of Object.entries(index) as [ContractName, ContractFixtures][]) {
    for (const fixture of group.valid) cases.push({ contract, validity: 'valid', fixture });
    for (const fixture of group.invalid) cases.push({ contract, validity: 'invalid', fixture });
  }
  return cases;
}
