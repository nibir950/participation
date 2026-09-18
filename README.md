# GridWise — BUP CSE Fest 2026 · React + Express + Node

A complete React + Express + Node.js application with **local JSON-file run history** for the **LLM-assisted campus energy scheduling** challenge in your participant pack. It uses no MongoDB, Atlas, SQL service, Firebase, Supabase, or other external database. One production service serves both the dashboard and the exact judging endpoints.

![Dashboard showing an explicitly labeled public sample demo](docs/dashboard-preview.png)

**Start with the sample dashboard in three commands. Then connect a real language model before testing or submitting `/optimize-energy`.** The sample demo is deliberately labeled and never substitutes for the mandatory LLM.

## 1. Run on your computer

Install **Node.js 22.12 or newer**. Node.js 24 was used for package verification. Extract this ZIP, open a terminal inside `gridwise-mern` (the directory containing this README and the root `package.json`), and run:

```bash
npm ci
npm run setup
npm run dev
```

Open **http://localhost:5173**. Backend: **http://localhost:4001**. Keep the terminal open; Ctrl+C stops both processes. These commands work in Windows PowerShell, Command Prompt, macOS and Linux. If PowerShell blocks `npm.ps1`, use `npm.cmd` for these commands.

The dashboard initially runs SAMPLE-01 using the organizer's **reference directives**, then computes a fresh optimal schedule. This works without a model or any database server. It is a demonstration of the optimizer, not a live LLM result. The UI shows this distinction. Editing notes affects only the LLM run; **Run original sample demo** restores the original public input.

## 2. Connect the required language model

The real path uses a language-capable generative model through the **OpenAI-compatible `/chat/completions` HTTP contract**. Calls use Node's built-in `fetch`; no provider-specific SDK is required. This project is configured for **Google Gemini API by default**, so Ollama is not required.

### Gemini API (free tier)

1. Open Google AI Studio and create a Gemini API key: https://aistudio.google.com/app/apikey
2. Run `npm run setup` if you have not already done so.
3. Open the root `.env` file and set:

```dotenv
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-3.8-flash
GEMINI_API_KEY=PASTE_YOUR_GEMINI_API_KEY_HERE
LLM_RESPONSE_FORMAT=json_schema
```

`LLM_API_KEY` is still supported as a backward-compatible alternative, but `GEMINI_API_KEY` is clearer for this setup. **Never put the key in React source, a `VITE_` variable, Git, screenshots, or the submitted ZIP.** Gemini free-tier availability and quotas depend on Google's current model/account/region rules.

Restart `npm run dev`. The backend probes the real model and reports readiness. In a separate terminal:

```bash
curl http://localhost:4001/health
npm run test:live
```

Use `curl.exe` instead of `curl` on Windows PowerShell. `/health` must return `{"status":"ok"}`. A 503 response is intentional while the model is unavailable, the API key is missing/invalid, or quota/configuration is rejected.

Google documents an OpenAI-compatible Gemini endpoint at `https://generativelanguage.googleapis.com/v1beta/openai/`, which is why the existing chat-completions integration can be reused without installing another SDK. The project also requests structured JSON and still performs deterministic local validation before optimization.

### Another authorized hosted model

You can still use another OpenAI-compatible provider. Set `LLM_BASE_URL` to its base URL, `LLM_MODEL` to a model available to your account, and `LLM_API_KEY` to your credential. Do not append `/chat/completions`; the code appends that path. If the provider supports JSON objects but not strict JSON Schema, set `LLM_RESPONSE_FORMAT=json_object`. If it supports neither, use `none`; deterministic output validation still applies. If the model forbids temperature, leave `LLM_TEMPERATURE=` blank. Some models require `LLM_TOKEN_PARAMETER=max_completion_tokens` rather than `max_tokens`.

Keys stay in the server `.env`. Raw provider failures are not returned to users. Unsupported provider parameters must be corrected in configuration; there is no silent regex or canned-answer fallback.

Gemini references: https://ai.google.dev/gemini-api/docs/openai and https://ai.google.dev/gemini-api/docs/pricing

## 3. Local history storage — no external database

No database server is required. The backend persists the latest run records directly to a local JSON file configured by `HISTORY_FILE`:

```dotenv
HISTORY_FILE=data/run-history.json
```

The default file is created automatically under the project root. The store keeps at most 100 recent records and writes updates atomically through a temporary file. Set `HISTORY_FILE=` to use memory-only history during tests or disposable runs.

When Docker Compose is used, `/app/data` is attached to a named Docker volume so the JSON history survives container recreation without running a database container. In production, set `DASHBOARD_TOKEN` if you want to allow access to the history routes. The public judging endpoints remain unaffected.

## 4. Judge API

### Health

```bash
curl http://localhost:4001/health
```

Returns HTTP 200 and `{"status":"ok"}` once the model probe succeeds. It returns 503 before readiness. Local history storage is independent from model readiness. `LLM_WARMUP=false` bypasses the startup probe and declares configuration ready; keep the default `true` for a submission.

### Optimize

Run from the project root:

```bash
curl -X POST http://localhost:4001/optimize-energy \
  -H "Content-Type: application/json" \
  --data-binary @samples/sample-01.json
```

Windows PowerShell (one line):

```powershell
curl.exe -X POST http://localhost:4001/optimize-energy -H "Content-Type: application/json" --data-binary "@samples/sample-01.json"
```

Send **one case's `input` object**, not the full public-case pack and not its expected output. The input contains `scenario_id`, 1–3 `operator_notes`, 24 `hours`, and `battery` with the exact keys in the supplied statement. Hour entries may be in any order; the server verifies uniqueness and sorts them.

Success includes exactly:

```text
scenario_id
directive_interpretation
hourly_plan
total_grid_kwh
total_cost_bdt
peak_grid_kwh
plan_summary
```

Headers expose non-secret diagnostics: `X-Run-Id`, `X-Elapsed-Ms`, `X-Interpretation-Source` (`llm` or `llm-cache`), and `X-Schedule-Verified`. No extra fields are added to the judge JSON.

| Status | Meaning |
|---|---|
| 200 | Valid interpreted, optimized and independently checked schedule |
| 400 | Malformed JSON, invalid field types, duplicate/missing hours, invalid battery, or body above 1 MB |
| 422 | Well-formed directives create an infeasible schedule |
| 500 | Controlled model, solver or internal failure; no invented fallback plan |

Errors are JSON: `{"error":{"code":"...","message":"...","details":["..."]}}`; `details` is optional. No stack traces or provider response bodies are exposed.

### Dashboard-only routes

| Route | Function |
|---|---|
| `GET /api/status` | Model, storage and demo availability |
| `GET /api/examples` | Public sample inputs and reference costs |
| `POST /api/demo/:id` | Public sample optimizer demonstration using official reference directives |
| `GET /api/runs` | Latest 50 run summaries; history authorization applies |
| `GET /api/runs/:id` | A saved run's input and output; history authorization applies |

The demo route cannot accept arbitrary input or enable a fallback on `/optimize-energy`. Set `ENABLE_DEMO=false` to disable it in the submitted service.

## 5. How the solution works

1. **Validate request:** exact input structure, 24 distinct hours, real numeric values, valid starting battery bounds.
2. **Interpret notes:** one model call processes all 1–3 notes. A strict JSON Schema and a domain prompt describe the six permitted directive types, percentages and half-open windows. Notes are data, not authority to change the parser or base scenario.
3. **Guardrail:** validate note mapping, exact fields, types, sorted unique hours, `applies`, no-op null semantics and numeric ranges. Invalid model output gets at most one model retry within the shared deadline. Code never invents a missing value or changes an invalid type to `no_op`.
4. **Apply directives:** derive per-hour solar limits, charge/discharge limits, battery reserves and grid caps.
5. **Optimize:** solve a continuous linear program with [`javascript-lp-solver`](https://github.com/JWally/jsLPSolver), minimizing the exact grid-cost objective across all 24 hours. There is no 1-kWh discretization or greedy tariff heuristic.
6. **Replay:** an independent checker recalculates every balance, state transition, directive, final neutrality and total before the response is released.
7. **Persist:** save the successful result to the local JSON history file; no database service is contacted.

See [the mathematical model and proof](docs/ARCHITECTURE.md) and [requirement mapping](docs/REQUIREMENTS.md).

## 6. Tests and recorded results

```bash
npm test
npm run test:samples
npm run build
```

The original optimizer/API suite contains the full directive, retry/timeout, cache, HTTP-adapter, battery, infeasibility, fractional/zero-input and generated-scenario checks. This no-database revision also adds `server/test/store.test.js`, which verifies that local JSON history survives a store restart. Run the commands above after `npm ci` on your machine before submission.

The included browser report covers desktop/mobile layout, CSV export, JSON display, sample switching, editing, live-button routing with a **mocked** provider, and protected-history reopening. See [ui-test-report.json](docs/ui-test-report.json). The no-database revision separately tests local JSON persistence. A real hosted-model test is still required.

All **10 supplied public cases match the published optimal cost** with independently valid schedules when given the public ground-truth directives. Details: [sample-test-report.json](docs/sample-test-report.json). This is an **offline optimizer result**, not evidence of real-model extraction accuracy or hidden-judge performance.

After configuring your real model, start the API and run:

```bash
npm run test:live
npm run test:live -- https://YOUR-DEPLOYED-BASE-URL
```

The live harness compares interpreted types/hours/numbers with reference semantics and replays each returned schedule against **organizer ground truth**, not just the model's own claims. It checks cost, reports sample p95 and exits nonzero on a failure. Hosted model calls may incur charges. Clear/restart the API if you want uncached measurements, or set `LLM_CACHE_TTL_MS=0` and restart.

**Verification limits:** a live LLM was not available during package creation. Real provider accuracy/latency, container startup, public hosting and image pulls must be verified in your environment before submission. Local JSON history requires no external service. No public deployment, registry image or video is represented as already created.

## 7. Production and Docker

Build and serve everything from one Node service:

```bash
npm ci
npm run build
npm start
```

The production dashboard is at **http://localhost:4001**. Configure `NODE_ENV=production`, `LLM_*`, `HISTORY_FILE`, and `DASHBOARD_TOKEN` on the host. The service honors the host's `PORT` and binds to `0.0.0.0`. Choose an always-running service for the judging window; a sleeping instance can miss readiness/latency thresholds.

Docker build (tests and dashboard compilation run during the build):

```bash
docker build -t gridwise-mern:1.0.0 .
docker run --rm --env-file .env -p 4001:4001 -v gridwise-history:/app/data gridwise-mern:1.0.0
```

The default Gemini endpoint is reachable from a normal Internet-connected container. No database endpoint is needed. If you later switch to a local model, remember that `localhost` inside a container means the container itself.

Compose option:

```bash
npm run setup
docker compose up --build -d
docker compose logs -f app
```

Compose reads `.env`, starts only the application service, and mounts a small named volume at `/app/data` for the local JSON history file. It uses **`LLM_DOCKER_BASE_URL`**, which defaults to the Gemini OpenAI-compatible endpoint. Set `DASHBOARD_TOKEN` if you need history in Compose's production mode. Stop with `docker compose down`; the history volume is retained unless you explicitly remove volumes.

For image publication and the required fallback pull/run check, follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). This ZIP includes a Dockerfile and Compose configuration, not an already published image.

## 8. Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT`, `HOST` | `4001`, `0.0.0.0` | HTTP listener |
| `NODE_ENV` | `development` in example | Production behavior and history access |
| `HISTORY_FILE` | `data/run-history.json` | Local JSON run-history path; blank uses memory only |
| `LLM_BASE_URL` | Gemini OpenAI-compatible endpoint | Model provider base URL |
| `LLM_MODEL` | `gemini-3.8-flash` | Model identifier |
| `GEMINI_API_KEY` | blank | Gemini API key, server only |
| `LLM_API_KEY` | blank | Backward-compatible key for other providers |
| `LLM_RESPONSE_FORMAT` | `json_schema` | `json_schema`, `json_object`, or `none` |
| `LLM_TEMPERATURE` | `0` | Blank omits this model parameter |
| `LLM_TOKEN_PARAMETER` | `max_tokens` | Or `max_completion_tokens` |
| `LLM_MAX_TOKENS` | `1600` | Output token limit |
| `LLM_TIMEOUT_MS` | `11000` | Timeout per provider call |
| `LLM_REQUEST_BUDGET_MS` | `25000` | Total shared interpretation deadline; max 27000 |
| `LLM_RETRIES` | `1` | At most one retry within the budget |
| `LLM_MAX_CONCURRENCY` | `6` | Concurrent distinct provider requests |
| `LLM_CACHE_TTL_MS` | `300000` | Validated model result cache duration; 0 disables |
| `LLM_CACHE_SIZE` | `128` | Maximum cache entries |
| `LLM_WARMUP` | `true` | Probe real model before readiness |
| `ENABLE_DEMO` | `true` | Enable separate public sample demonstration |
| `DASHBOARD_TOKEN` | blank | Production history access; no effect on judge API |
| `LLM_DOCKER_BASE_URL` | Gemini endpoint | Compose-only model base URL override |

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard cannot reach API / `ECONNREFUSED` | Run `npm run dev` from the root and read backend startup output. Vite proxies to the root `.env` port. |
| `/health` is 503 | Verify Internet access, Gemini API key, model name, quota and base URL. Startup retries every 30 seconds. |
| `LLM_CONFIGURATION` | Check model identifier and the provider's response-format, token-limit and temperature parameters. |
| `LLM_TIMEOUT` | Check Internet/provider latency or use a faster configured endpoint. Keep the total budget below the judge limit. |
| `INVALID_MODEL_OUTPUT` | Use the live test to inspect failures. Use a model with reliable structured extraction; no unsafe repair is performed. |
| `INFEASIBLE` | Inspect extracted hours/reserves/caps. Valid organizer cases are feasible; a model may still misinterpret a note. |
| Local history cannot be written | Check that the project/data directory is writable or choose another `HISTORY_FILE` path. Optimization still runs; the current process retains recent runs in memory. |
| `EADDRINUSE` | Stop the other app or change `PORT`; restart development processes. Vite uses 5173. |
| New production build is not served | Run `npm run build` **before** `npm start`, then restart the server. |
| Raw JSON editor changes do not affect a plan | Click **Apply JSON changes** first, then **Optimize with LLM**. |
| Missing native binding after copying another computer's dependencies | This ZIP intentionally excludes `node_modules`. Install with `npm ci` on the target computer. |

## 10. Project map and submission

| Location | Responsibility |
|---|---|
| `client/src` | React dashboard, charts, scenario editor, history, downloads |
| `server/src/prompt.js` | Versioned interpretation prompt and output schema |
| `server/src/interpreter.js` | Model adapter, deadline, retry, cache, readiness |
| `server/src/validation.js` | Deterministic request and directive guardrails |
| `server/src/directives.js` | Directive-to-hourly-limit application |
| `server/src/optimizer.js` | Exact linear-program formulation and schedule |
| `server/src/replay.js` | Independent energy/directive/total checker |
| `server/src/store.js` | Local JSON-file persistence and bounded memory history |
| `server/src/app.js` | Judge API and dashboard routes |
| `server/test` | Offline tests; mocked model is used only in tests |
| `samples` | Original public-case JSON and ten extracted input files |
| `scripts` | Setup, development runner, offline and live sample checks |
| `docs` | Architecture, requirement mapping, deployment, video outline, results |

Use [SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md) and [VIDEO_OUTLINE.md](docs/VIDEO_OUTLINE.md). The participant guide requires a reachable API, appropriately timed/private-then-public source repository, pullable Docker image with exact tag/digest, README and a maximum 3-minute video. Review the event's full rulebook as well. Learn, review and adapt the architecture with your team; do not claim unperformed live checks or sole authorship of AI-assisted work.

## Credits and scope

- Requirements and sample data: user-supplied BUP CSE Fest 2026 GridWise participant pack. Original public sample JSON is included unchanged for verification.
- Implementation was produced with an AI coding assistant. Team review and contribution are needed for your submission.
- React / React DOM, Vite, Express and javascript-lp-solver are external open-source dependencies; exact tested versions and transitive packages are in `package-lock.json`.
- Solver: continuous simplex LP. Battery model follows the challenge's unit-efficiency, no-export, fixed 24-hour assumptions. It does not model real battery degradation, grid losses or physical dispatch hardware.
- Overlapping solar reductions are interpreted as simultaneous bounds on the original forecast: use the smallest remaining fraction. The supplied documents do not explicitly resolve compounded overlapping reductions; see the documented assumption in the architecture.
- Deterministic guardrails validate structure and ranges, not the truth of every natural-language interpretation. The independent checker enforces the extracted directives; the live test and organizer judge additionally use ground truth. A live model can still misinterpret a grammatically valid note.
