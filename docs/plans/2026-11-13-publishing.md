# Publishing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the account owner publish new tweets and replies from the existing CLI.

**Architecture:** Reuse `XReaderClient.createTweet` and `reply`. Add `post` with a `tweet` alias and share media preparation and output with `reply`. Remove the obsolete CLI environment gate. Preserve the upstream library write opt-in, media validation and chunked video uploads. Retry publication only when X explicitly reports an unknown endpoint (404).

**Tech Stack:** TypeScript, Commander, Node.js fetch and node:test. No new dependencies.

## Design

The user confirmed that both new tweets and replies are required. Replies currently stop at `X_READER_ENABLE_REPLY`; the API already supports new tweets but the CLI does not expose them. The installed `x-reader` executable links to this checkout. A read-only request using existing cookies successfully read one bookmark.

Use `post <text>` (alias `tweet`) and retain `reply <tweet-id-or-url> <text>`, with the existing repeatable `--media` and `--format json` options. Validate empty text and the four-image limit before uploads. Share media uploads and result presentation; leave reading commands unchanged. A public post requires user-selected text and is not part of diagnostic testing.

Alternatives: documenting the enable flag only would leave new tweets unavailable; introducing another API or browser publishing would duplicate working authentication and add dependencies. Reusing the existing mutation is the smallest change.

## Tasks

- [x] Diagnose the local gate, CLI gap, installed executable and account reading.
- [x] Add failing CLI and API regression tests with fake credentials and mocked HTTP.
- [x] Enable replies and add `post` / `tweet` using the current API client.
- [x] Stop publication retries after rejection or an ambiguous successful response.
- [x] Update CLI help and README examples.
- [x] Fix authenticated query ID discovery and update the expired publication fallback.
- [x] Match publication feature flags to the current X client.
- [x] Run `npm test`, `npm run lint`, and `git diff --check`; request independent test and code review.

## Results

53 automated tests pass after integrating the newer upstream video and authentication changes, including the failures reproduced before the fixes. TypeScript checking and whitespace checks pass. Independent test and code review found no blocking issues in either the original publishing changes or the upstream integration. Additional mocked HTTP checks verified both post and reply with chunked video uploads.

Live verification on 2026-11-13, using a temporary cache: authenticated discovery found nine operations including CreateTweet. The old publication endpoint returned 404; the newly discovered endpoint rejected intentionally invalid JSON with 400, confirming it exists without sending publishable content. Reading one bookmark still succeeds. Live publication was subsequently verified with one original post and two chained replies, using content explicitly supplied and authorized by the account owner.

The installed `/opt/homebrew/bin/x-reader` links to this checkout's built CLI. The build has updated the executable without reinstalling or publishing the package.

## Validation

Modify `tests/cli.test.js`; create `tests/publishing.test.js` and `tests/fixtures/mock-x.mjs`. Invoke the checkout's built CLI directly. Mock the external HTTP boundary and capture requests in temporary files so no test uses real credentials or sends posts. Check new tweets, replies by URL, images, JSON/text output, empty input, too many images, upload failures, server rejection, and no retry of ambiguous writes.

Modify `src/cli/index.ts`, `src/api/client.ts`, and `README.md`. First run `npm test` to observe new tests fail for the missing command and reply gate, then implement and run the full suite. Build updates the already-linked local executable without reinstalling or publishing an npm package.

## Delivery

- [x] Review changes and rerun the 33 tests, TypeScript checking and whitespace checks.
- [x] Integrate the newer remote commit with video uploads, retaining its media validation and client write opt-in.
- [x] Validate the combined changes and review conflicts.

Delivery target: `main` on `origin`. Push confirmation is reported in the chat after remote verification.
