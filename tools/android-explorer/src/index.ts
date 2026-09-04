/**
 * Exploratory UI pass: Claude drives the installed companion on an emulator
 * by looking at screenshots, and writes down what it found.
 *
 * This is deliberately **not** a gate. It is non-deterministic, it costs money
 * per run, and its API key is unavailable to pull requests from forks — three
 * properties that disqualify it from blocking a merge. The Maestro flows in
 * `.maestro/` are the gate; this is the thing that goes looking for problems
 * nobody wrote an assertion for, on demand.
 *
 * What it is good at is the class of bug an assertion cannot express: a
 * control that is invisible against its background, a screen that says
 * nothing while it loads, a tap target the size of a full stop, a label that
 * contradicts the screen it is on.
 *
 * Usage: `pnpm --filter @indiafoss/android-explorer start`, with a booted
 * emulator, the app installed, and ANTHROPIC_API_KEY set.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const APP_ID = process.env.EXPLORER_APP_ID ?? 'org.indiafoss.companion.nativeapp';
const OUT_DIR = process.env.EXPLORER_OUT ?? 'emulator-artifacts';
/** Hard ceiling on turns, so a confused run cannot bill indefinitely. */
const MAX_STEPS = Number(process.env.EXPLORER_MAX_STEPS ?? 25);

interface Finding {
  severity: 'high' | 'medium' | 'low';
  screen: string;
  summary: string;
  detail: string;
}

const findings: Finding[] = [];

function adb(args: string[]): string {
  return execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** A PNG of what is on screen right now, base64 for the API. */
function screenshot(): string {
  const png = execFileSync('adb', ['exec-out', 'screencap', '-p'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return png.toString('base64');
}

function imageBlock(base64: string): Anthropic.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } };
}

/**
 * The tools are the whole action space. Keeping it this small — four gestures
 * and two bookkeeping calls — is what keeps the loop legible when it goes
 * wrong: every step in the transcript is one gesture with coordinates you can
 * replay by hand.
 */
const tools: Anthropic.Tool[] = [
  {
    name: 'tap',
    description: 'Tap the screen at a point, in device pixels from the top-left.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer', description: 'Horizontal pixel coordinate.' },
        y: { type: 'integer', description: 'Vertical pixel coordinate.' },
        why: { type: 'string', description: 'What you expect this tap to do.' },
      },
      required: ['x', 'y', 'why'],
      additionalProperties: false,
    },
  },
  {
    name: 'swipe',
    description: 'Swipe between two points over 300ms. Use for scrolling.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        x1: { type: 'integer' },
        y1: { type: 'integer' },
        x2: { type: 'integer' },
        y2: { type: 'integer' },
        why: { type: 'string', description: 'What you expect this swipe to do.' },
      },
      required: ['x1', 'y1', 'x2', 'y2', 'why'],
      additionalProperties: false,
    },
  },
  {
    name: 'press_back',
    description: 'Press the Android back button.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'type_text',
    description: 'Type into the focused input. Tap the field first.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'report_finding',
    description:
      'Record a problem worth a human reading. Be specific and describe what you saw, ' +
      'not what you infer. Do not report the same problem twice.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        screen: { type: 'string', description: 'Which screen, e.g. "Map" or "Schedule".' },
        summary: { type: 'string', description: 'One line.' },
        detail: { type: 'string', description: 'What you saw and why it is a problem.' },
      },
      required: ['severity', 'screen', 'summary', 'detail'],
      additionalProperties: false,
    },
  },
  {
    name: 'finish',
    description: 'Stop exploring. Call this when you have covered the app or run out of ideas.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string', description: 'What you covered, in a paragraph.' } },
      required: ['summary'],
      additionalProperties: false,
    },
  },
];

const SYSTEM = `You are exploring an Android conference companion app on an emulator, looking for
problems a human tester would report.

The app is offline-first: a schedule, a personal plan, a venue map, and search. It is
built for someone standing in a hallway between talks, on a bad network, in a hurry.

How to work:
- Look at the screenshot before every action. Say what you see, then act.
- Cover the five primary tabs, then go a level deeper: open a session, search for
  something, move around the map.
- Report a finding the moment you see one; do not save them for the end.
- Judge what is actually on screen. Do not report a problem you cannot see, and do not
  speculate about code you cannot read.

What is worth reporting: text that is unreadable or clipped, controls that are hard to
see or hit, a screen that gives no feedback while it loads, a label that does not match
what it does, anything that looks broken, and anything that would confuse someone using
this for the first time in a corridor.

What is not worth reporting: aesthetic preferences, the emulator's own status bar, and
missing features. Judge the app that exists.

Call finish when you have covered the app. Fewer, real findings beat a long list.`;

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // Start from the app's own first screen rather than whatever the emulator
  // happened to be showing, so a run is comparable to the one before it.
  adb(['shell', 'monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1']);
  await new Promise((r) => setTimeout(r, 5000));

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [
        imageBlock(screenshot()),
        {
          type: 'text',
          text: 'This is the app as it opens. Explore it and report what you find.',
        },
      ],
    },
  ];

  let finishSummary = 'The run ended without the agent calling finish.';
  let step = 0;

  for (; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8192,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      tools,
      messages,
    });

    // Thinking blocks have to go back unchanged, so append the whole content
    // array rather than picking the text out of it.
    messages.push({ role: 'assistant', content: response.content });

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) console.log(`\n${block.text.trim()}`);
    }

    if (response.stop_reason === 'refusal') {
      finishSummary = `The model declined to continue: ${response.stop_details?.explanation ?? 'no explanation given'}`;
      break;
    }
    if (response.stop_reason !== 'tool_use') {
      finishSummary = 'The model stopped without calling a tool.';
      break;
    }

    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    let done = false;

    for (const call of calls) {
      // Tool inputs are JSON from the model; treat them as data, and never
      // string-match the serialized form.
      const input = call.input as Record<string, unknown>;
      let result = 'done';

      switch (call.name) {
        case 'tap':
          adb(['shell', 'input', 'tap', String(input.x), String(input.y)]);
          console.log(`  tap ${String(input.x)},${String(input.y)} — ${String(input.why)}`);
          break;
        case 'swipe':
          adb([
            'shell',
            'input',
            'swipe',
            String(input.x1),
            String(input.y1),
            String(input.x2),
            String(input.y2),
            '300',
          ]);
          console.log(`  swipe — ${String(input.why)}`);
          break;
        case 'press_back':
          adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
          console.log('  back');
          break;
        case 'type_text':
          adb(['shell', 'input', 'text', String(input.text).replace(/ /g, '%s')]);
          console.log(`  type "${String(input.text)}"`);
          break;
        case 'report_finding':
          findings.push(input as unknown as Finding);
          console.log(`  ⚑ ${String(input.severity)}: ${String(input.summary)}`);
          break;
        case 'finish':
          finishSummary = String(input.summary);
          done = true;
          break;
        default:
          result = `unknown tool ${call.name}`;
      }

      results.push({ type: 'tool_result', tool_use_id: call.id, content: result });
    }

    if (done) break;

    // The app needs a moment to settle before the next frame is worth looking
    // at; a screenshot taken mid-transition wastes a turn on a blur.
    await new Promise((r) => setTimeout(r, 1200));

    messages.push({
      role: 'user',
      content: [...results, imageBlock(screenshot()), { type: 'text', text: 'The screen now.' }],
    });
  }

  writeReport(finishSummary, step);
}

function writeReport(summary: string, steps: number): void {
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);

  const lines = [
    '# Exploratory UI pass',
    '',
    `Claude drove the app for ${steps} step${steps === 1 ? '' : 's'} and recorded ` +
      `${findings.length} finding${findings.length === 1 ? '' : 's'}.`,
    '',
    '> These are observations from one non-deterministic run, not test failures.',
    '> Confirm each one before acting on it.',
    '',
    '## What it covered',
    '',
    summary,
    '',
    '## Findings',
    '',
  ];

  if (sorted.length === 0) {
    lines.push('None recorded.');
  } else {
    for (const f of sorted) {
      lines.push(`### ${f.severity} · ${f.screen} — ${f.summary}`, '', f.detail, '');
    }
  }

  const path = join(OUT_DIR, 'exploration.md');
  writeFileSync(path, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${path} (${findings.length} findings).`);
}

main().catch((error: unknown) => {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error('ANTHROPIC_API_KEY is missing or rejected.');
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error('Rate limited before the run could finish.');
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Claude API error ${String(error.status)}: ${error.message}`);
  } else {
    console.error(error);
  }
  // Exploration is advisory: a failure here must not read as a broken app.
  writeReport('The run did not complete; see the job log.', 0);
  process.exit(1);
});
