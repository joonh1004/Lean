# Lean cross-device sync (opt-in)

Lean defaults to browser-only storage. Sync is **manual**: sign in, compare, then explicitly copy one saved workspace. Signing in does not upload anything. No Supabase project was provisioned for this implementation, and no hosted verification or real user-data transfer was performed.

## Owner setup

1. In a Supabase project you control, enable Email/password Auth. In Authentication settings turn off new user signups, and use Authentication → Users → Add user → Create new user to create your one owner account with a strong unique password. Confirm the user in the dashboard if needed. Keep the password out of source control, environment variables, chat and GitHub. There is no public signup or reset flow in Lean.
2. In the project's SQL Editor, execute [`supabase/migrations/001_lean_sync.sql`](supabase/migrations/001_lean_sync.sql) once as the database administrator. Copy the Auth user's **User UID** and then run this one-time SQL, substituting that UUID:

   ```sql
   insert into public.lean_sync_workspace (owner_id)
   values ('REPLACE-WITH-THE-OWNER-AUTH-UUID'::uuid);
   ```

   Do not add a second owner. The table enforces one row; only that JWT subject can read it through RLS. API clients cannot insert, update or delete rows directly. The authenticated write and repair RPCs check both the owner and expected revision atomically. Deleting the Auth user deletes the workspace row and its prior snapshot. Project administrators can access the data; this is not end-to-end encryption.
3. Install with `npm ci` (Node 20 or 22). Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL=https://<project-ref>.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…` from Supabase **Connect / Project Settings → API Keys**. Custom domains and legacy anon keys are not accepted by this build. Use **only** the public publishable key: Vite embeds these values in JavaScript. Never provide `service_role`, `sb_secret_…`, a password, or a user token to Vite or GitHub.
4. Run `npm run dev -- --strictPort` locally or `npm run build -- --base=/Lean/` for Pages (use the base for your host). Serve over HTTPS, except loopback development; current Chromium supports the needed Web Locks, IndexedDB, and Web Crypto APIs. Never expose the Vite development server publicly. For the optional existing Pages workflow, set the two public build variables under GitHub Settings → Secrets and variables → Actions → Variables (or the `github-pages` environment). Build/deploy again after setting them. Leave **both** blank for browser-only operation. Incomplete, invalid or non-publishable settings fail Vite configuration before client bundling, without printing the values. Public Pages does not make the owner workspace public; do not put private content in the repository.
5. Verify with disposable, non-sensitive fixtures in an approved project before uploading records. In two separate browser profiles on the configured build, verify that sign-in alone leaves cloud at version 0, then copy from A and open it from B. Check all four record types, completion, folder/links, quote history and both saved image files. Compare on both devices before uploading distinct edits; only the first upload at that revision should succeed. Verify a second account cannot read or write the row (if using such a test account, create it only in a disposable test project, then remove it). This checklist has **not** been run against hosted Supabase.

## First copy and recovery

- On the device containing existing data, open this build at the **same browser profile and exact origin** (scheme, host, port) as the data. `localhost` and `127.0.0.1` differ, as do different ports. If moving from a local address to Pages, first run the configured build at the old origin, then open the saved cloud copy at the new origin. This is not an automatic cross-origin migration.
- Save any drafts and close other Lean tabs. Open **기기 동기화** (Device sync; available before the daily quote gate). Log in, choose **저장된 복사본 비교** (Compare saved copies), and confirm **클라우드에 처음 복사** (First cloud copy) if empty. The original browser data stays where it is. On device B, log in with the same owner, compare, then choose **이 브라우저 백업 후 클라우드 복사본 열기** (Back up browser and open cloud copy). The previous browser workspace stays independently restorable at **이 브라우저의 백업**. Restoring a browser backup also preserves the workspace it replaces. Opening a workspace reloads the tab, ending its in-memory login; sign in again for the next sync. Logging out does not erase local data.
- Without a common baseline, differing copies are treated as a conflict. There is **no automatic merge**. Decide which entire saved copy to open or upload. The local copy is retained when opening a cloud copy. Upload uses the compared revision; if another device changed it, the write is rejected and you must compare again. Uploading replaces the entire cloud workspace and rotates its previous version; there is only **one** previous cloud version. Save that version as a private JSON file using **이전 클라우드 백업 파일 저장** before uploading again if it matters. JSON export is for inspection/retention; there is no file import UI. To combine conflicting edits, use the local workspace backups to inspect each version and reapply edits manually. Close old tabs after changing workspaces; old build versions cannot see the new namespaces.
- If the current cloud copy cannot be decoded, regular upload and download are disabled. After comparing, explicitly confirm **이전 클라우드 백업으로 클라우드 복구** to replace it with the validated previous cloud backup, or **이 브라우저 복사본으로 클라우드 복구** to replace it with this browser's validated saved data. Repair checks the compared revision and leaves the prior cloud backup and browser data untouched. If neither source is valid, no repair is offered. Export an important prior cloud backup before continuing with regular uploads.
- Current tabs share a write lock for workspace changes, final upload checks, and saved local edits. After switching workspaces, reload other tabs before editing. Without Web Locks, browser-only editing remains available but sync and workspace switching are disabled.
- If a request failed or its status is unclear, compare again; a network interruption after a write may hide its acknowledgment. An oversized local workspace can still be retained as a local backup on download. Clearing site data or switching browser profiles loses access to the browser's own copies. Staged workspaces and backups also count against browser quota.

## Scope and limits

Saved tasks, events, completion, deadlines, colors, folders, notes, links and their relationships; saved quote text, rotation and daily history; and **saved** problem records with original and cleaned image bytes, file information and review metadata. Same-account, single-owner, whole-workspace snapshots. No automatic background sync, per-item merging, sharing, realtime listeners, or remote HWPX conversion. A stored record can include app sample data. Use only a trusted Lean origin and browser profile; both local backups and exported JSON contain private data.

**Unsaved problem-review drafts remain React state.** They do not sync or survive reload, and there is no shared draft lifecycle, document-ID/PNG-digest-bound approval or cross-device stale-approval protocol. Sync does not change the existing local review/save/export gate or enable a live Codex provider. Save valid reviewed problems before syncing. Unsaved ordinary edits are also excluded.

PNG/JPEG/WebP originals and PNG cleaned images: **2 MiB per image**, **8 MiB per complete UTF-8 snapshot** including base64 and metadata. Larger copies stay local; nothing is silently resized, skipped or uploaded partially. Provider request limits or browser quota can be lower. Snapshots are stored as bounded text in one owner-only PostgreSQL row, not in a public bucket.

The database validates the wire envelope, nested document containers, problem metadata shape, and image type/base64/size. It does not duplicate Lean's full record and quote semantics (e.g. folder graphs or quote history). An owner using a different client can therefore still submit structurally acceptable data that Lean refuses to decode; regular Lean writes fail closed and explicit repair retains the backup. Neither validation layer decodes images as pixel data.

## Tests

```text
npm ci
npm test
npx playwright install chromium
npx playwright test --workers=2
npm run build -- --base=/Lean/
```

`tests/sync.test.js` covers encoding, exact image bytes, invalid/oversized payloads, conflict classification and transport checks. `tests/sync-sql.test.js` runs the actual migration in disposable PGlite with stand-in Auth roles and subjects, including revision-checked repair and backup retention. `tests/sync-browser.spec.cjs` covers two-tab lock ordering, inactive-page writes, browser-only fallback and two-context snapshot handoff. `tests/sync-recovery.spec.cjs` intercepts every provider request to verify the explicit repair UI, stale repair rejection and readback without contacting a provider. These are app-protocol and local SQL tests, not live Supabase Auth/PostgREST tests. The optional HWPX conversion path requires the Python dependencies listed in [PROBLEM_BANK.md](PROBLEM_BANK.md).

The build contract tests use only synthetic values. Browser-only and disposable SQL tests do not verify hosted Supabase or the optional Python HWPX converter.
