# KeluCalls Backlog

> Confirmed backlog of current KeluCalls problems and planned work.
>
> **Agent rule:** Do not guess requirements. Inspect the existing implementation first. If the expected behavior cannot be determined from this backlog and the project, stop and ask for clarification before making behavioral or architectural changes.
>
> Keep changes scoped to the current backlog item. Do not rewrite unrelated working functionality.
>Keep records of detected error that's is important.
>Always add to the memory important and necessary changes fixes

## BL-001 — Intent Communities

**Priority:** P1  
**Status:** pending

### Goal
Show an **Intent Score** for communities.

### Current situation
The Intent Score plan has not yet been applied because KeluCalls needs community data from:
- X API
- Discord

### Expected outcome
Once the required data sources are available, KeluCalls should collect community data and apply/display an Intent Score for communities.

### Acceptance criteria
- [ ] X API access is available before X community integration.
- [ ] Discord data access/integration is available before Discord integration.
- [ ] Community data can be collected.
- [ ] Intent Score can be associated with communities.
- [ ] Intent Score is displayed in the intended community UI.
- [ ] Existing channel functionality is preserved.

---

## BL-002 — Automated Insight Worker

**Priority:** P0  
**Status:** pending

### Goal
Create an automated worker that produces a **daily Insight article** for the Insight page.

### Data sources
- CoinGecko
- Fear & Greed
- NewsAPI
- KeluCalls internal data

### Planned pipeline

```text
Sources
  ↓
Daily Insight Worker
  ↓
Collect / normalize data
  ↓
LLM
  ↓
Summarize + create daily article
  ↓
Persist
  ↓
Insight Page
```

### Expected outcome
A daily article is automatically generated from fresh market/news data and KeluCalls data.

### Acceptance criteria
- [ ] Worker runs through its scheduled/daily path.
- [ ] CoinGecko data is collected when available.
- [ ] Fear & Greed data is collected when available.
- [ ] NewsAPI data is collected when configured/available.
- [ ] KeluCalls data is collected.
- [ ] Provider failures are isolated and reported.
- [ ] Collected data is passed to the LLM in a controlled format.
- [ ] LLM creates the daily Insight article.
- [ ] Article is persisted.
- [ ] Insight page displays the generated article.
- [ ] Optional provider failure does not unnecessarily kill the whole pipeline.
- [ ] Secrets are never logged or persisted.

---

## BL-003 — Channel Page Only Shows 24 Channels

**Priority:** P1  
**Status:** pending

### Problem
The database has **150+ active channels**, but the Channel Page table shows only the **top 24**. Channels ranked below 24 are not displayed.

### Suspected cause
This appears to be a UI/display limit, but the actual cause must be verified before changing it.

### Expected outcome
Users should be able to access the full active channel inventory.

### Acceptance criteria
- [ ] Determine where the 24-channel limit originates.
- [ ] Channels below rank 24 are accessible.
- [ ] Existing ranking/sorting still works.
- [ ] The solution works on desktop and mobile.
- [ ] The fix does not unnecessarily load all data at once if pagination/incremental loading is more appropriate.

---

## BL-004 — Channel Average ROI / Ranking Distribution

**Priority:** P2  
**Status:** pending

### Problem
The current ranking produces very large Average ROI gaps.

Current example:
- #1: approximately **3500%**
- #2: approximately **1000%**
- #3: approximately **300%**
- Below that: approximately **100%**

### Important understanding
This is **not currently considered a bug**. The result appears to come from the existing formula.

The concern is that extreme ROI values create very large gaps in the ranking.

### Planned improvement
Investigate adding a **median-based component** to reduce the influence of extreme values.

### Constraints
Do not blindly replace the current formula.

First:
1. Inspect the current ROI calculation.
2. Inspect the ranking formula.
3. Determine whether the issue is Average ROI, ranking score, or both.
4. Test a median-based approach using real KeluCalls data.
5. Compare before/after rankings.
6. Only change the formula if the result better represents channel performance.

### Acceptance criteria
- [ ] Current ROI calculation is documented.
- [ ] Current ranking formula is documented.
- [ ] Extreme-value behavior is measured.
- [ ] Median-based approaches are evaluated.
- [ ] Before/after ranking results are compared.
- [ ] Any formula change is justified by measured results.
- [ ] Valid ROI data is not altered merely to make rankings look closer.

---

## BL-005 — Consistent Channel Avatars and Token Logos

**Priority:** P1  
**Status:** pending

### Problem
Channel avatars and token logos are inconsistent.

### Channels
The channel avatar worker runs, but some channels still fail to fetch their avatars.

### Tokens
Token avatars/logos are currently fetched directly from **DexScreener**. A **logo backfill worker** is also used to populate missing token logos.

### Goal
Make channel avatars and token logos as consistent and reliable as possible.

### Expected outcome
- Channels get their correct avatar whenever available.
- Tokens get a reliable logo whenever available.
- Missing images have controlled fallbacks.
- Backfill processes can repair missing images.

### Acceptance criteria
- [ ] Identify why channel avatar fetches fail.
- [ ] Improve handling/backfill of failed channel avatar fetches where appropriate.
- [ ] Document the token logo and backfill flow.
- [ ] Missing token logos are handled gracefully.
- [ ] Missing channel avatars are handled gracefully.
- [ ] Existing valid images are not unnecessarily overwritten.
- [ ] Public pages do not show broken-image states for normal missing-data cases.

---

## BL-006 — Token Chart Loads Slowly

**Priority:** P1  
**Status:** pending

### Problem
The token chart currently loads slowly.

### Goal
Improve token chart loading/perceived performance while preserving data correctness.

### Acceptance criteria
- [ ] Measure the current chart loading path.
- [ ] Identify the actual source of latency.
- [ ] Determine whether the bottleneck is the external data source, KeluCalls API layer, rendering, caching, or another component.
- [ ] Apply a targeted fix.
- [ ] Chart loads materially faster.
- [ ] Chart data remains correct.
- [ ] Mobile performance is considered.
- [ ] No unnecessary API calls are introduced.

---

## BL-007 — Table Components / Mobile Organization

**Priority:** P2  
**Status:** pending

### Problem
Table components need better organization, especially on mobile. Some elements overlap.

This is **not a severe problem**, but the UI should feel more modern and polished.

### Goal
Improve table organization and responsive behavior without changing the underlying functionality.

### Acceptance criteria
- [ ] No important content overlaps on supported mobile widths.
- [ ] Tables remain usable on small screens.
- [ ] Desktop layout remains functional.
- [ ] Table components are more consistently organized.
- [ ] UI feels more modern and polished.
- [ ] Existing table actions/data remain functional.

---

## BL-008 — Fix `npm run lint` Errors

**Priority:** P0  
**Status:** done

### Problem
`npm run lint` currently reports **multiple errors**, mostly from the admin area.

### Goal
Return the project to a clean lint state.

### Acceptance criteria
- [ ] Run `npm run lint`.
- [ ] Identify all current errors.
- [ ] Fix the underlying issues.
- [ ] Do not disable ESLint rules just to make lint pass.
- [ ] Admin functionality remains intact.
- [ ] No new lint errors are introduced.
- [ ] `npm run lint` completes successfully.

---

# Recommended Execution Order

1. **BL-008 — Fix lint errors**
2. **BL-002 — Automated Insight Worker**
3. **BL-003 — Channel Page 24-channel limit**
4. **BL-005 — Channel and token avatars/logos**
5. **BL-006 — Token chart performance**
6. **BL-007 — Table/mobile organization**
7. **BL-004 — Channel Average ROI / ranking**
8. **BL-001 — Intent Communities**

The order can change if investigation reveals a dependency.

# Agent Execution Rules

For every item:

1. Read the relevant existing code first.
2. Understand current behavior before changing it.
3. Do not assume a suspected cause is the real cause.
4. Do not modify unrelated features.
5. Do not rewrite working architecture without a demonstrated reason.
6. Run relevant checks/tests after changes.
7. Record:
   - what was wrong,
   - what was investigated,
   - what was changed,
   - why it was changed,
   - how it was verified,
   - remaining limitations.
8. Mark an item `done` only after its acceptance criteria are satisfied.
9. If requirements are unclear, **stop and ask rather than guessing**.
10. Never read, print, commit, or expose `.env` contents. If an `.env` file is accidentally provided, notify the project owner and instruct them to remove it.

# Progress Log

| ID | Item | Status |
|---|---|---|
| BL-001 | Intent Communities | pending |
| BL-002 | Automated Insight Worker | pending |
| BL-003 | Channel Page 24-channel limit | pending |
| BL-004 | Channel Average ROI / ranking | pending |
| BL-005 | Channel & Token avatars/logos | pending |
| BL-006 | Token chart performance | pending |
| BL-007 | Table/mobile organization | pending |
| BL-008 | npm lint errors | done |
