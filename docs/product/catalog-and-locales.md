# Catalog navigation and interface languages

## Intent

A large imported screen catalog must retain the source's editorial journey order. Reviewers should find every main screen and alternate state and jump from a tag directly to matching objects. The application interface supports Russian and English without translating project content.

## Acceptance contract

- Screens and flows accept optional non-negative integer `data.order`. Importers preserve the source array order. Existing objects without order remain valid and receive a deterministic natural-key fallback in the interface.
- Main screens and alternate states retain the explicit order of their flow references. Flow pagination remains bounded and its total and continuation are visible. Reviewers can reveal alternate states globally. Screens outside flows remain discoverable.
- Card and viewer tags are keyboard-accessible controls. A tag opens the matching catalog in grid mode and closes the viewer. Conflicting search, flow, variant, palette and status filters are cleared, so all authorized matching objects in the selected active/archive scope can be found. The tag filter is reflected in the URL and can be cleared.
- RU/EN can be selected before and after login. The selection survives reload, updates the document language and localizes application labels, forms, feedback, statuses, dates and counts. Browser language supplies the first default; unsupported locales fall back to English.
- Object names, tags, comments, Markdown documents, repository paths and provider output remain user/source content. Identifiers and API status values are unchanged.
- Changing language or filters does not modify project objects or comments. UI navigation does not broaden server permissions.

## Existing installation reconciliation

Before backfill, compare stable keys with the original private export and check image references. Preserve object IDs, note targets, file references and all source content. Apply only missing ordering metadata through the versioned API using expectedVersion after a fresh database backup. Conflicts must be re-read and reviewed; never overwrite concurrent content. Re-running the operation must skip already matching values. No private catalogs or deployment evidence belong in the public repository.

## Verification

Behavioral tests cover explicit/fallback ordering, import compatibility, state-only and ungrouped screens, tag navigation, language fallback and persistence. Browser checks cover English and Russian, desktop and mobile, and preserve equal-height toolbar controls. Deployment checks compare the live catalog inventory and confirm that existing notes, assets and files are retained.
