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

// 4. Optional P2P chat: the Neutrino plugin, only when the GitHub Packages token
//    for io.element.neutrino:bindings is available (NEUTRINO_PACKAGES_TOKEN).
const NEUTRINO_VERSION = '0.8.2';
const KOTLIN_VERSION = '2.3.21';
const token = process.env.NEUTRINO_PACKAGES_TOKEN ?? '';
const pluginSrc = join(root, 'neutrino', 'NeutrinoPlugin.kt');
const pluginDir = join(app, 'src', 'main', 'java', 'org', 'indiafoss', 'companion');
const pluginDst = join(pluginDir, 'NeutrinoPlugin.kt');
const mainActivity = join(pluginDir, 'MainActivity.java');

if (token) {
  patch(join(android, 'build.gradle'), (s) =>
    s.includes('kotlin-gradle-plugin')
      ? s
      : s.replace(
          /classpath 'com\.android\.tools\.build:gradle:[^']+'/,
          (m) =>
            `${m}\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}'`,
        ),
  );
  patch(join(android, 'build.gradle'), (s) =>
    s.includes('maven.pkg.github.com/element-hq/neutrino-iroh')
      ? s
      : s.replace(
          /allprojects \{\s*repositories \{\s*google\(\)\s*mavenCentral\(\)/,
          (m) =>
            `${m}\n        maven {\n            url = uri('https://maven.pkg.github.com/element-hq/neutrino-iroh')\n            credentials {\n                username = System.getenv('NEUTRINO_PACKAGES_USER') ?: 'x-access-token'\n                password = System.getenv('NEUTRINO_PACKAGES_TOKEN')\n            }\n            content { includeGroup('io.element.neutrino') }\n        }`,
        ),
  );
  patch(join(app, 'build.gradle'), (s) => {
    let out = s;
    if (!out.includes('org.jetbrains.kotlin.android')) {
      out = out.replace(
        "apply plugin: 'com.android.application'",
        "apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'",
      );
    }
    if (!out.includes('io.element.neutrino:bindings')) {
      out = out.replace(
        /implementation "androidx\.appcompat:appcompat:\$androidxAppCompatVersion"/,
        (m) => `${m}\n    implementation "io.element.neutrino:bindings:${NEUTRINO_VERSION}"`,
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
  patch(mainActivity, (s) =>
    s.includes('NeutrinoPlugin')
      ? s
      : s.replace(
          'public class MainActivity extends BridgeActivity {}',
          'public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(NeutrinoPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}',
        ),
  );
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
  patch(mainActivity, (s) =>
    s.replace(
      /public class MainActivity extends BridgeActivity \{[\s\S]*\}\s*$/,
      'public class MainActivity extends BridgeActivity {}\n',
    ),
  );
  patch(join(app, 'build.gradle'), (s) =>
    s
      .replace("\napply plugin: 'org.jetbrains.kotlin.android'", '')
      .replace(/\n\s*implementation "io\.element\.neutrino:bindings:[^"]+"/, '')
      .replace(/\nkotlin \{\n\s*compilerOptions \{[\s\S]*?\n\}\n/, ''),
  );
  patch(join(android, 'build.gradle'), (s) =>
    s
      .replace(/\n\s*classpath 'org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^']+'/, '')
      .replace(
        /\n\s*maven \{\n\s*url = uri\('https:\/\/maven\.pkg\.github\.com\/element-hq\/neutrino-iroh'\)[\s\S]*?\n {8}\}/,
        '',
      ),
  );
  console.log('material3: NEUTRINO_PACKAGES_TOKEN not set — building the plain companion');
}
