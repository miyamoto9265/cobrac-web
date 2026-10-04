# BRA generation: speed and cost (v0.17.1–v0.18.2)

| Item | Details |
| ---- | ------- |
| Document | How long BRA generation takes and what it costs in OpenAI usage: the investigation into where the time goes, the v0.18.0 speed-up and its before/after comparison, the fix for usage counted twice (v0.17.1) and the correction of older jobs (v0.18.1), and faster recovery from Spot interruptions (v0.18.2) |
| Audience | Users, operators, and anyone checking how long BRA generation takes or what it costs |
| Versions | App 0.17.1–0.18.2 (all released on 2026-10-01). The investigation looked at production runs on 0.16.0 |
| Related | [07_CoBRAC_Harness_v1_1_to_v2.md](./07_CoBRAC_Harness_v1_1_to_v2.md) (harness v2) / [03_AWSインフラと予算.md](./03_AWSインフラと予算.md) / [01_設計仕様.md](./01_設計仕様.md) / 日本語: [09_BRA_speed_and_cost_ja.md](./09_BRA_speed_and_cost_ja.md) |
| PRs | [#61](https://github.com/miyamoto9265/cobrac-web/pull/61) (0.18.0 speed-up), [#63](https://github.com/miyamoto9265/cobrac-web/pull/63) (0.17.1 double count), [#69](https://github.com/miyamoto9265/cobrac-web/pull/69) (0.18.1 correction of older jobs), [#66](https://github.com/miyamoto9265/cobrac-web/pull/66)–[#68](https://github.com/miyamoto9265/cobrac-web/pull/68) and [#70](https://github.com/miyamoto9265/cobrac-web/pull/70) (0.18.2 Spot interruption, clones, message language) |

---

## 1. In short

On 0.16.0, 88% of the time of a BRA run (60 minutes on average in production) was spent waiting for the model to answer. How long one response takes depends mostly on the context of the request, that is, how long the conversation behind it is. Under 80k tokens the fixed wait is about 4 seconds; above 120k it is about 42 seconds. The conversation was compacted only at 150k tokens then, so close to three quarters of the model time was spent in this slow range.

v0.18.0 therefore compacts at 75k tokens, makes the tool results and the way files are written smaller, and runs fix turns at reasoning effort medium. With the same ROI and TLF, three runs before and three after the change gave **48.6 minutes on average before and 31.0 after (36% shorter), and a real cost of $0.174 before and $0.134 after (23% lower)**. Three runs each is a small sample, though, and some changes deserve watching, such as fewer candidates in the research step ([5.4](#54-caveats)).

The same investigation found that **the cost the app recorded was 2–3 times the real cost**. Codex reports usage as the thread's running total, and the worker added that total every turn. v0.17.1 fixed the records of new jobs, and v0.18.1 corrects older jobs when they are read. v0.18.2 also stops a Fargate Spot interruption from throwing away the work of the running turn, and resumes an interrupted job after about 5 minutes instead of 15–30.

---

## 2. Terms

| Term | Meaning |
| ---- | ------- |
| Context | The whole conversation sent to the model with one request (instructions, earlier responses, tool results), counted in tokens |
| Compaction | Codex summarising the conversation so far once it is longer than a threshold, `CODEX_AUTO_COMPACT_TOKENS` |
| Main turn, fix turn | A main turn does the work of a step (research, HCD, FRG). A fix turn fixes the list of problems the worker's validator sent back |
| TPM | The organisation's OpenAI limit in tokens per minute; 200k tokens per minute for gpt-6-luna |
| Session record | The log Codex keeps per thread (`rollout-…jsonl`), with the time, tokens and tool calls of every response; saved to S3 under `thread/sessions/` |
| Real cost | Cost computed from the token counts in the session records and the prices |
| Recorded cost | Cost the app records per job in DynamoDB and shows on screen |
| Fargate Spot | The cheaper AWS capacity the worker runs on. AWS may interrupt it and sends SIGTERM two minutes before |
| Heartbeat, janitor | The worker writes a heartbeat (a timestamp) every minute. The janitor is a scheduled Lambda that resumes jobs whose heartbeat is more than 15 minutes old |

---

## 3. Finding out where the time goes

### 3.1 Method

The investigation started no new paid jobs and used only existing records.

- **Data**: jobs and messages in DynamoDB, the Codex session records in S3, and CloudWatch logs (the worker logs are kept only briefly and were nearly empty)
- **Runs**: three completed full runs of user projects (A, B and C below; only aggregate numbers are used, not their content) and the test user's `ufwwj0jg-1`. All ran on 0.16.0 with `gpt-6-luna`, reasoning effort high and research mode on
- **Analysis**: from the session records, the latency of every response, the context length at the time, the output tokens and the tool call that followed

### 3.2 Where the time goes

![By stage the HCD takes longest at 41.1 minutes, followed by research at 12.8 and the FRG at 5.5. By kind, waiting for the model takes 52.9 minutes, 88% of the total; waiting for tools takes 6.0 minutes, and the worker's checks and output and the start-up take less than a minute each](./figures/speed-cost-breakdown.en.svg "Figure 1. Where the time of one BRA run goes (3 production runs, average 60.2 min, v0.16.0)")

The three runs A, B and C took 60.2 minutes on average (55.2, 71.9 and 53.4). By stage, the HCD takes 68%; by kind, most of the time in every stage is waiting for the model.

| Kind | Time (average of 3) | Share |
| ---- | ------------------: | ----: |
| Waiting for the model | 52.9 min | 88% |
| Waiting for tools (literature MCP, RCS, shell; parallel calls counted once) | 6.0 min | 10% |
| Worker checks (references, quotes, RCS, schemas) and CSV / xlsx | 0.6 min | 1% |
| Start-up and queue | 0.7 min | 1% |
| Rate-limit waits (Reconnecting) | 0 | 0% (none in these three runs) |
| Compaction | a few seconds in total | about 0 |

A run made 105–146 requests, produced 140k–190k output tokens (80k–95k of them reasoning) and read 8.8M–12M input tokens, 93% of them from the cache. Making the worker or the literature tools faster would save very little; the room for improvement is in the wait for the model.

### 3.3 Response latency depends on the context length

The latency of the 482 responses of four runs was fitted as "fixed wait + output tokens ÷ output speed", split by context length.

![The 203 responses with a context under 80k tokens had a fixed wait of 3.9 s, the 140 between 80k and 120k 16.3 s, and the 139 above 120k 41.8 s. The model time adds up to 48, 81 and 124 minutes, so responses above 80k take 80% of it](./figures/speed-cost-latency.en.svg "Figure 2. Context length and response latency (4 runs, 482 responses)")

| Context | Responses | Fixed wait | Output speed | Total model time |
| ------- | --------: | ---------: | -----------: | ---------------: |
| under 80k tokens | 203 | 3.9 s | 112 tokens/s | 48 min |
| 80k–120k | 140 | 16.3 s | 105 tokens/s | 81 min |
| above 120k | 139 | 41.8 s | 112 tokens/s | 124 min |

- The output speed is about 110 tokens/s in every band. Long contexts are slow not because output is slower but because the fixed wait before the response starts is longer.
- Around the 11 compactions, the 6 responses just before took a median of 25–68 s (context 120k–190k), and the 6 just after took 2–6 s (20k–60k). Some had almost the same output: one response of 321 tokens took 43 s, another of 383 tokens came back in 3.3 s.
- With compaction at 150k tokens, 73% of the model time was spent with a context of 80k tokens or more.
- Responses with a long context took a median of 22 s even when little had been sent in the previous 60 seconds, and no 429 (rate limit) came back even when more than 200k tokens had been sent. The main cause therefore seems to be that the server is slower with a longer context, not TPM throttling. OpenAI's internals could not be confirmed, though.
- Had every response above 80k come back at the speed of those under 80k, each run would have been 17–23 minutes shorter. That is the upper bound of what a smaller context can save.

For the HCD main turn, splitting the wait by the tool call that followed each response gave 31% for writing files, 26% for the literature MCP and 15% for the agent's own checks (reading JSON with Python, checking schemas by hand). The output written was about three times the size of the final HCD files, because whole files were rewritten again and again. The agent's own checks duplicate the checks the worker runs afterwards.

### 3.4 Failures and retries added to the wait

Of the 21 jobs at the time, 12 had failed and 1 had been cancelled. 11 of the 12 failures came from the context or the TPM limit (a single request above the TPM limit, a failed pre-compaction, or a run stuck in Reconnecting). The remaining one was a lost heartbeat, probably a Spot interruption ([chapter 7](#7-recovering-from-spot-interruptions-and-other-fixes-v0182)). `ufwwj0jg-1`, for example, failed after 67 minutes and waited until the user retried it. Such failures and retries are part of the slowness users feel, and a smaller context should make them rarer as well.

---

## 4. The v0.18.0 changes

### 4.1 Options considered

The options below were compared on the basis of the investigation. The savings are estimates for a 60-minute run. They overlap (a smaller context makes each round trip cheaper, which shrinks the gain from fewer round trips), so they cannot simply be added.

| # | Option | Expected saving | Quality risk | Decision |
| - | ------ | --------------: | ------------ | -------- |
| 1 | Keep the context small (lower compaction threshold, shorter tool results) | 10–20 min | Low to medium. Compaction may drop details of quotes read earlier, but the files hold the work | **Adopted in 0.18.0** |
| 2 | Prefetch literature and RCS (the worker fetches in parallel before the HCD and writes a materials file) | 5–10 min | Neutral to better | Adds a step to the workflow, so only after discussion |
| 3 | One command for validation (give the agent the worker's checks as a CLI instead of manual checks) | 3–8 min | Better | Next candidate |
| 4 | Less output (write a file once, then edit) | 3–6 min | Low to medium | **Adopted in 0.18.0** |
| 5 | Effort per step (fix turns at medium) | 1–3 min | Low for fix turns | **Adopted in 0.18.0** |
| 6 | Parallel research (split candidate searches over 2–4 sub-threads) | 2–4 min (at today's TPM) | Medium | Deferred until the TPM limit is higher |
| 7 | Priority service tier (`service_tier`) | unknown | none | Needs a paid measurement; not checked |
| 8–11 | Literature tool tuning, caching results, pipelining output, warm workers | 2 min or less each | Low to medium | Too small; not pursued |
| 12 | HCD per region or per UC in parallel, FRG in parallel | effectively 0 | High | Not possible ([4.2](#42-why-parallel-work-can-save-little)) |

Options 1, 4 and 5 are all changes to settings, constants and prompts, and all lower the cost, so they went in first as one PR ([#61](https://github.com/miyamoto9265/cobrac-web/pull/61)).

### 4.2 Why parallel work can save little

Running things in parallel was the first idea considered, but it could save only a few minutes of the research step.

![Research, HCD, FRG, the adjustment turn and CSV / xlsx can only run in order, because each step takes the previous one's result as input. Only the candidate search of the research step could run in parallel. The organisation's TPM limit is 200k tokens per minute and one thread already uses 140k–170k per minute on average, so a second thread soon hits the limit](./figures/speed-cost-sequential.en.svg "Figure 3. Why parallel work can save little")

- **The order of the steps is fixed.** The FRG takes the HCD's UCs and connections as input, and the adjustment turn looks at both the HCD and the FRG. Research → HCD → FRG → adjustment is sequential because each depends on the one before.
- **The HCD cannot be split either.** It is one graph whose UC granularity, cross-region connections, interface mapping and Collections depend on each other; built per region in separate threads, the parts would have to be reconciled again when joined. The FRG (5.5 minutes on average) is one tree that needs every UC assignment and the combined interfaces, so splitting it gains nothing. The output step (CSV, xlsx, graphs) takes 0.1 minutes to begin with.
- **Only the evidence gathering can run in parallel.** The research step's candidate searches could be spread over several threads, but the organisation's TPM limit for gpt-6-luna is 200k tokens per minute and one thread already uses 140k–170k per minute on average. A second thread would soon hit the limit and wait. The estimated saving at today's TPM is 2–4 minutes.
- In the newer runs (B and C) Codex already uses "code mode", calling several tools together from JavaScript inside `exec`, so tool calls are partly parallel already.

### 4.3 The three changes

![The compaction threshold drops from 150k to 75k tokens, and smaller tool results and edits keep the conversation under 80k tokens. Fix turns run at reasoning effort medium. As a result, waiting for the model fell from 41.7 to 24.2 minutes and the total from 48.6 to 31.0 minutes](./figures/speed-cost-changes.en.svg "Figure 4. The three changes of v0.18.0 and why they save time")

| Change | What | Where |
| ------ | ---- | ----- |
| ① Compaction threshold | The default of `CODEX_AUTO_COMPACT_TOKENS` is 75,000 instead of 150,000. The infrastructure does not set the value, so the code default alone switches it. A compaction takes a few seconds, and the work stays in the project files | `packages/worker/src/env.ts` |
| ② Shorter tool results | `find_sentences` returns up to 8 sentences instead of 15, and literature searches return 8 hits by default instead of 10 | `packages/worker/src/litsearch.ts`, `litMcp.ts` |
| ② Smaller edits | The agent's shared rules gain a "Working efficiently" section: write each file once when its content is decided and then change it with small edits, do not print whole files to check them, query literature with `max_results` 5–8 and RCS with `top_k` 5 or less, and run independent lookups together | `prompts/AGENTS.md` |
| ③ Fix turns at medium | Fix turns for validator problems, research coverage gaps and CSV problems run at `min(project effort, medium)`. The research survey, the HCD and FRG main turns and the adjustment turn keep the project's effort | `fixTurnEffort` (`packages/shared/src/types.ts`), `packages/worker/src/index.ts`, `pipeline.ts` (`Prompt.effort`) |

① and ② both keep the conversation under 80k tokens. ③ rests on the idea that a turn that only fixes a list of problems does not need long reasoning. The main turns keep their effort because it is more likely to affect quality.

---

## 5. Before and after

### 5.1 Method

- Runs used the test user (`cobrac/langrerun-test-user`) and its key, with the same settings as `ufwwj0jg-1`: ROI "Angular gyrus, fosiform gyrus, VWFA, Broca, Wernicke", TLF "nonword reading", research mode on, `gpt-6-luna`, reasoning effort high, Japanese.
- Three runs before (`ufwwj0jg-6` to `8`) and three after (`ufwwj0jg-9` to `11`) ran one at a time, never together, so that they did not compete for the TPM limit.
- All ran on production Fargate Spot. Times come from the API and the message records; usage and real cost come from the session records in S3. The recorded cost was not used because of the double count ([chapter 6](#6-usage-counted-twice-v0171-and-the-correction-of-older-jobs-v0181)).
- The comparison runs cost $0.92 in total ($0.52 before, $0.40 after).

### 5.2 Time and cost

![Averages of three runs before and three after. Total 48.6 to 31.0 minutes, research 15.8 to 9.0, HCD 24.3 to 16.5, FRG 7.9 to 5.0, waiting for the model 41.7 to 24.2. Real cost 0.174 to 0.134 dollars, median context 80k to 48k tokens, input tokens 7.63M to 3.90M](./figures/speed-cost-before-after.en.svg "Figure 5. Before and after (same ROI and TLF, 3 runs each, averages)")

| | Before | After | Change |
| - | -----: | ----: | -----: |
| **Total** | **48.6 min** (43.1 / 52.6 / 50.1) | **31.0 min** (28.6 / 35.5 / 28.9) | **−36%** |
| Start-up | 0.6 min | 0.5 min | |
| Research | 15.8 min | 9.0 min | −43% |
| HCD (with fix turns and checks) | 24.3 min | 16.5 min | −32% |
| FRG | 7.9 min | 5.0 min | −37% |
| CSV / xlsx | 0.1 min | 0.1 min | |
| Waiting for the model | 41.7 min | 24.2 min | −42% |
| Responses | 97 | 89 | −8% |
| Context median / max | 80k / 154k | 48k / 86k | |
| Compactions | 2.7 | 5.0 | |
| Input tokens (incl. cache) | 7.63M | 3.90M | −49% |
| Output tokens (incl. reasoning) | 116k | 117k | ±0 |
| **Real cost** | **$0.174** (0.166 / 0.182 / 0.174) | **$0.134** (0.126 / 0.157 / 0.118) | **−23%** |
| Recorded cost | $0.441 (2–3× the real cost) | $0.134 (equals the real cost) | |

- Nearly all the saving comes from shorter waits for the model (−17.5 minutes). The median context fell from 80k to 48k tokens and the maximum stayed at 86k, as section 3.3 predicted. There were about two more compactions per run, but they take very little time.
- The input tokens halved, so the real cost fell too. The output tokens did not change.
- The estimate beforehand was 35–40 minutes; the result is better.
- After the change the recorded cost matched the real cost from the session records, which confirms that the v0.17.1 fix works in production.

### 5.3 Quality

| | Before (per run) | After (per run) |
| - | ---------------- | --------------- |
| UCs | 6 / 7 / 7 | 6 / 7 / 6 |
| Collections | 0 / 2 / 1 | 1 / 1 / 0 |
| BIF / UC connections | 5·6 / 8·13 / 8·13 | 6·13 / 7·12 / 7·10 |
| References | 13 / 12 / 14 | 12 / 13 / 12 |
| FRG nodes | 3 / 4 / 4 | 3 / 3 / 3 |
| Fix turns (problems sent back) | 1 (10) / 0 / 1 (8) | 1 (10) / 1 (7) / 1 (5) |
| Problems left as warnings | 0 / 0 / 0 | 0 / 0 / 0 |
| Reference check (DOI / PMID) | all verified | all verified |
| Quote check (verified / unverified) | 6/0, 6/1, 12/1 | 12/1, 11/1, 8/2 |
| Consistency check (cross_check) | no findings in all 3 | no findings in 2, one X9 in 1 |
| Adjustment turn | not triggered | not triggered |
| Candidate projections in research | 11 / 9 / 11 | 8 / 7 / 7 |

The size of the HCD and the FRG (UCs, connections, references) and the check results (all references verified, no warnings) were about the same before and after.

### 5.4 Caveats

Keep the following in mind when using these results.

- **The sample is small.** With three runs on each side, these numbers cannot tell whether a quality difference is chance. The time difference (48.6 against 31.0 minutes) is larger than the spread of the runs (43.1–52.6 before, 28.6–35.5 after), so the speed-up itself seems real, but its size is uncertain.
- **The research step found fewer candidates.** The candidate projections of the research step fell from 10.3 to 7.3 on average. The coverage check passed in every run, but together with the shorter research step (15.8 → 9.0 minutes) the search may have become narrower. Possible causes are the smaller default number of search hits (10 → 8) and the fix turns at medium; they have not been separated. If needed, the default number of hits can be restored for the research step alone to check.
- **The before runs were not all on the same version.** The first two before runs ran on v0.16.0 and the third on v0.17.0, because v0.17.0 (from other PRs, [#60](https://github.com/miyamoto9265/cobrac-web/pull/60), [#62](https://github.com/miyamoto9265/cobrac-web/pull/62) and [#64](https://github.com/miyamoto9265/cobrac-web/pull/64)) reached production in the middle of the comparison. v0.17.0 changed the HCD prompt (laterality as the `side` facet, the Circuit ID character set) and the error code numbers. The after runs were on v0.18.0, which includes the v0.17.x changes. The third before run (v0.17.0) took 50.1 minutes, within the range of the first two (43.1 and 52.6), so the v0.17.0 changes seem to have had little effect on time, but this is not a comparison of strictly the same version.
- **Smaller differences.** One run's FRG had 3 nodes instead of 4, and one run had an X9 finding (a record-only check).
- **The effect of writing less is not visible.** The output tokens did not change, so this measurement does not show any effect of the instruction to stop rewriting whole files (option 4).

---

## 6. Usage counted twice (v0.17.1) and the correction of older jobs (v0.18.1)

### 6.1 What happened

The investigation in chapter 3 showed that the real cost from the session records did not match the cost the app had recorded. The real cost of A, B and C was $0.24 / $0.28 / $0.21, but the recorded cost was $0.51 / $0.83 / $0.61, 2–3 times as much.

The cause was a misreading of the usage Codex reports at the end of a turn (`turn.completed`). It is not what that turn used but **the running total since the thread started**, and it keeps counting when a later job resumes the thread. The worker added this total every turn, so earlier turns were counted again and again as the run went on.

![The values Codex reports at the end of turns 1–3 are running totals of 3.27, 5.83 and 6.09 million tokens. Up to 0.17.0 each was added, so the record reached 15.18 million, about 2.5 times the real usage. From 0.17.1 only the differences, 3.27, 2.56 and 0.26 million, are added, and the record equals the real 6.09 million](./figures/speed-cost-usage.en.svg "Figure 6. Usage counted twice: the running total was added every turn (input tokens of ufwwj0jg-1)")

In the records of `ufwwj0jg-1`, the value added to DynamoDB in each turn equals the running total in the session record at the end of that turn (`total_token_usage`) for all six turns.

| Turn | Input tokens added to the DB | Running total in the session record |
| ---- | ---------------------------: | ----------------------------------: |
| 1 | 3,265,610 | 3,265,610 |
| 2 | 5,826,689 | 5,826,689 |
| 3 | 6,088,575 | 6,088,575 |
| 4 | 8,400,808 | 8,400,808 |
| 5 | 9,319,890 | 9,319,890 |
| 6 (retry job, resumed in another process) | 10,175,056 | 10,175,056 |

### 6.2 The v0.17.1 fix

[#63](https://github.com/miyamoto9265/cobrac-web/pull/63) counts the usage of a turn as follows (`packages/worker/src/codex.ts`).

- Usage of the turn = running total after the turn (`turn.completed`) − running total before it
- The total before the turn is read from the last `token_count` in the thread's session record (`sessionTotalUsage`). A new thread starts from 0. A thread resumed by a later job continues from where it stopped in the same way.
- A turn resumed after a rate-limit wait uses the last total only once.
- A turn that ends in failure (`turn.failed`) now also records its usage from the session record. Before, such turns counted as 0, so failed jobs were recorded with less usage than they had.

In the comparison runs after the change (5.2), the recorded cost matched the real cost from the session records.

### 6.3 Correcting older jobs (v0.18.1)

Jobs from before v0.17.1 still have 2–3 times the real values in DynamoDB. Rather than rewrite production data, the app **corrects them when they are read** ([#69](https://github.com/miyamoto9265/cobrac-web/pull/69)).

- **Which jobs**: jobs that started before `USAGE_FIX_AT` (2026-10-01 18:33 UTC, when the 0.17.1 worker task definition was registered). Projects created later are left alone.
- **How**: from the usage line each job wrote after every turn (messages with `kind: "usage"`), the running total of each turn is recovered and only its increase is counted. When the total goes down, a new conversation is counted from 0. Jobs that continue the project's conversation (retry, answer, follow-up) count from the previous job's last total; article jobs are treated as separate conversations. The cost is computed again from the corrected usage.
- **Where it shows**: the project list, the project's job table and total, the usage lines in the Agent panel, the usage summary and the admin project list. Nothing is written to the DB.

Correcting with the same function, reading production DynamoDB only, gave the following.

| Project | Recorded cost | Corrected | Real cost from session records |
| ------- | ------------: | --------: | -----------------------------: |
| `ufwwj0jg-6` | $0.416 | $0.166 | $0.166 |
| `ufwwj0jg-7` | $0.374 | $0.182 | $0.182 |
| `ufwwj0jg-1` | $0.879 | $0.202 | $0.309 |

The correction has these limits.

- **Usage that was never recorded cannot be restored.** Before 0.17.1, failed turns were recorded as 0. The correction only derives differences from the recorded totals, so this usage cannot be recovered. The gap between the corrected $0.202 and the real $0.309 of `ufwwj0jg-1` is the failed turns of its two follow-up jobs. Corrected values can therefore be lower than the real cost.
- **Updates over WebSocket are not corrected.** Right after a new job finishes on an older project, the uncorrected total shows until the page is reloaded.
- **The research step metrics** (`researchStep.usage`) are not corrected.
- Even from 0.17.1, turns cut off by a timeout (the research step's 60 minutes) or a cancel, and turns where `codex exec` stops without giving a reason, recorded no usage. From 0.24.1 the worker counts these turns (and turns cut off by a SIGTERM or the 6-hour limit) from the session record and adds them to the cost of the job that ran them ([chapter 8](#8-open-issues-and-next-candidates)).

---

## 7. Recovering from Spot interruptions and other fixes (v0.18.2)

### 7.1 Spot interruptions threw work away

The worker runs on Fargate Spot. When AWS interrupts it, SIGTERM arrives two minutes before. Up to v0.18.1 the workspace was saved to S3 only when a phase was accepted, a question was asked, or the job completed or failed, and SIGTERM was ignored. An interruption therefore lost all the work since the last save. In the HCD⇄FRG trial (2026-09-29), 15 minutes of work were lost and detecting the interruption took 27 minutes.

Detection was slow because of how the janitor worked. It resumes jobs whose heartbeat is more than 15 minutes old, but it ran only every 15 minutes itself, so a job resumed 15–30 minutes after the interruption.

![Up to v0.18.1 the workspace was saved only on phase acceptance, a question, completion or failure; a Spot interruption was ignored and the work since the last save was lost, and the job resumed 15–30 minutes later, once the heartbeat was 15 minutes old and the janitor, every 15 minutes, ran. From v0.18.2 the worker saves the workspace and the thread to S3 every 5 minutes during a turn, and on SIGTERM saves at once and marks its heartbeat stale. The janitor, every 5 minutes, retries the job on its next run, and the job resumes from the saved state about 5 minutes later](./figures/speed-cost-interruption.en.svg "Figure 7. Resuming after a Spot interruption: up to v0.18.1 and from v0.18.2")

### 7.2 Changes ([#66](https://github.com/miyamoto9265/cobrac-web/pull/66))

- **Saving every 5 minutes during a turn.** With the heartbeat every minute, the worker uploads the workspace and the Codex thread to S3 when 5 minutes have passed since the last save (`PERIODIC_PERSIST_MS`). This applies to BRA runs only; article jobs do not write the workspace back. Saves run one at a time so that the heartbeat, phase acceptance and SIGTERM saves never overlap.
- **Saving at once on SIGTERM and handing the job back to the janitor** (`handleStop` in `packages/worker/src/interrupt.ts`). For a running job the Agent panel says that the worker is stopping and the job resumes automatically; the worker saves and then sets `lastHeartbeat` to an old time, so the next janitor run retries the job. For a cancelled job (a cancel's StopTask also sends SIGTERM) it only saves; finished jobs and jobs waiting for an answer are left alone. If the save fails, the job is still handed back.
- **Infrastructure**: the worker container's `stopTimeout` is 120 seconds (the Fargate maximum), to leave time for the save. The janitor runs every 5 minutes instead of 15. The 15 minutes after which a heartbeat counts as stale are unchanged.
- As a result, an interrupted job resumes after about 5 minutes instead of 15–30, and at most 5 minutes of work are lost (almost none when the SIGTERM save succeeds).

### 7.3 Other fixes

v0.18.2 also includes two other fixes.

- **Language of the worker start-up and janitor messages** ([#68](https://github.com/miyamoto9265/cobrac-web/pull/68)). "Worker started", "the worker stopped responding, resuming automatically" and the failure reasons the janitor writes were always in Japanese, whatever the UI language. They are now written as English text with translation keys (`meta.i18n`) and translated into the ten UI languages, also on the project's error banner. Japanese messages stored before the fix are mapped to the same keys.
- **Clones of public projects and research mode** ([#67](https://github.com/miyamoto9265/cobrac-web/pull/67)). A clone copied the workspace (including the research step's `research.json`) but not the research-mode setting, so a follow-up on the clone did not get the research-mode instructions. A clone now keeps the original's research-mode setting. Model and reasoning effort still come from the defaults of the person cloning.

### 7.4 Not yet confirmed

A production Spot interruption cannot be triggered on purpose, so the changes in 7.2 were checked with unit tests and `cdk synth` (`StopTimeout: 120` in the task definition, `rate(5 minutes)` for the janitor). When a real interruption happens, the worker log line `SIGTERM handled: retry` and the "worker is stopping" message in the Agent panel will confirm it.

---

## 8. Open issues and next candidates

| Item | Current state | Next |
| ---- | ------------- | ---- |
| Fewer research candidates | After the change, candidate projections fell from 10.3 to 7.3 on average; the coverage check passed in every run | Separate the causes, for example by restoring the default number of hits for the research step only |
| Further speed-up | The output tokens did not fall | One command for validation (option 3), prefetching literature and RCS (option 2; adds a step, so only after discussion), fewer write round trips |
| Why long contexts are slow | Believed to be server-side, not confirmed | Sending the same small request with 40k and 140k of context would tell. It costs a few cents but is a paid call, so only with permission |
| Priority service tier (`service_tier`) | Whether it is available and how much faster it is is unknown | Also needs a paid measurement |
| Parallel work | Deferred | Consider parallel research once the OpenAI usage tier and the TPM limit are higher |
| Usage of cut-off turns | Fixed: turns ended by a timeout, a cancel, a SIGTERM or a crash without a reason are counted from the session record and charged to the job that ran them | Jobs from before the fix cannot be restored |
| Correction of older jobs | WebSocket updates and the research step metrics are not corrected; failed turns cannot be restored | Address if it becomes necessary |
| Spot interruption handling | Checked with unit tests and synth only | Confirm from the logs at the next real interruption |

---

## 9. Where the code is

| What | Where |
| ---- | ----- |
| Default compaction threshold | `packages/worker/src/env.ts` |
| Literature tool limits | `packages/worker/src/litsearch.ts`, `litMcp.ts` |
| Writing instructions for the agent (Working efficiently) | `prompts/AGENTS.md` |
| Reasoning effort of fix turns | `packages/shared/src/types.ts` (`fixTurnEffort`), `packages/worker/src/index.ts`, `pipeline.ts` |
| Usage per turn (differences, reading the session record) | `packages/worker/src/codex.ts` |
| Correction of older jobs | `packages/shared/src/usageCorrection.ts`, `packages/api/src/lib/usageCorrection.ts` |
| Periodic saves and SIGTERM handling | `packages/worker/src/interrupt.ts`, `index.ts` |
| `stopTimeout` and the janitor schedule | `packages/infra/lib/cobrac-stack.ts` |
| Janitor and start-up messages | `packages/api/src/handlers/janitor.ts`, `dispatcher.ts`, `packages/shared/src/systemMessage.ts` |
| Cloning public projects (`POST /public/projects/:id/clone`) | `packages/api/src/app.ts` |
| Tests | `packages/worker/test/codex.test.ts`, `interrupt.test.ts`, `packages/shared/test/usageCorrection.test.ts`, `research.test.ts`, `systemMessage.test.ts`, `packages/api/test/publish.test.ts` |
