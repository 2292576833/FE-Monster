# Desktop Pet Memory and Preference Learning v2 Design

**Date:** 2026-08-31

## Goal

Turn the existing encrypted cross-session memory into a dependable preference-learning loop. The desktop pet should remember durable conversations, learn only defensible preferences, replace or retract obsolete preferences, and let the user inspect, correct, or forget everything it has learned.

## Existing foundation

FE Monster already provides:

- an FE-ID- and provider-partitioned encrypted SQLite vault protected by the Windows DPAPI boundary;
- browser ingress for chat, operation, and knowledge events;
- bounded cross-session chat restoration and relevance ranking;
- an initial rule-based preference extractor and playback-habit summary;
- local and server personalization paths with separate privacy boundaries;
- command discovery, confirmation, and execution receipts.

This design keeps those boundaries. It does not introduce a second database, upload locally decrypted memory, or make a cloud model authoritative for preference extraction.

## Learning policy

Preference learning is conservative and deterministic.

1. Explicit durable statements such as “我喜欢后摇” or “以后回答简短一点” become active preferences immediately.
2. One-turn language such as “这次”“今天”“暂时”“现在先” remains conversation context and is not promoted to long-term preference.
3. Repeated behavior becomes a preference only after its aggregate evidence reaches a category-specific threshold. A single play, skip, volume change, or command never creates a durable preference.
4. Explicit user statements outrank inferred behavior. Behavioral evidence cannot reverse an explicit preference.
5. A newer explicit correction replaces the older value for the same preference identity. A newer explicit retraction makes that identity inactive.
6. Inferred preferences decay when not reinforced. Explicit preferences do not silently expire.
7. Temporary conversation mode suppresses chat, operation, and preference events before they enter any durable queue.

## Preference ledger

The encrypted knowledge stream remains the durable event log. Preference records use the existing `user.fact` event type with a versioned JSON value so the database schema and encryption format remain compatible.

Each v2 preference value contains only bounded, sanitized fields:

```json
{
  "schemaVersion": 2,
  "kind": "preference",
  "category": "music_affinity",
  "subject": "后摇",
  "polarity": "like",
  "statement": "用户明确表示喜欢：后摇",
  "origin": "explicit-chat",
  "confidence": 1.0,
  "evidence": 1,
  "status": "active",
  "updatedAt": "2026-08-31T00:00:00.000Z"
}
```

The public event payload continues to contain the stable `entityId`, display `title`, source marker, and serialized value. The entity identity is derived from the normalized preference dimension and subject, not from polarity. “喜欢后摇” and “不再喜欢后摇” therefore update the same logical preference instead of producing contradictory active facts.

Retractions are append-only records with `status: "retracted"`. Old encrypted events remain auditable, while the active projection exposes only the newest valid record for each entity. Existing v1 facts remain readable and are normalized into the v2 projection during hydration; migration does not rewrite the original encrypted events.

## Components

### Preference signal extractor

The browser preference module converts bounded user text into structured signals. It recognizes explicit likes, dislikes, habits, response style, music preferences, corrections, and retractions. Negation and correction are evaluated before positive patterns. Question-shaped text, quoted instructions, prompt-injection-shaped text, secrets, contact identifiers, paths, and URLs are rejected.

The extractor emits no durable record when the text contains a one-turn scope marker unless the user also explicitly asks to remember it permanently.

### Preference reducer

The reducer folds stored records and new signals into one active projection per provider scope. Merge precedence is:

1. newer explicit correction or retraction;
2. existing explicit preference;
3. newer inferred preference with sufficient evidence;
4. older inferred preference after confidence decay.

The reducer is deterministic, side-effect free, and shared by hydration, recall, commands, and tests. It collapses duplicate and historical versions before ranking so an obsolete preference can never reappear merely because it lexically matches the current question.

### Behavioral learner

Playback intelligence continues to aggregate behavior without retaining raw media URLs or credentials. It can infer bounded music-track, artist, genre, time-of-day, volume-range, scene, and skip-avoidance preferences.

Positive evidence includes repeated starts, completions, and replays. Negative evidence includes repeated early skips. Thresholds require at least three independent observations, and inferred confidence must be at least 0.6 before persistence. Repeated skip evidence may create an inferred avoidance preference but cannot override an explicit like.

Evidence is bucketed before storage so routine playback does not create a new record after every event. A new record is written only when the active value, evidence bucket, confidence bucket, or status changes.

### Recall projection

Recall first builds the active preference projection, then ranks it against the current user message. Ranking combines lexical relevance, category relevance, explicit-versus-inferred priority, confidence, and recency. The prompt receives only the bounded top relevant items.

Preference data remains untrusted context. It cannot authorize commands, provide credentials, or override the current user request. Locally decrypted records are supplied only to loopback custom-model endpoints. Server models continue to use the existing server-owned FE-ID personalization path.

### User controls

The canonical app command registry gains three memory-management operations:

- `pet.preferences.query`: list active preferences with category, statement, source, confidence, evidence, and update time;
- `pet.preferences.correct`: create an explicit correction for a selected preference identity;
- `pet.preferences.forget`: retract one or more selected preferences after confirmation.

Generic encrypted-memory querying and deletion remain available for audit and full-record removal. Preference commands operate on the logical active projection so users do not need to understand event IDs or historical versions.

Command results never expose raw account scope, database paths, encryption material, URLs, cookies, tokens, or rejected source text.

## Conversation memory

Normal user and assistant messages continue to be written only after passing the browser sanitizer and are restored into both visible history and bounded model history after restart. Relevant older turns may outrank unrelated recent turns, but the current user message always remains authoritative.

The recall pipeline keeps chat history and preference projection separate until prompt assembly. This prevents a historical assistant response from being misrepresented as a user preference.

## Temporary conversation behavior

Temporary mode is genuinely ephemeral:

- no chat, operation, or preference event is normalized, queued, retried, or persisted;
- behavioral summaries produced during temporary mode are not promoted later;
- exiting temporary mode restores the durable baseline and starts learning only from subsequent events;
- status text explicitly says that temporary content is not written to permanent memory.

Records that existed before temporary mode may still be used only if the current privacy setting permits recall. Temporary turns themselves are never added to durable context.

## Failure handling

- A locked or unavailable vault leaves the active turn usable but reports that the memory was not persisted.
- Failed writes do not update the in-memory active preference projection.
- Hydration failures produce an empty, unavailable projection rather than falling back to stale browser storage.
- Invalid or unknown preference schemas are ignored without deleting their encrypted source events.
- Queue saturation rejects new events explicitly; it never silently claims a preference was learned.
- Correction and retraction commands report success only after the durable receipt is accepted and the active projection is read back.

## Compatibility and migration

No SQLite schema migration is required because v2 preferences remain sanitized `user.fact` knowledge events. Existing v1 preference JSON is interpreted as an active legacy preference with its original origin, confidence, and evidence. When the same entity is next corrected or reinforced, a v2 event supersedes it.

Existing chat, operation, backup, restore, account isolation, and forget APIs remain compatible. Cache fingerprints for changed browser modules are updated so the project launcher cannot reuse the previous preference runtime.

## Testing

Focused tests must prove:

1. an explicit preference persists and is recalled after a fresh runtime session;
2. a newer correction replaces the older active preference;
3. a retraction prevents all older versions of that entity from reaching the prompt;
4. one-turn statements are not persisted;
5. one behavioral event is insufficient, while repeated qualifying evidence is learned;
6. repeated skips can infer avoidance but cannot override an explicit like;
7. unchanged evidence does not create duplicate durable records;
8. inferred confidence decays while explicit preferences remain active;
9. temporary mode makes no persistence request and creates no delayed retry;
10. different provider or FE-ID scopes cannot observe each other’s preferences;
11. sensitive and prompt-injection-shaped text is rejected;
12. preference query, correction, and forget commands return verified receipts;
13. only the active, relevant, bounded projection reaches the local-model prompt;
14. locally decrypted preference plaintext is never sent to a non-loopback model;
15. the temporary-memory status response accurately describes the no-storage behavior.

## Acceptance criteria

The feature is complete when the desktop pet can remember a durable preference across restart, learn repeated behavior without overfitting a single action, honor an explicit correction or deletion immediately, avoid learning from temporary conversations, and accurately explain and expose its current memory state through user-controlled commands.
