# What was fixed

## Why the APK build kept failing
1. **Duplicate launcher icons** - the workflow generated `ic_launcher.png` next to the template's
   `ic_launcher.xml` in every `mipmap-*` folder -> AAPT2 "Duplicate resources" error whenever a logo was found.
   The template now only has `mipmap-anydpi-v26`, the script writes one foreground PNG.
2. **Command injection / broken names** - user input (app name, URL) was pasted into shell scripts and `sed`.
   Names like `Tom's Shop`, `A & B` or Hindi names broke the build (or could run commands with your secrets).
   Everything now goes through env vars and `scripts/prepare_android.py` (validated, XML-escaped, unicode safe).
3. **Two signing methods at once** (`android.injected.signing.*` and `System.getenv` in Gradle). The release APK is
   now built unsigned and signed with `zipalign` + `apksigner`. If the `KEYSTORE_*` secrets are missing, a temporary
   key is generated instead of failing.
4. **Android SDK packages** are now installed explicitly (`platforms;android-34`, `build-tools;34.0.0`).
5. Deprecated `create-release` / `upload-release-asset` actions replaced by `gh release create`.
6. Gradle build cache disabled in CI, lint no longer aborts the release build, fixed `clean` task, `die()` in gradlew.

## Why the build stayed "queued" forever
* The page only read the `builds` table. If the GitHub -> Netlify callback failed (wrong `INTERNAL_SECRET`,
  wrong `URL`) nothing ever updated it. `repository_dispatch` also returns 204 even if no workflow exists.
* `build-status` now finds the run through the API (`run-name: build-<id>`), maps it to
  building / complete / failed, reports the failing step, and marks the build **failed after 8 minutes** when no
  workflow run ever started. The page polls this function every 4 s.
* `update-build` crashed on `.onConflict()` (not a supabase-js method) after saving - fixed.

## Download
* `download-link` returns a fresh **pre-signed** GitHub URL, so downloads also work when the repo is private
  (the plain release URL returns 404 for normal users). Dashboard, Builds, Download Center and the build page all use it.

## "Same 2 MB package every time"
Expected for a WebView wrapper: the site loads live, so size is always ~2 MB. Each build now sets its own
package, label, website, icon and version code, and the workflow **verifies the APK with `aapt2 dump badging`**
(fails if the package differs) and prints package / label / version / sha256 in the run summary.

## New: logo upload
Drag & drop or browse, PNG/JPG/WebP up to 5 MB, live launcher preview (round / squircle / rounded), automatic
background from the logo edge colour, low-resolution warning. The build turns it into an Android adaptive icon.
Also: CSP now allows `blob:` images (the old preview was blocked by it).

## Setup checklist
GitHub repo -> Settings -> Secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` (optional but recommended).
Netlify env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GITHUB_TOKEN` (repo + workflow scope),
`GITHUB_OWNER`, `GITHUB_REPO`, `INTERNAL_SECRET`, `URL`.
`build-apk.yml` must be on the repo's **default branch**. To test the pipeline alone: Actions -> Build Android APK -> Run workflow.
