# Operational Second Brain — governed prototype

Synthetic S/4HANA procure-to-pay workshop scenario. No real SAP connection or customer data is used.

## Run

Requires [uv](https://docs.astral.sh/uv/) and Python 3.10 or newer. From the repository root:

```sh
cd prototype
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`uv sync` creates `.venv`, installs the locked runtime dependencies and includes the development test group by default. No manual virtual-environment activation is needed.

- Workspace: http://127.0.0.1:8000/
- Presentation: http://127.0.0.1:8000/presentation/
- OpenAPI: http://127.0.0.1:8000/docs

Run the 13 tests with:

```sh
uv run pytest -q
```

Update `pyproject.toml` to change dependencies, then run `uv lock` to update `uv.lock`. Use `uv sync --no-dev` for runtime-only dependencies.

To use a separate local database, set `NORTHSTAR_DB=/path/to/prototype.db`. The default is `data/prototype.db`.

Source documents load on first start. To reset the local demo, stop the server, remove `data/prototype.db`, then restart. Roles are demonstration selectors, not production authentication.

## Demo sequence

1. Generate the workshop report as a consultant. Inspect exact cited spans.
2. Approve the faithful record, then flag the conflict: report approval does not approve the decision.
3. Inspect review-only fit-gap and steering drafts. The EUR 50,000 statement remains unresolved and scope-unknown.
4. As domain lead, accept WS-05, then independently promote its company-code-scoped decision candidate.
5. Generate clarified outputs, review the supersession, approve and publish. Inspect frozen baseline/current provenance and audit events.

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
