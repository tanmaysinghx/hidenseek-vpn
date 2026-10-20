// Run after `tauri android init`: the generated project ships Tauri's default icon and a white
// Material theme. This installs the Hidenseek icons and a dark window/system splash, so the app
// opens logo-on-dark straight into its own splash screen with no white flash.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const res = `${root}src-tauri/gen/android/app/src/main/res`;
if (!existsSync(res)) {
  console.error(`No Android project at ${res}; run \`tauri android init\` first.`);
  process.exit(1);
}

cpSync(`${root}src-tauri/icons/android`, res, { recursive: true });

writeFileSync(`${res}/values/hidenseek_colors.xml`, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="hidenseek_background">#070A10</color>
</resources>
`);

const items = `
        <item name="android:windowBackground">@color/hidenseek_background</item>
        <item name="android:statusBarColor">@color/hidenseek_background</item>
        <item name="android:navigationBarColor">@color/hidenseek_background</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar" tools:targetApi="27">false</item>
        <item name="android:windowSplashScreenBackground" tools:targetApi="31">@color/hidenseek_background</item>
        <item name="android:windowSplashScreenIconBackgroundColor" tools:targetApi="31">@color/hidenseek_background</item>
    `;
for (const dir of ['values', 'values-night']) {
  const file = `${res}/${dir}/themes.xml`;
  if (!existsSync(file)) continue;
  const xml = readFileSync(file, 'utf8');
  if (xml.includes('hidenseek_background')) continue;
  const patched = xml.replace(/(<style name="Theme\.[^"]+"[^>]*>)[\s\S]*?(<\/style>)/, `$1${items}$2`);
  if (patched === xml) {
    console.error(`Could not find the app theme in ${file}`);
    process.exit(1);
  }
  writeFileSync(file, patched);
}
console.log('Android icons and dark splash theme installed.');
