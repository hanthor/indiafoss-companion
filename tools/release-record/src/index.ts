import { CAPABILITIES } from '@indiafoss/model';
import { collectCapabilityRecordIssues } from '@indiafoss/model/contracts';
import type { CapabilityRecord, ComponentPin } from '@indiafoss/model/contracts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `release-record` (C-11): assemble a draft capability record from the exact
 * pins the repository carries, validate it with the owning contract, and
 * write it beside the evidence it will point at.
 *
 * The tool emits **pins**. It never invents a claim: every capability in the
 * namespace starts as `supported: false` at `implemented`, the honest
 * default, so the person filling the record in must actively upgrade a claim
 * from evidence rather than remember to downgrade one.
 */
export interface DraftInputs {
  id: string;
  recordedAt: string;
  eventId?: string;
  /** This repository's commit. */
  companionRevision: string;
  /** Parsed `patches/neutrino/version.json`. */
  pin: NeutrinoPin;
  /** `hanthor/indiafoss-chat-android` commit the APK was built from, when known. */
  chatRevision?: string;
  /** The bindings version string from Chat's `gradle/libs.versions.toml`. */
  bindingsVersion?: string;
  /** SHA-256 of the bindings `.aar` Chat pins. */
  aarSha256?: string;
  /** SHA-256 of the published Chat APK. */
  apkSha256?: string;
}

export interface NeutrinoPin {
  version: string;
  commit: string;
  source: string;
  neutrino: { repo: string; rev: string };
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function readNeutrinoPin(
  path = join(REPO_ROOT, 'patches', 'neutrino', 'version.json'),
): NeutrinoPin {
  return JSON.parse(readFileSync(path, 'utf8')) as NeutrinoPin;
}

/** Pins only; claims are the honest default and wait for evidence. */
export function buildDraftRecord(inputs: DraftInputs): CapabilityRecord {
  const components: ComponentPin[] = [
    {
      name: 'companion',
      revision: inputs.companionRevision,
      source: 'https://github.com/hanthor/indiafoss-companion',
    },
    {
      name: 'neutrino',
      revision: inputs.pin.neutrino.rev,
      source: `https://github.com/${inputs.pin.neutrino.repo}`,
    },
    {
      name: 'neutrino-iroh',
      revision: inputs.pin.commit,
      source: inputs.pin.source,
      ...(inputs.aarSha256 ? { checksum: `sha256:${inputs.aarSha256}` } : {}),
    },
  ];
  if (inputs.chatRevision) {
    components.push({
      name: 'chat-android',
      revision: inputs.chatRevision,
      source: inputs.bindingsVersion
        ? `https://github.com/hanthor/indiafoss-chat-android (bindings ${inputs.bindingsVersion})`
        : 'https://github.com/hanthor/indiafoss-chat-android',
      ...(inputs.apkSha256 ? { checksum: `sha256:${inputs.apkSha256}` } : {}),
    });
  }
  return {
    schemaVersion: 1,
    id: inputs.id,
    recordedAt: inputs.recordedAt,
    ...(inputs.eventId ? { eventId: inputs.eventId } : {}),
    components,
    claims: CAPABILITIES.map((capability) => ({
      name: capability.name,
      supported: false,
      level: 'implemented' as const,
      limitations:
        'Not yet recorded against evidence; fill in from docs/evidence or leave as not run.',
    })),
  };
}

/** Throw with every issue rather than write an invalid record. */
export function assertValidRecord(record: unknown): asserts record is CapabilityRecord {
  const issues = collectCapabilityRecordIssues(record);
  if (issues.length > 0) {
    throw new Error(`refusing to write an invalid capability record:\n  ${issues.join('\n  ')}`);
  }
}

export function writeRecord(
  record: CapabilityRecord,
  dir = join(REPO_ROOT, 'docs', 'evidence', 'records'),
): string {
  assertValidRecord(record);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.id}.json`);
  if (existsSync(path)) throw new Error(`${path} already exists; records are never overwritten`);
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  return path;
}

function readArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      out[arg.slice(2)] = 'true';
    } else {
      out[arg.slice(2)] = value;
      i += 1;
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2)): void {
  const args = readArgs(argv);
  const companionRevision = args['companion'] ?? gitHead();
  const record = buildDraftRecord({
    id: args['id'] ?? `draft-${new Date().toISOString().slice(0, 10)}`,
    recordedAt: new Date().toISOString(),
    eventId: args['event'],
    companionRevision,
    pin: readNeutrinoPin(),
    chatRevision: args['chat'] || undefined,
    bindingsVersion: args['bindings'] || undefined,
    aarSha256: args['aar-sha256'] || undefined,
    apkSha256: args['apk-sha256'] || undefined,
  });
  const path = writeRecord(record);
  console.log(
    `wrote ${path}: ${record.components.length} pins, ${record.claims.length} claims at the honest default`,
  );
  console.log(
    'Fill in claims from docs/evidence, then validate again: nothing here is a device result.',
  );
}

function gitHead(): string {
  const head = readFileSync(join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
  if (!head.startsWith('ref:')) return head;
  return readFileSync(join(REPO_ROOT, '.git', head.slice(4).trim()), 'utf8').trim();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
