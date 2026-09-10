plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// The bundle the app opens with before its first network refresh is the very
// canonical normalized file the web build copies. Reading the generated web
// static copy here would leave APKs stale after an automatic data-only import.
val seedAssets = layout.buildDirectory.dir("generated/seed-assets")

val copySeedBundle by tasks.registering(Copy::class) {
    from(rootProject.file("../../../events/indiafoss-2026/normalized/event-bundle.json"))
    // The floor plans the web map draws, exported to JSON (`pnpm --filter @indiafoss/web floors`).
    from(rootProject.file("../../web/static/venues/indiafoss-2026/floors.json"))
    // The routing graph and room entrances behind the web map's walk times.
    from(rootProject.file("../../web/static/venues/indiafoss-2026/venue.graph.json"))
    from(rootProject.file("../../web/static/venues/indiafoss-2026/venue.metadata.json"))
    into(seedAssets)
}

android {
    namespace = "org.indiafoss.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.indiafoss.companion.nativeapp"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.gradleProperty("nightlyVersionCode").orNull?.toInt() ?: 1
        versionName = providers.gradleProperty("nightlyVersionName").orNull ?: "0.1-dev"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    // AGP 9 refuses a Provider here. The directory is known at configuration
    // time and preBuild already dependsOn copySeedBundle, so the task ordering
    // does not rely on the provider carrying it.
    sourceSets["main"].assets.srcDir(seedAssets.get().asFile)
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    // QR codes: zxing draws the card; the embedded scanner (Apache-2.0, no
    // Google services) reads a friend's — F-Droid friendly.
    implementation(libs.zxing.core)
    implementation(libs.zxing.embedded)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    // Screenshots of every screen on the JVM (Robolectric), for a look at the
    // UI without a device: `./gradlew :app:testDebugUnitTest`, PNGs under
    // app/build/screenshots.
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.kotlin.test)
}

tasks.named("preBuild") { dependsOn(copySeedBundle) }
