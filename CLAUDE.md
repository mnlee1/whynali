# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## AI Development Rules

When modifying this codebase, follow these rules strictly.

### Architecture Rules

- Business logic must live in `lib/`
- API route handlers must stay under `app/api`
- React UI components belong in `components/`
- Database access must go through Supabase clients in `lib/supabase*.ts`
- Do not duplicate logic that already exists in `lib/`

### API Design Rules

- All API routes must return JSON
- Error responses must follow `{ error, message }` shape
- Use HTTP status codes correctly (4xx for client errors, 5xx for server errors)

### Category System Rules

- Categories must only be defined in `lib/config/categories.ts`
- Do not hardcode category names elsewhere

### AI Integration Rules

- AI model calls must go through `lib/ai/`
- Do not call external AI APIs directly from API routes

### Code Style Rules

- Prefer TypeScript strict typing
- Avoid large files (>500 lines)
- Extract reusable logic into `lib/`



## Project Overview

This project is a Korean issue-tracking and discussion platform called "왜난리".
It automatically collects news and community posts, groups them into issues,
and allows users to vote, react, and discuss them.

The system relies on automated data collection, AI-assisted discussion generation,
and a heat-index based lifecycle for issues.




## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint via Next.js
npm run test:e2e     # Run Playwright E2E tests (headless)
npm run test:e2e:ui  # Run Playwright E2E tests with UI viewer
```

No single-test command is available; Playwright supports `--grep` for filtering:
```bash
npx playwright test --grep "test name"
```

## Tech Stack

- **Next.js 15** (App Router, React Server Components)
- **React 19**, **TypeScript 5**
- **Tailwind CSS 3** with Pretendard font (Korean)
- **Supabase** — PostgreSQL + Auth (Google/Naver/Kakao OAuth) + RLS
- **Groq** — AI model calls (vote/discussion generation, categorization)
- **Perplexity API** — AI content generation (discussion topics)
- **Naver News API** + **Cheerio** — news collection & HTML scraping
- **Resend** — email delivery
- **Playwright** — E2E tests

## Project Architecture

This is a Korean issue-tracking & discussion platform ("와이나리"). It automatically collects news and community posts, groups them into issues, and lets users vote, react, and discuss.

### Directory Layout

```
app/                    # Next.js App Router (pages + API routes)
  api/                  # All API route handlers
    admin/              # Admin-only CRUD endpoints (publicly accessible by design)
    cron/               # Vercel Cron job handlers
    auth/, issues/, comments/, votes/, reactions/, discussions/, search/
  admin/                # Admin dashboard UI pages (public, no auth required)
  issue/[id]/           # Issue detail page
  [category]/           # Category listing pages (연예/스포츠/정치/사회/기술)
components/             # React components (layout/, issues/, issue/, admin/, common/)
lib/                    # All business logic
  ai/                   # Groq + Perplexity wrappers (vote/discussion generators)
  analysis/             # Heat index calc, status-transition state machine
  candidate/            # Burst detection, duplicate checking, issue candidate logic
  collectors/           # Naver news scraping, community scraping
  config/categories.ts  # Single source of truth for the 5 categories
  linker/               # Match collected news/community posts to existing issues
  supabase.ts           # Browser Supabase client
  supabase-server.ts    # Server Supabase clients (session-aware + admin/service-role)
types/                  # Shared TypeScript types
middleware.ts           # Auth guard
supabase/schema.sql     # DB schema (apply manually)
e2e/                    # Playwright tests
.cursor/rules/          # 60+ project spec & rule docs (reference for feature intent)
```

### Authentication & Authorization

- **Supabase Auth** with cookie-based sessions (`@supabase/ssr`)
- `createSupabaseServerClient()` → session-aware (respects RLS)
- `createSupabaseAdminClient()` → service-role key, bypasses RLS (admin ops only)
- Middleware (`middleware.ts`) guards write endpoints (`POST/PUT/DELETE`) for:
  `/api/comments`, `/api/reactions`, `/api/votes`, `/api/discussions`, `/api/reports`
- `/admin/*` and `/api/admin/*` are intentionally **public** (no auth required)

### Issue Lifecycle

Issues follow a state machine: **점화 (Ignited) → 논란중 (Debating) → 종결 (Closed)**

- Auto-transitions driven by heat index, time elapsed, and new data
- Heat index calculated from comments + reactions + timeline points
- Minimum heat threshold ~10–15 to appear in listings
- Auto-close handled by cron jobs and `lib/vote-auto-closer.ts`

### Category System

Five categories defined centrally in `lib/config/categories.ts`:
`연예` (pink) · `스포츠` (blue) · `정치` (purple) · `사회` (green) · `기술` (amber)

To add a category: update `CATEGORIES` array in that file, then run a DB migration if there's a CHECK constraint.

### Data Pipeline (Cron Jobs)

```
Naver News API / Community scraping
  → lib/collectors/
  → lib/candidate/ (burst detection, dedup, classification)
  → Admin approval
  → Issue created in DB
  → lib/linker/ (attach news/community sources to issue)
  → AI generation (discussions, votes) via lib/ai/
```

Cron routes live under `app/api/cron/` and authenticate via `CRON_SECRET` env var.

### API Conventions

REST + JSON. Auth header: `Authorization: Bearer <Supabase JWT>` for user-protected routes.

Error shape: `{ "error": "CODE", "message": "설명" }` with HTTP 4xx/5xx.

Key endpoints:
- `GET /api/issues` — query params: `category`, `status`, `q`, `sort` (latest|heat), `limit`, `offset`
- `GET /api/issues/[id]` — with timeline count, comment count, reaction summary
- `GET /api/issues/[id]/timeline`
- `GET /api/issues/[id]/sources`
- `GET /api/discussion-topics` — query: `issue_id`, `q`
- `GET /api/search?q=&type=all|issues|discussion_topics`
- `POST /api/issues/[id]/votes/[voteId]` — body `{ "vote_choice_id": "uuid" }`

### Environment Variables

See `.env.example`. Required vars include:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GROQ_API_KEY`, `PERPLEXITY_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`,
`RESEND_API_KEY`, `CRON_SECRET`

### Path Alias

`@/*` maps to the repository root (configured in `tsconfig.json`).
