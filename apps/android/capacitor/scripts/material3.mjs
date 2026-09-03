// Patch the generated Capacitor Android project (created by `cap add android`)
// into a Material 3 shell with IndiaFOSS branding and indiafoss:// deep links.
//
// The android/ directory is generated in CI and locally, never committed, so
// this script is idempotent and re-applied on every `pnpm --filter @indiafoss/android build`.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// 3b. Local reminders: Android 13+ needs the runtime notification permission and
//     exact alarms for "leave now" timing (@capacitor/local-notifications).
patch(join(app, 'src', 'main', 'AndroidManifest.xml'), (s) => {
  if (s.includes('android.permission.POST_NOTIFICATIONS')) return s;
  return s.replace(
    '<uses-permission android:name="android.permission.INTERNET" />',
    (m) =>
      `${m}\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />`,
  );
});

// 3c. QR scanning uses getUserMedia in the WebView; Capacitor only grants the
//     WebView's permission request when the app itself declares CAMERA.
patch(join(app, 'src', 'main', 'AndroidManifest.xml'), (s) => {
  if (s.includes('android.permission.CAMERA')) return s;
  return s.replace(
    '<uses-permission android:name="android.permission.INTERNET" />',
    (m) =>
      `${m}\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />`,
  );
});

// 4. Optional P2P chat: the Neutrino plugin, compiled in only when the bindings
//    .aar is present in neutrino/libs (scripts/fetch-neutrino.mjs downloads it
//    from our own release; neutrino-bindings.yml builds it from source). No
//    token: GitHub Packages will not serve the upstream artifact anonymously,
//    so we publish a build of it that anyone can fetch.
const KOTLIN_VERSION = '2.3.21';
const pin = JSON.parse(readFileSync(join(root, 'neutrino', 'version.json'), 'utf8'));
const bindings = join(root, 'neutrino', 'libs', `neutrino-bindings-${pin.version}.aar`);
const bindingsAvailable = existsSync(bindings);
const pluginSrc = join(root, 'neutrino', 'NeutrinoPlugin.kt');
const pluginDir = join(app, 'src', 'main', 'java', 'org', 'indiafoss', 'companion');
const pluginDst = join(pluginDir, 'NeutrinoPlugin.kt');
const mainActivity = join(pluginDir, 'MainActivity.java');

// MainActivity is written whole rather than regex-patched: the body depends on
// whether the Neutrino plugin is compiled in, and two independent patches racing
// over the same file is how the Material You call got lost before.
function writeMainActivity({ neutrino }) {
  const source = readFileSync(mainActivity, 'utf8');
  const header = source.slice(0, source.indexOf('public class MainActivity'));
  const body = [
    '    @Override',
    '    public void onCreate(android.os.Bundle savedInstanceState) {',
    // Material You: seed the window from the wallpaper before the WebView
    // exists, so the splash and system bars follow it too. No-op below API 31.
    '        com.google.android.material.color.DynamicColors.applyToActivityIfAvailable(this);',
    // The web layer reads the same scheme for its Material look.
    '        registerPlugin(MaterialYouPlugin.class);',
    ...(neutrino ? ['        registerPlugin(NeutrinoPlugin.class);'] : []),
    '        super.onCreate(savedInstanceState);',
    '    }',
  ].join('\n');
  const next = `${header}public class MainActivity extends BridgeActivity {\n${body}\n}\n`;
  if (next !== source) {
    writeFileSync(mainActivity, next);
    console.log(`material3: wrote ${mainActivity.replace(root + '/', '')}`);
  }
}

// 3d. Material You colours for the web layer's Material look (plain Java: the
//     Kotlin plugin is only applied when the Neutrino bindings are present).
mkdirSync(pluginDir, { recursive: true });
cpSync(
  join(root, 'materialyou', 'MaterialYouPlugin.java'),
  join(pluginDir, 'MaterialYouPlugin.java'),
  {
    force: true,
  },
);
console.log('material3: installed MaterialYouPlugin.java');

if (bindingsAvailable) {
  patch(join(android, 'build.gradle'), (s) =>
    s.includes('kotlin-gradle-plugin')
      ? s
      : s.replace(
          /classpath 'com\.android\.tools\.build:gradle:[^']+'/,
          (m) =>
            `${m}\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}'`,
        ),
  );
  // The .aar is consumed as a local file dependency, so no remote repository —
  // and no credentials — are involved in the build at all.
  mkdirSync(join(app, 'libs'), { recursive: true });
  cpSync(bindings, join(app, 'libs', 'neutrino-bindings.aar'), { force: true });
  patch(join(app, 'build.gradle'), (s) => {
    let out = s;
    if (!out.includes('org.jetbrains.kotlin.android')) {
      out = out.replace(
        "apply plugin: 'com.android.application'",
        "apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'",
      );
    }
    if (!out.includes('neutrino-bindings.aar')) {
      // A local .aar carries no POM, so the bindings' own dependencies are
      // declared here: coroutines and core-ktx back the bundled blew BLE
      // managers, and JNA is compileOnly upstream ("element x provides JNA")
      // because uniffi's generated Kotlin loads libneutrino.so through it.
      out = out.replace(
        /implementation "androidx\.appcompat:appcompat:\$androidxAppCompatVersion"/,
        (m) =>
          `${m}\n    implementation files('libs/neutrino-bindings.aar')` +
          `\n    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3"` +
          `\n    implementation "androidx.core:core-ktx:1.9.0"` +
          `\n    implementation "androidx.annotation:annotation:1.7.1"` +
          `\n    implementation "net.java.dev.jna:jna:5.14.0@aar"`,
      );
    }
    if (!out.includes('jvmTarget')) {
      out +=
        '\nkotlin {\n    compilerOptions {\n        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)\n    }\n}\n';
    }
    return out;
  });
  mkdirSync(pluginDir, { recursive: true });
  cpSync(pluginSrc, pluginDst, { force: true });
  console.log('material3: installed NeutrinoPlugin.kt');
  writeMainActivity({ neutrino: true });
  patch(join(app, 'src', 'main', 'AndroidManifest.xml'), (s) => {
    if (s.includes('android.permission.BLUETOOTH_SCAN')) return s;
    const perms = `
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
`;
    return s.replace(
      '<uses-permission android:name="android.permission.INTERNET" />',
      (m) => `${m}${perms}`,
    );
  });
} else {
  // Plain companion: make sure nothing from an earlier token build lingers so
  // the generated project still compiles without the bindings.
  if (existsSync(pluginDst)) rmSync(pluginDst);
  if (existsSync(join(app, 'libs', 'neutrino-bindings.aar'))) {
    rmSync(join(app, 'libs', 'neutrino-bindings.aar'));
  }
  writeMainActivity({ neutrino: false });
  patch(join(app, 'build.gradle'), (s) =>
    s
      .replace("\napply plugin: 'org.jetbrains.kotlin.android'", '')
      .replace(/\n\s*implementation files\('libs\/neutrino-bindings\.aar'\)/, '')
      .replace(/\n\s*implementation "org\.jetbrains\.kotlinx:kotlinx-coroutines-android:[^"]+"/, '')
      .replace(/\n\s*implementation "androidx\.core:core-ktx:[^"]+"/, '')
      .replace(/\n\s*implementation "androidx\.annotation:annotation:[^"]+"/, '')
      .replace(/\n\s*implementation "net\.java\.dev\.jna:jna:[^"]+"/, '')
      .replace(/\nkotlin \{\n\s*compilerOptions \{[\s\S]*?\n\}\n/, ''),
  );
  patch(join(android, 'build.gradle'), (s) =>
    s.replace(/\n\s*classpath 'org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^']+'/, ''),
  );
  console.log(`material3: no neutrino bindings in neutrino/libs — building the plain companion`);
}

// 5. Verify the patches actually landed. Every one of these is invisible in a
//    successful build and painful on a phone (no camera, no reminders, no deep
//    links, an app bar under the status bar), and this script once failed
//    half-way through without failing the build. Now it fails loudly.
const manifest = readFileSync(join(app, 'src', 'main', 'AndroidManifest.xml'), 'utf8');
const activity = readFileSync(mainActivity, 'utf8');
const expected = [
  ['CAMERA permission', manifest.includes('android.permission.CAMERA')],
  ['POST_NOTIFICATIONS permission', manifest.includes('android.permission.POST_NOTIFICATIONS')],
  ['indiafoss:// deep link', manifest.includes('android:scheme="indiafoss"')],
  ['Material You dynamic colour', activity.includes('DynamicColors')],
  [
    'Material Components dependency',
    readFileSync(join(app, 'build.gradle'), 'utf8').includes('com.google.android.material'),
  ],
  [
    'Material 3 theme overlay',
    existsSync(join(app, 'src', 'main', 'res', 'values', 'styles.xml')) &&
      readFileSync(join(app, 'src', 'main', 'res', 'values', 'styles.xml'), 'utf8').includes(
        'Theme.Material3',
      ),
  ],
];
const missing = expected.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length > 0) {
  console.error(`material3: patches did not apply: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`material3: verified ${expected.length} patches`);
