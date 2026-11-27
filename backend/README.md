# Work queue demo

From the repository root, run `npm ci` on a fresh checkout, then `npm run demo`. This builds the projection engine and renderer and starts the Go service at [the full-power grid](http://127.0.0.1:5183/input-projections/grid-full-power.html). Requires Go 1.24+, a C compiler for go-sqlite3, and Node/npm. For renderer development, start the service and run `npm run renderer:dev` in another terminal. Vite proxies the queue API to port 5183.

The queue starts empty. Click **10 rows**, edit an item, click **Save queue**, and refresh. Seed and Reset replace the local draft. Save commits the entire displayed queue, including removals. Work items carry stable UUIDs independently of row order and editable work item codes. Seeding creates new demo entities.

SQLite stores work items, users, teams, memberships, and the queue revision in `.data/work-queue.sqlite3`. The optional team and required owner are foreign keys. A team assignment also requires a membership. For example, the first seeded work item belongs to team_ENG. Try user_001 to see the rule reject a save, then user_004 to save successfully. The remaining work item fields are projection attributes.

The Go API returns an ordered array of `{key, value}` records with an ETag on GET /api/work-queue. PUT requires that ETag in If-Match. Each accepted save gets a new revision. A stale save returns 412 and a domain rejection returns 422. Both leave the committed revision intact. On Save the Go service invokes Node to reuse the compiled projection validator. SQLite enforces relationship integrity in the transaction. Only the full-power grid uses this API.

Run `npm test`, then `go test ./backend` from the repository root. The Go integration test uses a temporary SQLite file and the compiled engine.

## Festival program

Open [the festival program](http://127.0.0.1:5183/input-projections/festival.html) for a nested, single-day program with shared speakers and tracks. Expand a session to edit its agenda, format, and assignments. The form checks local constraints immediately. On save, the Go service checks identity and references, room capacity and opening times, room and speaker conflicts, track qualifications, segment duration, workshop kit coverage, and the combined talent and production budget. Speaker fees count once per person. The budget and schedule belong to one festival, so SQLite stores the complete accepted program as one versioned JSON document, separate from the work queue.

New festival entities have editable IDs until their first confirmed save. To rename an existing speaker, edit their name. Session assignments keep the same speaker ID. The festival API takes a complete snapshot: removing one ID and introducing another represents removing and adding entities, and the server checks all resulting references.

Both pages start with **Auto-save Off**. Turning it on saves a valid draft after an 800 ms pause and remembers the preference for that page in the browser. Rejected saves keep the draft available for correction. Turning auto-save off cancels a scheduled save. A save already sent can complete. With auto-save on, queue seed and reset actions also save their resulting queue.

Run `npm run test:festival` for Chromium regressions against a fresh, temporary database. This requires a local Chromium installation and matching chromedriver on PATH.
