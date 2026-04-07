# Bulk Flow Documentation Generator — Implementation Plan

## Overview

Enable teams to generate documentation for **all synced flows** and **automatically publish to Confluence** in a single operation, with batching and progress tracking to handle environments with 50–500+ flows without hitting Claude API, Confluence API, or Convex action limits.

---

## Current State

| Aspect | Today |
|--------|-------|
| **Flow sync** | `listFlows` fetches all flows from D365 OData, upserts via `upsertFlows` mutation |
| **Flow definition** | `getFlowDefinition` fetches `clientdata` for a **single** flow on-demand |
| **Doc generation** | `generateDocumentation` calls Claude for **one** flow at a time (4096 tokens, Sonnet 4) |
| **Doc storage** | `flow_documentation` table — upsert by `flowId` |
| **Batching** | None for docs. Apps use `BATCH_SIZE = 50` for mutation batching only |
| **Rate limiting** | None — direct Claude API calls with no queuing or backoff |

### Key Constraints

- **Claude API**: Rate limits vary by tier (RPM & TPM). Sonnet 4 — typical limits: 50–4000 RPM depending on tier.
- **Convex actions**: 10-minute execution timeout per action invocation.
- **Flow definitions**: `clientData` must be fetched individually from D365 OData before docs can be generated — not stored at sync time to avoid large documents.
- **D365 OData**: Throttling at ~60 requests/min for non-batch endpoints.

---

## Architecture

```
UI: "Generate & Publish All Docs" button
        │
        ▼
┌──────────────────────────────────┐
│  Phase 1: Fetch Definitions      │  D365 OData (5 concurrent, 1s delay)
│  - Flows missing clientData      │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  Phase 2: Generate Documentation │  Claude API (5 concurrent, 2s delay)
│  - For each batch:               │
│    - Call Claude → markdown      │
│    - Save to flow_documentation  │
│    - Update job progress         │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  Phase 3: Publish to Confluence  │  Confluence API (3 concurrent, 1s delay)
│  - For each documented flow:     │
│    - Convert markdown → storage  │
│    - Create or update page       │
│    - Save pageId + URL to DB     │
│    - Update job progress         │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  bulk_doc_jobs table             │  Tracks progress across all phases
│  - phase, status, total          │
│  - completed, failed, errors[]   │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  UI: Real-time progress          │  Convex subscription
│  - Phase indicator               │
│  - Progress bar per phase        │
│  - Per-flow status badges        │
│  - Error summary                 │
└──────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Schema — Add `bulk_doc_jobs` Table

**File:** `convex/schema.ts`

```ts
bulk_doc_jobs: defineTable({
    tenantId: v.string(),
    phase: v.string(),          // 'fetching' | 'generating' | 'publishing' | 'done'
    status: v.string(),         // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    totalFlows: v.number(),     // Total flows to process
    completedFlows: v.number(), // Successfully generated
    publishedFlows: v.number(), // Successfully published to Confluence
    failedFlows: v.number(),    // Failed generations or publishes
    skippedFlows: v.number(),   // Skipped (no clientData)
    errors: v.array(v.object({  // Per-flow error log
        flowId: v.string(),
        flowName: v.string(),
        phase: v.string(),      // 'fetch' | 'generate' | 'publish'
        error: v.string(),
    })),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    requestedBy: v.string(),    // User token identifier
}).index("by_tenant", ["tenantId"]),
```

### Step 2: Mutations — Job Lifecycle

**File:** `convex/mutations.ts`

Add mutations for the bulk job:

- **`createBulkDocJob`** — Insert a new job with `phase: 'fetching'`, `status: 'pending'`, counts at 0.
- **`updateBulkDocJobProgress`** — Increment `completedFlows`, `publishedFlows`, or `failedFlows`, append errors with phase tag.
- **`updateBulkDocJobPhase`** — Transition phase (`fetching` → `generating` → `publishing` → `done`).
- **`completeBulkDocJob`** — Set `status: 'completed'` or `'failed'`, `phase: 'done'`, set `completedAt`.
- **`cancelBulkDocJob`** — Set `status: 'cancelled'` (allows UI cancel button).

### Step 3: Queries — Job Status

**File:** `convex/queries.ts`

- **`getBulkDocJob`** — Fetch latest job for a tenant (by `by_tenant` index, ordered by `startedAt` desc).
- **`getBulkDocJobById`** — Fetch specific job by ID.

These power real-time progress tracking in the UI via Convex subscriptions.

### Step 4: Action — Bulk Fetch Flow Definitions

**File:** `convex/actions.ts`

Add **`bulkFetchFlowDefinitions`**:

1. Query all flows for the tenant.
2. Filter to flows where `clientData` is null/empty.
3. Batch fetch definitions from D365 OData — **5 concurrent requests** with 1-second delay between batches (respects D365 ~60 RPM throttle).
4. Save each definition via `updateFlowClientData` mutation.
5. Return count of definitions fetched.

This ensures all flows have their definitions before doc generation begins.

### Step 5: Action — Bulk Generate Documentation (Core)

**File:** `convex/actions/documentation.ts`

Add **`bulkGenerateDocumentation`** action:

```
Args: { tenantId, orgId?, jobId }

1. Fetch all flows for tenant
2. Filter to flows WITH clientData (skip others, increment skippedFlows)
3. Optionally filter to flows WITHOUT existing documentation (re-gen flag)
4. Process in batches:
   - BATCH_SIZE = 5 (parallel Claude calls per batch)
   - BATCH_DELAY_MS = 2000 (pause between batches)
   - For each batch:
     a. Promise.allSettled() — 5 concurrent generateSingleDoc() calls
     b. For each result:
        - Success → save via saveDocumentation mutation, increment completed
        - Failure → log error, increment failed
     c. Update job progress via updateBulkDocJobProgress mutation
     d. Check if job was cancelled (query job status)
     e. Wait BATCH_DELAY_MS before next batch
5. Mark job complete via completeBulkDocJob mutation
```

**Why `Promise.allSettled`?** One flow failing shouldn't abort the entire batch.

**Why batch size 5?** Conservative default that works across Claude API tiers. Can be tuned up for higher-tier accounts.

### Step 6: Action — Bulk Publish to Confluence

**File:** `convex/actions/documentation.ts`

Add **`bulkPublishToConfluence`** action:

```
Args: { tenantId, jobId }

1. Transition job phase to 'publishing'
2. Fetch user's Confluence settings (domain, email, apiToken, spaceKey, parentId)
   - If no settings configured → mark phase as skipped, log warning, proceed to done
3. Fetch all flow_documentation records for this tenant that have content
4. Process in batches:
   - BATCH_SIZE = 3 (parallel Confluence API calls per batch)
   - BATCH_DELAY_MS = 1500 (pause between batches — Confluence limit is 100 RPM)
   - For each flow doc in the batch:
     a. Convert markdown to Confluence Storage Format via markdownToStorage()
     b. If confluencePageId exists → PUT update (fetch current version first)
     c. If no confluencePageId → POST create new page under parentId
     d. Save confluencePageId + confluenceUrl back to flow_documentation
     e. Success → increment publishedFlows
     f. Failure → log error with phase: 'publish', increment failed
   - Update job progress after each batch
   - Check for cancellation
5. Return published count
```

**Why batch size 3 for Confluence?** Confluence API limits to 100 RPM, but each publish requires 1–2 API calls (version fetch + create/update). 3 concurrent × ~2 calls = 6 per batch. With 1.5s delay ≈ 40 RPM — well within limits with headroom for retries.

### Step 7: Action — Orchestrator Entry Point

**File:** `convex/actions/documentation.ts`

Add **`startBulkDocumentation`** action:

```
Args: { tenantId, orgId?, regenerateExisting?: boolean }

1. Check no existing job is already running for this tenant
2. Validate Confluence settings exist (warn if missing — docs will generate but not publish)
3. Count eligible flows (with clientData)
4. Create job via createBulkDocJob mutation
5. Phase 1: bulkFetchFlowDefinitions (for flows missing clientData)
6. Phase 2: bulkGenerateDocumentation with the job ID
7. Phase 3: bulkPublishToConfluence with the job ID
8. Mark job complete
9. Return job ID for UI tracking
```

### Step 8: UI — Bulk Generation Controls

**File:** `components/BulkDocumentationPanel.tsx` (new component)

```
┌──────────────────────────────────────────────────────┐
│  Bulk Documentation Generator                        │
│                                                      │
│  Flows synced: 127    With definitions: 98           │
│  Already documented: 45                              │
│  Confluence: ✓ Connected (TEAM space)                │
│                                                      │
│  [x] Regenerate existing documentation               │
│                                                      │
│  [ Generate & Publish All ]  [ Cancel ]              │
│                                                      │
│  Phase: Publishing to Confluence (3 of 3)            │
│  ┌────────────────────────────────────────────────┐  │
│  │ ████████████████████░░░░░  78/98  (80%)       │  │
│  │ ✓ 72 generated  📄 54 published  ✗ 4 failed  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Failed flows:                                       │
│  - "Invoice Approval" — [generate] Claude timeout    │
│  - "Email Notify" — [publish] Confluence 403         │
│                                                      │
│  [ Retry Failed ]  [ Export Report ]                 │
└──────────────────────────────────────────────────────┘
```

Key UI features:
- **Pre-flight summary**: Show counts + Confluence connection status before starting.
- **Phase indicator**: Shows current phase (Fetching → Generating → Publishing → Done).
- **Real-time progress bar**: Powered by Convex subscription to `getBulkDocJob`.
- **Dual counters**: Generated count + Published count tracked separately.
- **Cancel button**: Sets job status to `cancelled`, action checks on each batch.
- **Error list**: Expandable list with phase tags (`[generate]`, `[publish]`) so users know where it failed.
- **Retry failed**: Creates a new job targeting only previously failed flows.
- **Confluence warning**: If no Confluence settings configured, show a warning banner — docs will generate and save but not publish.

### Step 9: Integration into Existing UI

**File:** `app/page.tsx` or `components/ComponentList.tsx`

- Add a "Bulk Docs" button in the flows tab header (next to the existing Sync button).
- Clicking opens the `BulkDocumentationPanel` as a modal or slide-over.
- Per-flow status badges in `ComponentList`:
  - Gray dot = no documentation
  - Blue dot = documented (draft)
  - Green dot = published to Confluence

---

## Batching & Rate Limit Strategy

| Resource | Limit | Our Approach |
|----------|-------|--------------|
| **Claude API** | ~50-4000 RPM (tier-dependent) | 5 concurrent calls per batch, 2s delay between batches = ~25-30 RPM (safe for all tiers) |
| **Confluence API** | 100 RPM | 3 concurrent calls per batch (each may need 2 requests: version fetch + update), 1.5s delay = ~40 RPM |
| **Convex action timeout** | 10 minutes | Single action processes all 3 phases sequentially. For very large envs (500+ flows), the action self-checkpoints and schedules a continuation. |
| **D365 OData** | ~60 RPM | Definition fetch: 5 concurrent + 1s delay = ~25 RPM |
| **Convex mutations** | No hard limit | One mutation per doc save — lightweight upserts |

### Handling Large Environments (500+ Flows)

If total estimated time exceeds ~8 minutes (based on flow count):
- The action processes as many batches as it can within 8 minutes.
- Before timeout, it saves progress and schedules a **continuation action** via `ctx.scheduler.runAfter(0, ...)` with the remaining flow IDs.
- The job record persists across continuations — UI progress remains seamless.

---

## Error Handling

| Scenario | Phase | Behavior |
|----------|-------|----------|
| Claude API rate limit (429) | Generate | Exponential backoff: wait 5s, 10s, 20s. After 3 retries, mark flow as failed and continue. |
| Claude API error (500) | Generate | Retry once after 3s. If still fails, mark flow as failed. |
| Flow missing `clientData` | Generate | Skip flow, increment `skippedFlows`, log reason. |
| `clientData` unparseable | Generate | Mark as failed with "Invalid flow definition" error. |
| Confluence rate limit (429) | Publish | Backoff: wait 5s, retry up to 3 times. |
| Confluence auth error (401/403) | Publish | Abort publish phase entirely — likely bad credentials. Surface error to user. |
| Confluence page conflict (409) | Publish | Re-fetch page version and retry update once. |
| No Confluence settings | Publish | Skip entire publish phase. Job completes with `publishedFlows: 0` and a warning. |
| Convex action timeout | Any | Self-checkpoint before timeout, schedule continuation (see above). |
| User cancels job | Any | Action checks `job.status` each batch. If `cancelled`, stop processing and finalize counts. |

---

## File Changes Summary

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `bulk_doc_jobs` table (with `phase` and `publishedFlows` fields) |
| `convex/mutations.ts` | Add 5 job lifecycle mutations (create, updateProgress, updatePhase, complete, cancel) |
| `convex/queries.ts` | Add 2 job status queries |
| `convex/actions.ts` | Add `bulkFetchFlowDefinitions` action |
| `convex/actions/documentation.ts` | Add `startBulkDocumentation`, `bulkGenerateDocumentation`, `bulkPublishToConfluence` actions |
| `convex/lib/claude.ts` | Add retry logic with exponential backoff for 429/500 |
| `components/BulkDocumentationPanel.tsx` | New — bulk generation + publish UI with phase-aware progress |
| `app/page.tsx` | Add bulk docs button to flows tab |

---

## Out of Scope (Future Enhancements)

- **Configurable batch size** — Admin setting to tune concurrency based on Claude API tier.
- **Scheduled/automatic doc generation** — Cron-based re-generation when flows change.
- **Cost estimation** — Show estimated Claude API token cost before starting.
- **Selective publish** — Choose which flows to publish vs. keep as draft.
- **Confluence page hierarchy** — Auto-organize pages by flow category or status under parent page.
