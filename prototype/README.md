# Deloitte AI Delivery Framework — governed prototype

Synthetic S/4HANA procure-to-pay workshop scenario. No real SAP connection or customer data is used.

## Run

Requires [uv](https://docs.astral.sh/uv/) and Python 3.10 or newer. From the repository root:

```sh
cd prototype
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`uv sync` creates `.venv`, installs the locked runtime dependencies and includes the development test group by default. No manual virtual-environment activation is needed.

Add `--reload` while editing `app/` or `static/`. A server started before a code change keeps serving the old routes, which surfaces as a `404` on a newly added endpoint or a `502` when `.env` keys are not loaded yet.

- Workspace: http://127.0.0.1:8000/
- Presentation: http://127.0.0.1:8000/presentation/
- OpenAPI: http://127.0.0.1:8000/docs

Run the 14 tests with:

```sh
uv run pytest -q
```

Update `pyproject.toml` to change dependencies, then run `uv lock` to update `uv.lock`. Use `uv sync --no-dev` for runtime-only dependencies.

To use a separate local database, set `NORTHSTAR_DB=/path/to/prototype.db`. The default is `data/prototype.db`.

Source documents load on first start. Click **Reset Demo** in the top header (`POST /api/reset`) at any time to restore the initial Step 1 state without restarting the server. Roles are demonstration selectors, not production authentication.

## Guided 3-step demo flow

1. **Step 1 — Draft Workshop Report (`WS-04`):** Generate the Workshop Report, click any source passage pill to verify exact quotes, and click **Approve Report & Catch €50k Conflict**. Notice that the approved `€25,000` baseline stays untouched.
2. **Step 2 — Expose Conflict & Impact:** Optionally preview the Fit-Gap Analysis or Steering Summary (both surface the unresolved conflict and block final publication), and check **Impact Alerts** for Target Architecture. Then click **Apply WS-05 Clarification & Approve €50k (v2)**.
3. **Step 3 — Update & Publish (`v2`):** Generate any deliverable (Workshop Report, Fit-Gap, Steering) against approved Knowledge v2 (`€50,000` for `FR01`) and publish a locked version while keeping `v1` in history.

Expand **Show step-by-step governance gates** inside the draft footer or Knowledge panel if you want to walk through the individual lower-level approval gates.

## Generation providers

**Mock** is deterministic, offline and the tested default. It only uses the supplied synthetic fixtures.

**Live Mistral** requires both selecting Live in the UI and setting the server environment:

```sh
export MISTRAL_API_KEY='your-key'
# Optional: export MISTRAL_MODEL='mistral-small-latest'
uv run uvicorn app.main:app --reload
```

Live mode sends the current user's authorized evidence to the configured Mistral endpoint. The default is `https://api.mistral.ai/v1/chat/completions`; override with `MISTRAL_BASE_URL` for a controlled gateway. It validates structured output, citation spans and source hashes, and returns a visible error if the service or validation fails. It never falls back silently to fixtures. No live external call is part of the default test suite.

## Scope

Skills are declarative manifests, not autonomous agents. One generator is dispatched to three skills. Target architecture is a reviewable scenario, not a fourth generation implementation. Production integrations still require enterprise authentication, authorization, tenancy isolation, deployment controls and real S/4HANA interfaces.
