# gesa-agent — project notes for Claude

Next.js 14 (App Router) app that runs a multi-agent chatbox. Each agent is a
persona backed by a system prompt and a model provider (Claude or Mistral).
Selected agents take turns producing streamed responses in a shared
conversation, and the user can inject messages between turns.

## Architecture

- `agents/*.md` — one Markdown file per agent; YAML frontmatter holds
  `name`, `model`, `modelVersion`, `color`; the body is the system prompt.
- `src/lib/agents.ts` — reads, validates, and writes those files. Exposes
  `loadAgents`, `loadAgent`, `createAgent`, `updateAgent`, `deleteAgent`,
  `cloneAgent`. IDs are slugified from the name; paths are kept inside
  `agents/` to prevent traversal. All write ops are async and go through
  `gitRepo.withLock` so the in-process git mutex serializes them.
- `src/lib/gitRepo.ts` — optional git-backed persistence. When
  `GESA_AGENTS_REPO_URL` is set, the `agents/` directory becomes a clone
  of a private repo; create/update/delete commit+push on save and roll
  back the working tree on push failure. See "Agent persistence" below.
- `src/lib/llm.ts` — `streamClaude` (Anthropic SDK) and `streamMistral`
  (raw fetch + SSE) generators. Mistral has exponential backoff on 429s.
- `src/app/api/agents/route.ts` — `GET` list, `POST` create/clone.
- `src/app/api/agents/[id]/route.ts` — `PUT` update, `DELETE` remove.
- `src/app/api/agents/sync/route.ts` — `GET` returns
  `{gitBacked: boolean}`; `POST` pulls from the remote and returns the
  refreshed agent list. Only useful when git-backed persistence is on.
- `src/app/api/chat/route.ts` — `POST` returns a streaming text response
  for one agent turn given the running history.
- `src/app/page.tsx` — client-side orchestrator. Loops through selected
  agents, streaming each turn into state; supports pending user injection
  at turn boundaries.
- `src/components/AgentPanel.tsx` — sidebar list, selection, and the
  Edit / Clone / Delete / + New controls.
- `src/components/AgentEditor.tsx` — modal form used by create / clone /
  edit.

## Agent persistence

Three modes, in order of increasing portability:

1. **Baked-in only** (default). Agents ship inside the image; GUI edits live
   only inside the running container and are lost on restart. Fine for
   read-only demos.
2. **Local volume**. Mount `./agents:/app/agents` (read-write — no `:ro`)
   so edits survive container restarts on that host.
3. **Private git repo** (recommended for real use). Set the `GESA_AGENTS_*`
   env vars and every GUI create/update/delete is committed and pushed.
   Survives restarts *without* a volume, gives you free version history,
   and lets humans edit `.md` files directly in the repo.

The git-backed mode lives in `src/lib/gitRepo.ts`:

- `GESA_AGENTS_REPO_URL` — HTTPS clone URL (GitHub, Gitea, Forgejo, GitLab,
  Bitbucket all work).
- `GESA_AGENTS_TOKEN` — PAT with read+write on that one repo. Injected into
  the URL as `x-access-token:<token>@…` at clone time (stored in
  `.git/config` inside the container, redacted from error messages).
- `GESA_AGENTS_BRANCH` — default `main`.
- `GESA_AGENTS_COMMIT_NAME` / `GESA_AGENTS_COMMIT_EMAIL` — commit identity.

Boot flow (in `ensureRepo`, lazily on first request):

- If `agents/` isn't a git repo, `git init`; set origin to the authenticated
  URL; configure identity.
- If the remote branch exists: `fetch` + hard-reset to it (remote wins on
  boot, so external edits via git propagate).
- If not: push the current working tree up to seed the repo from the
  baked-in agents.

Write flow (every `createAgent` / `updateAgent` / `deleteAgent`, serialized
through a single in-process mutex):

- Apply the fs change.
- `git add <file>` → `git commit -m "gui: <verb> <id>"` → `git push`.
- On push failure, `git reset --hard <prevSha>` so on-disk state matches
  what is actually persisted remotely, then throw to the API caller.

Manual pull is exposed at `POST /api/agents/sync`; the Refresh button in
`AgentPanel` calls it so external `.md` edits show up without a restart.
`git` is installed in the runtime image (`Dockerfile` runner stage).

## Next phases (not yet implemented)

### Additional AI model providers

Today we support only Claude and Mistral (`ModelProvider = 'claude' |
'mistral'`). Candidates to add, in rough order of effort:

- **OpenAI** (`gpt-4.1`, `gpt-5`, `o-series`) — mature SDK, SSE format
  mirrors Mistral's so `streamMistral` is a close starting point.
- **Google Gemini** (`gemini-2.5-pro`, `gemini-2.5-flash`) — different
  SSE shape; use `@google/genai`.
- **xAI Grok** (`grok-4`, `grok-4-fast`) — OpenAI-compatible endpoint,
  so it can piggyback on the OpenAI adapter.
- **Local / self-hosted** via an OpenAI-compatible endpoint
  (Ollama, llama.cpp server, vLLM, LM Studio) — one adapter, configurable
  base URL; useful for air-gapped or cost-sensitive deployments.
- **AWS Bedrock / Azure OpenAI / Vertex AI** — only if we need
  enterprise-grade auth, VPC, or data-residency guarantees.

Implementation sketch:

1. Widen `ModelProvider` in `src/types.ts` and `SUPPORTED_MODELS` in
   `src/lib/agents.ts`.
2. Add one streaming generator per provider in `src/lib/llm.ts`, and
   dispatch from `src/app/api/chat/route.ts`.
3. Extend the `AgentEditor` model dropdown and color/badge maps.
4. Default-model env vars per provider (`OPENAI_MODEL`, `GEMINI_MODEL`,
   etc.) and per-provider API keys.

Open questions: does each agent also need a per-provider base URL or
org/project id? Do we want a shared "any OpenAI-compatible" adapter to
cover several providers at once?

### Guardrails outside the agents

Today guardrails live only in each agent's system prompt. That is easy
to bypass via user injection or via one agent prompting another. A
framework-level layer would harden this:

- **Input filtering** — scan the user's injected message and the topic
  prompt before they reach any model (profanity, PII, jailbreak patterns,
  links to malicious domains).
- **Output filtering** — scan each streamed assistant turn before it is
  appended to history (so the next agent can't see disallowed content)
  and before it is displayed. Needs to handle streaming: either buffer
  per-sentence or run a post-turn check with ability to redact / stop.
- **Rate & budget limits** — per-session token and turn caps enforced in
  `src/app/api/chat/route.ts`; refuse with a clear error when exceeded.
- **Topic / policy classifier** — a small model (or a rules engine) that
  decides whether the conversation is drifting outside the allowed scope,
  with an abort signal back to the orchestrator.
- **Prompt-injection defenses** — treat any text coming from other
  agents as untrusted (it already is, via the `[Name]: …` wrapping) and
  strip suspicious instructions before handing to the next agent.
- **Audit logging** — structured log of inputs, outputs, and guardrail
  decisions, separate from the in-memory conversation state.

Candidate implementations: Anthropic's moderation / Llama Guard /
OpenAI moderation endpoint for classifiers; custom regex + allowlist for
cheap fast-path checks; NVIDIA NeMo Guardrails or Guardrails AI for a
more structured framework if we outgrow ad-hoc checks.

Architectural choice to make early: guardrails as (a) middleware in the
API route, (b) a wrapper around the `stream*` generators, or (c) a
separate service the orchestrator calls. (a) is simplest; (c) is needed
if we want language-agnostic guardrails shared with other products.
