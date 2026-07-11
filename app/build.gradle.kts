import java.io.FileInputStream
import java.util.Properties

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

// Signing config is kept out of git. Copy keystore.properties.example to app/keystore.properties
// and point it at your keystore to produce signed release builds; otherwise release falls back to
// the debug signing key so the project still builds for anyone cloning it.
val keystorePropsFile = rootProject.file("app/keystore.properties")
val hasKeystore = keystorePropsFile.exists()
val keystoreProps = Properties().apply { if (hasKeystore) load(FileInputStream(keystorePropsFile)) }

android {
  namespace = "chat.holt.android"
  compileSdk = 34

  defaultConfig {
    applicationId = "chat.holt.android"
    minSdk = 24
    targetSdk = 34
    versionCode = 17
    versionName = "1.1.6"
  }

  signingConfigs {
    if (hasKeystore) create("sideload") {
      storeFile = file(keystoreProps.getProperty("storeFile"))
      storePassword = keystoreProps.getProperty("storePassword")
      keyAlias = keystoreProps.getProperty("keyAlias")
      keyPassword = keystoreProps.getProperty("keyPassword")
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = if (hasKeystore) signingConfigs.getByName("sideload") else signingConfigs.getByName("debug")
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }
  buildFeatures {
    buildConfig = false
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.webkit:webkit:1.11.0")
  implementation("androidx.core:core-splashscreen:1.0.1")
  implementation("androidx.activity:activity-ktx:1.9.1")
  implementation("com.google.android.material:material:1.12.0")
}
