# Screen design revisions and application builds

Open a screen in the catalog to compare design revisions in its history or inspect its reported Android, iOS and Web builds. Each variant and palette is a separate screen object. Reports belong to the exact project and screen ID.

## Reading a screen

Read `GET /api/v1/projects/{projectId}/objects/{objectId}` or use MCP `get_object`. A screen carries three fields:

| Field | Meaning |
|---|---|
| `version` | Object revision. Send this as `expectedVersion` on each write. |
| `designVersion` | Object revision that introduced the current design. Publishing a new design may skip numbers because reporting a build and editing metadata also create object revisions. |
| `implementations` | Latest visible report for each recorded platform. A missing platform means its implementation is unknown. |

Current list responses include the same fields. `GET .../objects/{objectId}/history` and MCP `get_history` return authorized snapshots. Old snapshots retain their original object revision. Existing screens begin with their current object revision as the design baseline.

Changes to the screenshot, preview URL, source path, source revision, screen identity, variant, palette, frame or linked assets establish a new design revision. For a preview republished at the same URL, supply a new `data.designSourceRevision` such as a content hash of the rendered design. Titles, tags, order, visibility, build reports and discussion do not advance the design. Set `data.previewMode` to `"tab"` when an interactive preview needs its own authenticated browser tab. This presentation preference keeps the same design revision. Omit it for the sandboxed embedded preview. Restoring an older layout publishes a new revision and retains the latest platform reports.

## Reporting a build

Use a separate write for each platform. Project developers and administrators can record evidence in the viewer. An agent with the project's write scope can call MCP `record_screen_implementation` or send this request:

```http
PATCH /api/v1/projects/{projectId}/objects/{objectId}
Content-Type: application/json

{
  "expectedVersion": 12,
  "screenImplementation": {
    "platform": "android",
    "state": "partial",
    "designVersion": 9,
    "build": "2.3.0 (42)",
    "commit": "a2b4c6d",
    "evidenceUrl": "https://example.test/builds/42/screens/example-login.png"
  }
}
```

Use `android`, `ios` or `web`. Select the revision actually compared with the application. The evidence URL must be an HTTPS link to the checked screenshot, build artifact or release. The optional Git commit identifies the application source revision. Use a durable URL suitable for the people who can see the screen.

| Reported state | When to use it |
|---|---|
| `design_only` | Someone established that this design exists only as a mockup for this platform. Supply just platform, state and designVersion. |
| `implemented` | The reporter checked that this screen design is implemented in the identified build. |
| `partial` | The reporter checked the build and found only part of the design implemented. |
| `app_changed` | The application screen changed in this build and correspondence to the referenced design remains unconfirmed. |

The latter three require `build` and `evidenceUrl`. If the current design is newer than a report's designVersion, the catalog flags the newer design and the viewer retains the details of the earlier report. Server attribution includes `source` (human or agent), `actorName`, `reportedAt` and visibility. Human review and acceptance continue through the review workflow. The server stores the submitted link and attribution without fetching the URL or certifying the reporter's conclusion.

On success the response is the updated screen. In this example the object revision advances to 13 and designVersion stays at 9. Each platform retains its own latest report. Earlier reports remain in revision history under the visibility at which they were recorded. A privately recorded report stays private after publication of the target. A new report on a shared screen must identify a design that was visible to customers in at least one revision. An inaccessible project or revision cannot be used as evidence for a different screen.

## Agent workflow

1. Search for the exact screen and variant. Read the screen and note both version numbers.
2. For design work, upload an immutable screenshot with the project file API or publish a versioned preview. Call MCP `update_screen_design` with `projectId`, `objectId`, `expectedVersion` and `design`, for example `{"imageFileId":"<uploaded UUID>", "designSourceRevision":"<render content hash>"}`. The tool preserves other screen data. Save the returned designVersion.
3. For application work, inspect that screen in the intended platform build. Keep a screenshot or a release link and choose the state matching what was checked.
4. Read the latest object revision. Call `record_screen_implementation` with `projectId`, `objectId` and the two fields in the PATCH example. The designVersion stays pinned to the design actually compared. For a second platform, use the new object version returned from the first call.
5. A 409 means another write won. Re-read the screen and reconcile the report. A 422 means the design revision is unavailable for this screen or the report was combined with another edit. A malformed build report receives 400. Leave an unverified platform without a report.

## Deployment and recovery

Schema 7 adds one nullable column on the existing project-scoped objects table. Legacy screen payloads and existing file relationships keep their original structure. Back up the database and keep the prior application image before the update.

To return to schema 6, stop the schema-7 application writer, run `tools/setup/rollback-schema-7.sql` through `psql -v ON_ERROR_STOP=1` as the migration owner, then start the previous app and verify readiness. The script retains screen evidence in a renamed column. Reapplying migration 7 brings those reports back. Screens edited by the older application receive their latest object revision as a conservative design baseline when upgraded again.
