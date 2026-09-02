// Patch the generated Capacitor Android project (created by `cap add android`)
// into a Material 3 shell with IndiaFOSS branding and indiafoss:// deep links.
//
// The android/ directory is generated in CI and locally, never committed, so
// this script is idempotent and re-applied on every `pnpm --filter @indiafoss/android build`.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const android = join(root, 'android');
const app = join(android, 'app');

if (!existsSync(android)) {
  console.log('material3: android/ not generated yet — run `cap add android` first');
  process.exit(0);
}

function patch(file, fn) {
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`material3: patched ${file.replace(root + '/', '')}`);
  }
}

// 1. Material Components dependency (provides Theme.Material3.*).
patch(join(android, 'variables.gradle'), (s) =>
  s.includes('materialComponentsVersion')
    ? s
    : s.replace(/\n}\s*$/, "\n    materialComponentsVersion = '1.13.0'\n}\n"),
);
patch(join(app, 'build.gradle'), (s) =>
  s.includes('com.google.android.material')
    ? s
    : s.replace(
        /implementation "androidx\.appcompat:appcompat:\$androidxAppCompatVersion"/,
        (m) =>
          `${m}\n    implementation "com.google.android.material:material:$materialComponentsVersion"`,
      ),
);

// 2. Resource overlay: theme, colours, strings, splash + adaptive icon vectors.
cpSync(join(root, 'res'), join(app, 'src', 'main', 'res'), { recursive: true, force: true });
console.log('material3: copied res/ overlay');

// 3. Deep links: indiafoss://… intent filter on the single-task activity.
patch(join(app, 'src', 'main', 'AndroidManifest.xml'), (s) => {
  if (s.includes('android:scheme="indiafoss"')) return s;
  const filter = `
            <intent-filter android:autoVerify="false">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="indiafoss" />
            </intent-filter>
`;
  return s.replace(
    /(<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>)/,
    `$1${filter}`,
  );
});
