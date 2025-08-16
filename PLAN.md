# Formate - AI-Driven Adaptive Forms Platform

## Overview

Open-source AI survey tool that transforms static forms into dynamic conversations. Creators design intent-driven forms; AI conducts intelligent interviews with respondents; platform delivers actionable insights.

Rethinking from first principles: the ideal tool behaves like an expert interviewer—adaptive, fast, private, and collaborative. It reduces friction with proactive branching (preplanning multiple next questions), minimizes cost and lock-in via provider-agnostic AI (Vercel AI SDK v5), and keeps creators in control with a collaborative builder, preview with personas, and exportable configs. Invite-only creators initially; respondents must authenticate and can complete a given form only once.

## Outline

1. Guidelines and Principles
2. Database Schema (Drizzle + Turso)
3. Stores (Root + Domain): state and actions
4. Layout and Navigation (mobile + desktop)
5. Pages & Routing
6. Data Requirements per Page
7. Server Functions (queries/actions) with Zod v4 and optimistic updates
8. Component Library (shadcn-first wrappers + domain components)
9. Logic in `/lib` (primitives, composables, helpers)
10. Security, Privacy, Roles, and Invites (GAU)
11. Real-time and Streaming Strategy
12. Performance, Observability, Cost Controls

## Guidelines

### Principles

- **SolidJS best practices**: Prefer `createAsync` and `createMemo` over `createEffect` for data and derivations. Co-locate server queries with pages/components. Avoid imperative effects; model transitions in state.
- **Component-first**: Heavy bias toward reusable components over ad-hoc HTML/classes. Wrap shadcn primitives into domain components (e.g., `FormCard`, `ChatMessage`). No business logic inside page components.
- **Server functions**: All mutations via `'use server'` actions with Zod v4 input validation. Reads via `'use server'` queries. Enforce authorization/ownership in every function.
- **Store architecture**: Introduce a `RootStore` that contains all domain stores (`ui`, `auth`, `forms`, `conversations`, `analytics`, `invites`). Keep `UIStore` focused on UI-only concerns (theme, nav). Avoid generic names like `StoreProvider`/`useStore`—rename to `RootStoreProvider`/`useRootStore` and `UIStoreProvider`/`useUIStore` to prevent collisions and clarify intent.
- **Lib-first**: Extract primitives/composables/utilities into `/lib` (AI, validation, analytics, conversation trees, realtime). Keep components thin.
- **Streaming and proactive branching**: Stream AI responses; pre-plan 2–3 likely next questions to reduce perceived latency.

### Development Standards

- **Type safety**: End-to-end TypeScript with strict Zod v4 validation for all inputs.
- **Performance**: Optimistic updates, background revalidation, minimal waterfalls.
- **Accessibility**: WCAG, keyboard navigation, correct ARIA, focus management.
- **Security**: Least privilege checks, rate limiting for AI and writes, audit logs where needed.
- **DX**: Clear folder boundaries, consistent naming, zero magic side effects.

### Additional Systems

- **Zod v4 validation**: Every server function defines an input schema and returns typed results or typed errors.
- **Root store**: A single provider composes domain stores; hooks expose per-domain slices. UI store remains UI-only. Rename current UI store API to `useUIStore` and move base store names into a dedicated `RootStore`.
- **Auth and roles (GAU)**: Creator is invite-gated; respondents must auth; one-completion-per-form enforced.

### Shadcn Components List

Bar List, Charts, Delta Bar, Progress, Progress Circle, Accordion, Alert, Alert Dialog, Aspect Ratio, Avatar, Badge, Badge Delta, Breadcrumb, Button, Callout, Card, Carousel, Checkbox, Collapsible, Combobox, Command, Context Menu, Data Table, Date Picker, Dialog, Drawer, Dropdown Menu, Hover Card, Label, Menubar, Navigation Menu, Number Field, OTP Field, Pagination, Popover, Radio Group, Resizable, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Switch, Table, Tabs, Text Field, Timeline, Toast, Toggle, Toggle Group, Tooltip

---

## 1. Database Schema (Drizzle + Turso)

Conventions

- SQLite via Turso, Drizzle ORM, `snake_case` columns, timestamps as `integer({ mode: 'timestamp' })`.
- IDs are base64url `uuid_v7` via `uuidV7Base58()`.
- Store JSON as `text()` with `$type<T>()` for TypeScript safety. Validate on read/write in server functions.

### Entities

- Users (extend existing): roles and invite lineage
- Accounts (from GAU): provider-linked auth
- UsedInviteTokens: track redeemed JWT invites (by jti)
- Forms: owner, metadata, AI configuration
- Conversations: per-respondent session for a form
- Messages: chronological transcript with metrics
- Analytics events (Phase 3): optional event log

### Users

Purpose: authentication, roles, and invite lineage.

Columns

- id (pk)
- name, email (unique), image, email_verified (boolean)
- role: 'respondent' | 'creator' | 'admin' (default 'respondent')
- invited_by_user_id (nullable fk → users.id)
- created_at, updated_at

Indexes/constraints

- unique(email)
- index(role)

### Accounts (GAU)

Already present. Composite primary key `(provider, provider_account_id)`; cascades with user deletion.

### Used Invite Tokens

Purpose: minimal persistence for JWT invite redemption, compatible with GAU example. The invite itself is a signed JWT; we only store which tokens (by `jti`) were redeemed to prevent reuse.

Columns

- jti (pk)
- used_at (timestamp, default now)

Optional (future)

- used_by_user_id (fk → users.id) — audit trail
- invited_by_user_id (fk → users.id) — audit trail
- email (text) — bound identity used at redemption time
- role_claim (text) — role granted by the token

### Forms

Purpose: survey definitions and AI configuration.

Columns

- id (pk)
- owner_user_id (fk → users.id, cascade delete)
- title (not null), description (nullable)
- slug (unique per owner)
- status: 'draft' | 'published' | 'archived' (default 'draft')
- ai_config_json (json as text)
- settings_json (json as text)
- is_public (boolean, default false)
- created_at, updated_at

Indexes/constraints

- index(owner_user_id)
- unique(owner_user_id, slug)
- index(status), index(is_public)

### Conversations

Purpose: a respondent’s single session for a form. Enforces one-per-form-per-user.

Columns

- id (pk)
- form_id (fk → forms.id, cascade delete)
- respondent_user_id (fk → users.id, cascade delete)
- status: 'active' | 'completed' | 'abandoned' (default 'active')
- started_at, completed_at (nullable)
- client_meta_json (json as text)

Indexes/constraints

- unique(form_id, respondent_user_id)
- index(form_id), index(respondent_user_id), index(status)

### Messages

Purpose: ordered transcript with performance metadata.

Columns

- id (pk)
- conversation_id (fk → conversations.id, cascade delete)
- role: 'system' | 'user' | 'ai'
- content_text, content_json (optional)
- tokens_in, tokens_out (ints, optional)
- latency_ms (int, optional)
- created_at

Indexes/constraints

- index(conversation_id, created_at)

### Analytics Events (Phase 3)

Purpose: log notable events for insights and cost tracking.

Columns

- id (pk)
- form_id (fk), conversation_id (fk)
- event_type (text), event_payload_json (json as text)
- created_at

### Invariants & Policies

- Respondent can complete a form once: enforced by unique `(form_id, respondent_user_id)` and server checks.
- Only owners modify their forms: enforced in server actions with user checks.
- Only creators/admins can create forms or invites.
- `updated_at` maintenance: set in server actions; optional DB trigger later.
- Soft delete not required initially; archive via `status = 'archived'`.

---

## 2. Store Architecture

### Base Store Structure

```typescript
interface RootStore {
  ui: UIStore
  auth: AuthStore
  forms: FormsStore
  conversations: ConversationsStore
  analytics: AnalyticsStore
}
```

### Root provider and access

- `RootStoreProvider` (new): composes domain stores and exposes context.
- Hooks per store (e.g., `useFormsStore`) return `[state, actions]`.
- Domain stores use `createStore` and signals; computed via `createMemo`; async via `createAsync` inside actions where needed.

### UI Store (client-only)

- State
  - `mode: 'light'|'dark'|'system'`
  - `sidebarOpen: boolean`
  - `mobileNavIndex: number`
  - `toasts: Array<{ id: string; title?: string; description?: string; type?: 'info'|'success'|'error'; }>`
- Actions
  - `setMode(mode)`
  - `toggleSidebar(open?)`
  - `showToast(toast)` / `dismissToast(id)`
- Derived
  - `isDark` from `mode` + system preference

### Auth Store (wrap GAU client)

- State
  - `session: Session | null`
  - `providers: Provider[]`
  - `linkedProviders: Provider[]`
  - `isCreator: boolean`, `isAdmin: boolean`
- Actions
  - `signIn(provider)` / `signOut()`
  - `linkAccount(provider)` / `unlinkAccount(provider)`
  - `redeemInviteToken(jwt)` — calls server; updates role locally on success

### Forms Store

- State
  - `list: Array<FormSummary>`
  - `byId: Record<FormId, Form>`
  - `selection: FormId | null`
  - `loading: boolean`, `error?: string`
- Actions
  - `loadList(filters)` — calls `listForms`
  - `load(id)` — calls `getForm`
  - `create(input)` — optimistic append; calls `createForm`; reconcile id
  - `update(id, patch)` — optimistic patch; calls `updateForm`
  - `publish(id)` / `unpublish(id)` — optimistic toggle; calls server
  - `remove(id)` — optimistic remove with undo; calls `deleteForm`
- Derived
  - `selectedForm`, `publishedForms`, `draftForms`

### Conversations Store

- State
  - `activeId: ConversationId | null`
  - `byId: Record<ConversationId, Conversation>`
  - `messages: Record<ConversationId, Array<Message>>`
  - `sending: boolean`, `streaming: boolean`, `error?: string`
- Actions
  - `start(formId)` — calls `getOrCreateConversation`; set `activeId`
  - `loadMessages(conversationId, cursor?)` — calls `listMessages`
  - `sendMessage(conversationId, content)` — optimistic append user message; stream AI reply via `sendMessage`
  - `complete(conversationId)` — mark completed; calls `completeConversation`
- Derived
  - `activeMessages` (memo of `messages[activeId]`)

### Analytics Store (Phase 3)

- State
  - `byFormId: Record<FormId, AnalyticsSummary>`
  - `filters: AnalyticsFilters`
- Actions
  - `load(formId, filters)` — calls `getAnalyticsSummary`
  - `exportCSV(formId, filters)` — server export action

### Invites Store

- State
  - `usedTokens: Array<{ jti: string; usedAt: Date; usedByUserId?: string }>`
  - `issuing: boolean`, `redeeming: boolean`, `error?: string`
- Actions
  - `listUsed()` — calls `listUsedInviteTokens`
  - `issue(role, email?)` — calls `createInviteToken`; returns JWT (no DB row)
  - `redeem(jwt)` — calls `redeemInviteToken`; updates auth.role

---

## 3. Layout & Navigation

### Responsive Design System

- **Mobile-First**: Progressive enhancement for tablet/desktop
- **Adaptive Navigation**: Bottom tabs (mobile) → sidebar (desktop)
- **Context-Aware**: Creator vs respondent interfaces

### Layout Components

- **Shell**: Authentication wrapper, role routing
- **CreatorLayout**: Dashboard navigation, form management
- **RespondentLayout**: Minimal, conversation-focused
- **ChatLayout**: Real-time messaging interface

### Navigation and Navbar

- Global header (all roles)
  - Left: brand/logo → `/` (home)
  - Right: `ModeToggle`, notifications (later), avatar menu (Profile, Sign out)

- Desktop sidebar (creator only)
  - Dashboard (`/dashboard`)
  - Forms (`/forms`)
  - Analytics (`/forms/:id/analytics` opens contextually; fallback `/analytics` overview later)
  - Invites (`/invites`) [creator/admin]
  - Settings (`/profile`)

- Mobile bottom nav (creator only)
  - Home, Forms, Analytics, Profile

- Respondent navigation
  - Minimal header with back/home, avatar menu
  - No sidebar/bottom nav; focus on the chat (`/r/:slug`)

Empty states and skeletons

- Empty lists show CTA buttons (e.g., “Create form”).
- Loading uses skeleton components; errors show retry affordances.

---

## 4. Pages & Routing

### Creator Flow

- **Dashboard** (`/dashboard`): overview of forms, recent activity, quick create
- **Forms** (`/forms`): list + filters; CTA to create
- **Form Summary** (`/forms/:id`): status, share link, publish toggle
- **Form Builder** (`/forms/:id/edit`): intent, question bank, branching, preview
- **Analytics** (`/forms/:id/analytics`): responses, themes, charts, export
- **Invites** (`/invites`) [creator/admin]: issue/review (later minimal due to JWT flow)
- **Settings/Profile** (`/profile`): linked accounts, preferences

### Respondent Flow

- **Entry** (`/r/:slug`): fetch public form config, require auth if needed
- **Conversation** (`/r/:slug`): real-time chat; single completion enforced
- **Completion** (`/r/:slug/done`): summary, next steps

### Shared Pages

- **Auth**: handled by GAU routes under `/api/auth`
- **Profile** (`/profile`): accounts management, sign out
- **Error/NotFound**: friendly error boundaries and 404

---

## 5. Data Requirements

### Per-Page Data Needs (inputs for queries/actions)

- Dashboard (`/dashboard`)
  - forms summary: id, title, status, updated_at, response_count_7d
  - recent conversations: id, form_id, started_at, status (limit 10)
  - stats glance: total_forms, total_responses_7d

- Forms list (`/forms`)
  - paginated forms: id, title, status, created_at, updated_at
  - filters: q, status, page, page_size

- Form summary (`/forms/:id`)
  - form: id, title, description, slug, status, is_public, share_url
  - counters: responses_total, completion_rate

- Form builder (`/forms/:id/edit`)
  - form: id, title, description, slug, status
  - ai_config: model, temperature, system_prompt, max_tokens
  - settings: require_auth, theme, etc.
  - preview seeds: last N messages (optional), templates list

- Analytics (`/forms/:id/analytics`)
  - aggregates: responses over time, themes (top N), average length
  - sample quotes: top highlights with links to conversations

- Invites (`/invites`)
  - used invite tokens (recent): jti, used_at, used_by_user? (if tracked)
  - issue-invite (JWT) parameters (computed client/server, no DB row)

- Respondent entry/chat (`/r/:slug`)
  - public form config: title, description, ai_config (public-safe subset)
  - get-or-create conversation: id, status
  - messages (cursor/paginated): role, content_text, created_at
  - single-completion check: conversation exists and `status = completed`

- Completion (`/r/:slug/done`)
  - conversation summary: total_messages, duration, export link

### Real-Time Data

- **Live Conversations**: WebSocket connections for instant responses
- **Analytics Updates**: Live response counting, completion tracking
- **Collaboration**: Multi-creator form editing (future feature)

---

## 6. Server Functions

All functions use function-style APIs, not query-builder syntax. Each defines:

- Input: Zod v4 schema
- Auth: required role/ownership
- Behavior: summary, side effects, rate limits
- Returns: typed payload

### Shared Schemas (conceptual)

- `id` (base64url uuid v7)
- `pagination`: { page: number, pageSize: number }
- `formsFilter`: { q?: string; status?: 'draft'|'published'|'archived' } & pagination

### Queries (`'use server'`)

- `getSession()`
  - Auth: any
  - Returns: session (user, accounts, providers)

- `getDashboardSummary()`
  - Auth: creator/admin
  - Returns: { forms: FormSummary[]; recent: ConversationSummary[]; stats: { totalForms: number; responses7d: number } }

- `listForms(filters)`
  - Auth: creator/admin
  - Returns: { items: FormSummary[]; page: number; pageSize: number; total: number }

- `getForm({ formId })`
  - Auth: owner
  - Returns: Form (with ai_config, settings)

- `getFormCounters({ formId })`
  - Auth: owner
  - Returns: { responsesTotal: number; completionRate: number }

- `getPublicFormBySlug({ slug })`
  - Auth: public (enforce `requireAuth` from form settings)
  - Returns: { id, title, description, publicAIConfig }

- `getOrCreateConversation({ formId })`
  - Auth: respondent (signed-in)
  - Behavior: returns existing or creates new; enforces unique (form, user)
  - Returns: Conversation

- `listMessages({ conversationId, cursor? })`
  - Auth: participant (owner or respondent)
  - Returns: { items: Message[]; nextCursor?: string }

- `getAnalyticsSummary({ formId, filters })` (Phase 3)
  - Auth: owner/admin
  - Returns: aggregated metrics and highlights

- `listUsedInviteTokens()`
  - Auth: creator/admin
  - Returns: Array<{ jti, usedAt, usedByUserId? }>

### Actions (`'use server'`)

- `createForm({ title, description?, slug?, aiConfig?, settings? })`
  - Auth: creator/admin
  - Side effects: create form
  - Returns: Form
  - Optimistic: append placeholder to store

- `updateForm({ formId, patch })`
  - Auth: owner
  - Side effects: update fields; set `updated_at`
  - Returns: Form
  - Optimistic: patch in store then reconcile

- `publishForm({ formId })` / `unpublishForm({ formId })`
  - Auth: owner
  - Returns: { status }
  - Optimistic: toggle in store

- `deleteForm({ formId })`
  - Auth: owner
  - Side effects: cascade delete
  - Returns: { ok: true }
  - Optimistic: remove from list with undo window

- `startConversation({ formId })`
  - Auth: respondent
  - Side effects: create conversation if not exists
  - Returns: Conversation

- `sendMessage({ conversationId, content })` (streaming)
  - Auth: participant
  - Behavior: append user message; stream AI reply (Vercel AI SDK `streamObject`/`streamText`) and persist chunks; record `tokens_out`, `latency_ms`
  - Returns: stream handle or final AI message
  - Optimistic: push user message immediately; show typing indicator; replace temp AI with final

- `completeConversation({ conversationId })`
  - Auth: participant
  - Side effects: set status=completed; set completed_at
  - Returns: Conversation

- `createInviteToken({ role, email?, ttlMinutes? })`
  - Auth: creator/admin
  - Behavior: signs a JWT with `jti`, role claim, optional email and expiry; does not persist
  - Returns: { jwt }

- `redeemInviteToken({ jwt })`
  - Auth: signed-in user
  - Behavior: verify signature/expiry; check `jti` unused; set user.role from claim; insert into `used_invite_tokens`; optionally record `used_by_user_id`
  - Returns: { role }

### Validation & errors

- All inputs use Zod v4 schemas; ids validated as base64url strings.
- Errors normalized to `{ code: string; message: string; fields?: Record<string,string> }`.
- Rate limits: per-user minute caps for `sendMessage`, per-hour for create/update actions.

---

## 7. Component Library

### Shadcn-first wrappers (API consistency)

- Goal: thin wrappers over shadcn/Kobalte primitives with a consistent API: `variant`, `size`, `class?`, and polymorphic `as` via `PolymorphicProps`. Style variants via `cva`. Re-export types per component for DX.
- Base wrappers to implement (besides existing `Button` and `DropdownMenu`):
  - Inputs: `Input`, `Textarea`, `Label`, `Switch`, `Checkbox`, `RadioGroup`, `Select`, `Combobox/Command`
  - Overlays: `Dialog`, `Drawer/Sheet`, `Popover`, `Tooltip`
  - Navigation: `Tabs`, `Breadcrumb`, `Sidebar` (composed), `Menubar`
  - Feedback: `Toast` (sonner adapter), `Alert`, `Skeleton`, `Progress`
  - Surfaces: `Card`, `Separator`, `Badge`, `Avatar`, `Table`, `Pagination`
- Guidelines
  - Keep wrappers presentational; do not import app stores or server logic.
  - Expose composable parts (e.g., `DialogContent`, `DialogHeader`, …) mirroring shadcn anatomy.
  - Support dark mode by default and match the color tokens from UnoCSS shadcn preset.

### Domain components (behavioral, thin UI + events)

- Layout & Navigation
  - `AppShell`: auth gate, role routing, layout slots
  - `AppHeader`: brand, `ModeToggle`, user menu
  - `AppSidebar`: sections + `NavItem` with active state
  - `MobileNavBar`: bottom tab bar with route awareness
- Auth
  - `ProviderButton`: icon + text for GitHub/Google, calls `auth.signIn(provider)`
  - `AccountChip`: linked provider badge with unlink button
- Forms (Creator)
  - `FormCard`: summary with status badge, menu (publish/unpublish/delete)
  - `FormList`: virtualized list + empty state
  - `FormCreateDialog`: title/description/slug; emits `onCreate(input)`
  - `PublishToggle`: optimistic toggle with rollback on error
  - `FormEditor` (skeleton v1): intent, question bank list, settings panel
- Conversation (Respondent)
  - `ChatMessage`: variants: system/user/ai; supports text and JSON content
  - `MessageList`: virtualized with scroll anchoring, day separators
  - `ChatComposer`: textarea with send, supports enter-to-send, char counter
  - `TypingIndicator`: animated dots; controlled by `streaming` flag
  - `ConversationHeader`: title, progress, completion CTA
- Analytics (Phase 3)
  - `KpiStat`, `TrendChart`, `ThemeList`, `QuoteCard`
- Invites (Creator/Admin)
  - `InviteIssueCard`: role select + optional email; copies JWT
  - `InviteRedeemForm`: input for JWT; on submit calls redeem
  - `UsedTokenTable`: recent `jti`, `used_at`, optional user linkage
- Shared
  - `EmptyState`, `ErrorState`, `LoadingState` (skeleton presets)
  - `ConfirmDialog`: reusable confirm prompt
  - `CopyButton`: copies value with visual feedback

Component conventions

- Stateless by default; receive data via props, emit events/callbacks
- Derive minimal UI state internally; avoid side effects
- Co-locate stories/examples later to document composition

---

## 8. Logic Layer (/lib)

Directory structure

- `/lib/ai` — provider abstraction over Vercel AI SDK v5 (Google first)
- `/lib/conversation` — planning, message transforms, proactive branching
- `/lib/realtime` — SSE/WebSocket helpers and client bindings
- `/lib/validation` — Zod v4 schemas (ids, pagination, forms, messages)
- `/lib/rate-limit` — lightweight rate limiter utilities
- `/lib/errors` — error normalization and typed results

AI primitives (`/lib/ai`)

- `createAIClient(config)` — builds a Vercel AI client with provider + keys
- `streamAIReply({ messages, aiConfig, signal })` — returns a `ReadableStream<string>` and typed final message
- `estimateTokens(text)` — naive token counter for budget heuristics

Conversation primitives (`/lib/conversation`)

- Types: `ConversationContext`, `PlannedQuestion`, `ProactivePlan`
- `planNextQuestions(history, aiConfig, k=3)` — propose top-k follow-ups
- `chooseNextQuestion(plan, userAnswer)` — pick best match after user reply
- `serializeMessage(dbRow)` / `deserializeMessage(model)` — conversions
- `truncateHistory(messages, budget)` — keep context within token budget

Realtime (`/lib/realtime`)

- SSE client helpers: `connectSSE(url, onEvent)`; parse `data:` frames
- Stream glue: `streamToSignal(readable, onChunk, onDone)`
- WebSocket later: `createSocket(url)` wrapper with auto-retry (Phase 2)

Validation (`/lib/validation`)

- `idSchema` (base64url uuid v7), `paginationSchema`, `formsFilterSchema`
- `createFormInput`, `updateFormPatch`, `sendMessageInput`, `redeemInviteInput`
- `safeParseOrThrow(schema, data)` — throws typed error for server functions

Rate limiting (`/lib/rate-limit`)

- Simple per-user in-memory token bucket (Cloudflare Durable later)
- Helpers: `checkRateLimit(key, limit, intervalMs)` returns `{ allowed, retryAt }`

Errors (`/lib/errors`)

- `AppError` union: `Unauthorized`, `Forbidden`, `NotFound`, `RateLimited`, `ValidationError`, `Conflict`
- `normalizeError(e)` — maps unknowns into `{ code, message, fields? }`

---

## 9. Security, Privacy, Roles, and Invites (GAU)

Roles

- `respondent` (default): can start/continue their own conversations; cannot create/modify forms
- `creator`: can CRUD their forms, issue invites, view analytics for owned forms
- `admin`: superset of creator; may view all (minimal use early on)

Policies

- Ownership: all form mutations check `form.owner_user_id === session.user.id`
- Single completion: enforce unique `(form_id, respondent_user_id)` + server-side check on `startConversation`
- Public access: `getPublicFormBySlug` exposes only safe fields; respect `require_auth` setting from `settings_json`
- Least privilege: per-function role checks; deny by default

Invites (JWT-based via GAU)

- Issue: creators/admins call `createInviteToken({ role, email?, ttlMinutes? })`; returns signed JWT with `jti`
- Redeem: signed-in user calls `redeemInviteToken({ jwt })`; server verifies signature/expiry/email claim (if present), checks `jti` unused, updates `users.role`, and stores `jti` in `used_invite_tokens`
- Storage: only `jti` + `used_at` initially; optional audit columns later

Implementation details

- Middleware: GAU middleware populates `event.locals.getSession`
- Server function guard helpers: `requireCreator`, `requireOwner(formId)`, `requireParticipant(conversationId)`
- PII: store minimal data; avoid logging email/ids in plaintext; redact in logs
- Secrets: loaded via `serverEnv`; never expose to client or serialize into HTML

---

## 10. Real-time and Streaming Strategy

Chat streaming (Phase 1: SSE via fetch streaming)

- `sendMessage` server action starts model generation and returns a `ReadableStream` of text chunks; client consumes via `fetch` body stream
- Client updates `messages` store on each chunk; replaces temp AI message with final once stream ends; record `tokens_out`, `latency_ms`

Presence and live updates (Phase 2: WebSocket)

- Consider `solid-socket` style API for room membership (per conversation)
- Push: message receipts, typing indicator, analytics counters

Failure handling

- Backoff + resume: if stream errors mid-way, append an error system message and allow retry
- Idempotency: dedupe by client-generated `messageId` on optimistic user messages

---

## 11. Performance, Observability, Cost Controls

Performance

- Streaming-first UI; avoid waterfalls with `createAsync` + suspense boundaries
- Optimistic updates for create/update/publish/delete
- Cache topology: per-session memoization of lists; revalidate in background
- Token budget: `truncateHistory` to keep prompts within budget

Observability

- Record per-message metrics: `tokens_in`, `tokens_out`, `latency_ms`
- Structured logs on server functions: `{ fn, userId, ok, ms, err? }`
- Optional event log table (Phase 3) for analytics and cost reviews

Cost controls

- Rate limits: `sendMessage` per-user/minute; create/update per-user/hour
- Provider-agnostic: support for swapping model providers via config
- Proactive planning: pre-generate 2–3 next questions while user types to reduce perceived latency
