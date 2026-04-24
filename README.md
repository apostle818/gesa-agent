# gesa-agent

A self-hosted multi-agent chatbox. Define personas as Markdown files with a
system prompt and a model provider (Claude or Mistral), pick which ones you
want in a conversation, and watch them take turns while you can inject
messages between turns.

- Stream responses token-by-token from each agent.
- Mix and match providers in a single conversation (e.g. Claude philosopher
  debating a Mistral scientist).
- Create, clone, edit, and delete agents from the GUI — no rebuild needed.
- Optional git-backed persistence so agent prompts survive container
  restarts and carry their own version history.

![screenshot-placeholder]: the UI is a sidebar of agents on the left and a
streaming chat transcript on the right; selection order in the sidebar is
the turn order.

## Quick start (Docker Compose)

The goal is: one `compose.yml`, one `.env`, one `docker compose up -d`.

```bash
# 1. Grab the two files you need
curl -O https://raw.githubusercontent.com/apostle818/gesa-agent/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/apostle818/gesa-agent/main/.env.example

# 2. Fill in at least one API key in .env
#    ANTHROPIC_API_KEY=sk-ant-...
#    MISTRAL_API_KEY=...

# 3. Start it
docker compose up -d

# 4. Open http://<host>:3000
```

The image is pulled from
[`ghcr.io/apostle818/gesa-agent`](https://github.com/apostle818/gesa-agent/pkgs/container/gesa-agent)
(multi-arch, built from `main` on every push). Pin a specific tag with
`GESA_AGENT_IMAGE=ghcr.io/apostle818/gesa-agent:sha-abc1234` if you want to
stop chasing `:latest`.

## Using the app

### The sidebar

Each entry in the sidebar is an agent. Click to select — the order you
click becomes the turn order (`#1`, `#2`, …). Hover an agent row for
**Edit**, **Clone**, and **Delete** actions, or click **+ New** at the top
to create one from scratch.

### Running a conversation

1. Select two or more agents.
2. Optionally type an **opening topic** ("Debate whether free will is
   compatible with determinism").
3. Pick **Max turns** (default 8 — the loop stops after that many agent
   replies).
4. Click **Start**. Agents stream their responses in the transcript.
5. While it's running, type in the lower **Send** box to inject a human
   message at the next turn boundary. Click **Stop** to end early.

### Creating / editing agents from the GUI

The agent editor has four fields:

| Field | Notes |
|---|---|
| **Name** | Display name (e.g. "The Economist"). The file id is slugified from this. |
| **Model provider** | `claude` or `mistral`. |
| **Model version** | Optional — overrides the server default (`CLAUDE_MODEL` / `MISTRAL_MODEL`). |
| **Color** | Cosmetic, used for the dot and avatar. |
| **System prompt** | The persona instructions, in plain Markdown. |

Saving writes an `agents/<id>.md` file with YAML frontmatter. You can also
edit those files directly on disk (or in the git repo — see below).

## Configuration

All configuration is environment variables, surfaced through `.env`.

### Required

At least one of:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude agents. |
| `MISTRAL_API_KEY` | Enables Mistral agents. |

### Optional: defaults

| Variable | Default | Purpose |
|---|---|---|
| `GESA_AGENT_PORT` | `3000` | Host port to expose. |
| `GESA_AGENT_IMAGE` | `ghcr.io/apostle818/gesa-agent:latest` | Pin a specific image tag. |
| `CLAUDE_MODEL` | `claude-opus-4-7` | Default model when an agent's frontmatter doesn't pin one. |
| `MISTRAL_MODEL` | `mistral-large-latest` | Same, for Mistral agents. |
| `MISTRAL_MAX_RETRIES` | `4` | How many times to retry a 429 (respects `Retry-After`, capped at 15s per wait). |

### Optional: git-backed agent persistence

Point the app at a private git repo (GitHub, Gitea, Forgejo, GitLab, or
Bitbucket over HTTPS) and every create / update / delete from the GUI gets
committed and pushed there. Agents survive container restarts with no
local volume, and you get free version history as a bonus.

| Variable | Default | Purpose |
|---|---|---|
| `GESA_AGENTS_REPO_URL` | — | HTTPS clone URL of the private repo, e.g. `https://gitea.example.com/you/gesa-agents.git`. Enables git mode. |
| `GESA_AGENTS_TOKEN` | — | Personal access token / fine-grained token with read+write on that one repo. |
| `GESA_AGENTS_BRANCH` | `main` | Branch to sync against. |
| `GESA_AGENTS_COMMIT_NAME` | `gesa-agent` | Commit author name. |
| `GESA_AGENTS_COMMIT_EMAIL` | `gesa-agent@localhost` | Commit author email. |

On first boot against an **empty** private repo, the container seeds it
with the baked-in agents (`philosopher.md`, `scientist.md`). Subsequent
edits land as commits like `gui: create <id>`, `gui: update <id>`,
`gui: delete <id>`. When the repo already has content, the container
hard-resets to the remote on boot — so external `.md` edits you push
directly to the repo win over whatever was in the image.

Click **Refresh** in the sidebar to pull mid-session without a restart.

## Persistence options, at a glance

| Mode | How | Survives restart? | History? | Setup |
|---|---|---|---|---|
| Baked-in only | Default | No — edits live only inside the running container | No | Zero |
| Local volume | Uncomment `./agents:/app/agents` in `compose.yml` (no `:ro`) | Yes, per-host | No | Mount one directory |
| Private git repo | Set `GESA_AGENTS_REPO_URL` + `GESA_AGENTS_TOKEN` | Yes, portable | Yes — every edit is a commit | Create a repo + a token |

The three modes are not mutually exclusive — mount a volume *and* point at
a git repo if you want both a local cache and remote persistence.

## Updating

```bash
docker compose pull && docker compose up -d
```

## Running from source (development)

```bash
npm install
cp .env.example .env   # and fill in at least one API key
npm run dev            # http://localhost:3000
```

Agent files live in `agents/*.md`. Hot reload picks up file changes
without restarting.

## Troubleshooting

- **`Anthropic authentication error`** — `ANTHROPIC_API_KEY` missing or
  invalid.
- **Mistral rate-limiting (`429`)** — free-tier allows ~1 req/s. The app
  already backs off and retries up to `MISTRAL_MAX_RETRIES` times; reduce
  Max turns or use fewer Mistral agents in parallel if you still hit it.
- **Git-backed mode: "git push failed"** — on push failure the container
  resets the working tree to the previous commit, so your on-disk state
  matches the remote. Common causes: wrong/expired token, token lacks
  write scope, `GESA_AGENTS_BRANCH` protected by branch rules.
- **Secrets in `.git/config`** — when git mode is enabled, the PAT is
  stored in the container's `.git/config` (as `x-access-token`). It is
  redacted from error messages returned to the UI. Treat the container
  filesystem accordingly.
- **Health check fails on start-up** — first request can take a few
  seconds while Next.js warms; the compose health check gives it 20s
  (`start_period`). Check `docker logs gesa-agent` if it doesn't clear.

## Architecture

Single Next.js 14 (App Router) app, no external services required.

- `agents/*.md` — personas (YAML frontmatter + Markdown system prompt).
- `src/lib/agents.ts` — load / validate / write those files; async write
  ops are serialized through a per-process mutex.
- `src/lib/gitRepo.ts` — optional git-backed persistence (commit+push on
  every save, with rollback on push failure).
- `src/lib/llm.ts` — streaming generators for Claude (SDK) and Mistral
  (raw SSE + exponential 429 backoff).
- `src/app/api/*` — `GET/POST /api/agents`, `PUT/DELETE /api/agents/[id]`,
  `GET/POST /api/agents/sync`, `POST /api/chat`.
- `src/app/page.tsx` — client-side turn orchestrator.

See [`CLAUDE.md`](./CLAUDE.md) for deeper notes and planned next phases
(additional model providers, external guardrails).

## License

MIT.
