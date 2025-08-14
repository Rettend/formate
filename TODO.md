# Formate Vertical-Slice Plan (TODO)

Goal: Always ship a runnable, click-through slice after each milestone. Start with creator → publish form → respondent on `/r/:slug` with a hard-coded reply, then layer persistence, streaming AI, and invites.

Note: **the key is to create something I can see and click fast, then we create everything that's needed for it to work under it, then we iterate and make it better**

## Milestone 1 — Roles + Minimal Forms + Hard‑coded Chat on `/r/:slug`

- [ ] Database & Migrations (Turso via Drizzle)
  - [ ] Extend `Users`
    - [ ] Add `role: 'respondent' | 'creator' | 'admin'` (default `'respondent'`)
    - [ ] Add `invitedByUserId` (nullable fk → `users.id`)
    - [ ] Add index on `role`
  - [ ] Add `Forms` table (minimal)
    - [ ] `id` (pk), `ownerUserId` (fk), `title`, `description?`, `slug`, `status: 'draft'|'published'|'archived'`, `isPublic` (default false)
    - [ ] Optional now (can be null): `aiConfigJson`, `settingsJson`
    - [ ] Indexes: `(ownerUserId, slug)` unique, `status`, `isPublic`
  - [ ] Run `bun run db:push`
- [ ] Security & Auth (GAU)
  - [ ] Ensure session includes `user.role`
  - [ ] Guards: `requireCreator`
- [ ] Server Functions (`src/server/forms.ts`)
  - [ ] `createForm({ title, description?, slug? })` — creator/admin
  - [ ] `listForms(filters?)` — creator/admin (basic pagination optional)
  - [ ] `publishForm({ formId })` / `unpublishForm({ formId })` — owner
  - [ ] `getPublicFormBySlug({ slug })` — public (expose: id, title, description; respect `isPublic`)
- [ ] UI (Creator)
  - [ ] `/forms` — minimal list and “Create form”; publish toggle (use existing `Button`)
  - [ ] Skip full builder; show title/description only for now
- [ ] UI (Respondent)
  - [ ] `/r/:slug` — fetch public form; render minimal chat
  - [ ] `sendMessage()` server action that returns a hard-coded single reply (no provider, no persistence)
- [ ] Manual tests
  - [ ] Sign in → ensure `role` available
  - [ ] Creator can create + publish form → open shared `/r/:slug` → see chat respond with canned reply

## Milestone 2 — Conversations + Messages + Single‑Completion

- [ ] Database & Migrations
  - [ ] `Conversations` table
    - [ ] `id` (pk), `formId` (fk), `respondentUserId` (fk), `status: 'active'|'completed'|'abandoned'`, `startedAt`, `completedAt?`, `clientMetaJson`
    - [ ] Unique `(formId, respondentUserId)`; indexes on `formId`, `respondentUserId`, `status`
  - [ ] `Messages` table
    - [ ] `id` (pk), `conversationId` (fk), `role: 'system'|'user'|'ai'`, `contentText`, `contentJson?`, `tokensIn?`, `tokensOut?`, `latencyMs?`, `createdAt`
    - [ ] Index `(conversationId, createdAt)`
  - [ ] Run `bun run db:push`
- [ ] Server Functions (`src/server/conversations.ts`)
  - [ ] `getOrCreateConversation({ formId })` — respondent; enforce unique `(formId, respondentUserId)`
  - [ ] `listMessages({ conversationId, cursor? })` — participant
  - [ ] `completeConversation({ conversationId })` — participant
  - [ ] `sendMessage({ conversationId, content })` — participant; persist user message, append a simple canned AI reply; capture timestamps
- [ ] Security & Auth
  - [ ] Guards: `requireParticipant(conversationId)`
- [ ] Stores
  - [ ] `ConversationsStore`: state (`activeId`, `byId`, `messages`, `sending`, `error?`); actions (`start`, `loadMessages`, `sendMessage`, `complete`)
- [ ] UI
  - [ ] `/r/:slug` — start or continue the user’s conversation; render messages from DB
  - [ ] Enforce single completion: if `status = completed`, show completion summary gate
- [ ] Manual tests
  - [ ] Create/publish form → `/r/:slug` → new conversation → messages persist → cannot start a second completion for same form

## Milestone 3 — Real AI Streaming (Google via Vercel AI v5)

- [ ] AI Integration (`/src/lib/ai`)
  - [ ] Provider-agnostic interface (keep small) with one implementation: Google (no FakeAI)
  - [ ] `createAIClient(config)`
  - [ ] `streamAIReply({ messages, aiConfig, signal })` — returns `ReadableStream<string>` + final AI message
- [ ] Server Functions
  - [ ] `sendMessage` streams chunks from `streamAIReply`; persist user message immediately; upsert final AI message with `tokensOut`, `latencyMs`
- [ ] Client Glue
  - [ ] In `ConversationsStore.sendMessage`, optimistic user append; consume stream; progressively patch AI message; finalize
  - [ ] `TypingIndicator` bound to `streaming`
- [ ] Validation
  - [ ] Minimal Zod schemas for `sendMessage` input where needed
- [ ] Manual tests
  - [ ] Observe streamed AI in `/r/:slug`; verify persisted messages and basic metrics

## Milestone 4 — Invites (GAU JWT) + Used JTIs

- [ ] Database & Migrations
  - [ ] `UsedInviteTokens` table
    - [ ] `jti` (pk), `usedAt` (timestamp default now)
    - [ ] Optional: `usedByUserId`, `invitedByUserId`, `email`, `roleClaim`
  - [ ] Run `bun run db:push`
- [ ] Server Functions (`src/server/invites.ts`)
  - [ ] `createInviteToken({ role, email?, ttlMinutes? })` — sign JWT with `jti`
  - [ ] `redeemInviteToken({ jwt })` — verify, check unused `jti`, update `users.role`, insert into `UsedInviteTokens`
  - [ ] `listUsedInviteTokens()` — recent redeemed tokens
- [ ] UI
  - [ ] `/invites` — simple issue/redeem; list used tokens
- [ ] Stores
  - [ ] `InvitesStore`: state (`usedTokens`, `issuing`, `redeeming`, `error?`); actions (`listUsed`, `issue`, `redeem`)
- [ ] Manual tests
  - [ ] Issue token as creator → redeem as respondent → role upgraded to creator

## Milestone 5 — Creator Console: Builder & Dashboard (Skeleton First)

- [ ] Server Functions (`src/server/forms.ts`)
  - [ ] `getForm({ formId })` — owner
  - [ ] `getFormCounters({ formId })` — owner
  - [ ] `updateForm({ formId, patch })` — owner
  - [ ] `deleteForm({ formId })` — owner
- [ ] UI
  - [ ] App Shell: `AppHeader` (brand, `ModeToggle`, avatar menu), role-aware routing
  - [ ] `/dashboard` — summaries and recent items (skeleton + loads)
  - [ ] `/forms/:id` — summary, publish toggle, share link
  - [ ] `/forms/:id/edit` — builder skeleton (intent, question bank list, settings)
  - [ ] `/profile` — linked accounts management
- [ ] Components (introduce as needed)
  - [ ] Domain: `FormCard`, `FormList`, `FormCreateDialog`, `PublishToggle`
- [ ] Stores
  - [ ] `FormsStore`: `list`, `byId`, `selection`, `loading`, `error?`; actions (`loadList`, `load`, `create`, `update`, `publish/unpublish`, `remove`); derived (`selectedForm`, `publishedForms`, `draftForms`)
  - [ ] Root store intro (optional here): `RootStoreProvider` composing UI/Auth/Forms/Conversations; migrate gradually
  - [ ] Rename current UI store exports to `UIStoreProvider` + `useUIStore()`; keep mode/media sync

## Milestone 6 — Validation & Error Normalization (Zod v4)

- [ ] `/src/lib/validation`
  - [ ] `idSchema` (base64url uuid v7)
  - [ ] `paginationSchema`, `formsFilterSchema`
  - [ ] Forms: `createFormInput`, `updateFormPatch`, `publishFormInput`
  - [ ] Conversations: `getOrCreateConversationInput`, `sendMessageInput`, `completeConversationInput`
  - [ ] Invites: `createInviteTokenInput`, `redeemInviteTokenInput`
  - [ ] `safeParseOrThrow(schema, data)`
- [ ] `/src/lib/errors`
  - [ ] Error union/codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `VALIDATION`, `CONFLICT`, `INTERNAL`
  - [ ] `normalizeError(e)` → `{ code, message, fields? }`
- [ ] Apply schemas + error handling across server functions

## Milestone 7 — Performance, Observability, Cost Controls

- [ ] Performance
  - [ ] Use `createAsync` for page data; suspense boundaries per section
  - [ ] Optimistic updates with background revalidation
  - [ ] `truncateHistory(messages, budget)` to cap prompt size
- [ ] Observability
  - [ ] Structured logs per server function: `{ fn, userId, ok, ms, err? }`
  - [ ] Message metrics: `tokens_in`, `tokens_out`, `latency_ms`
- [ ] Cost controls & Rate limiting
  - [ ] `checkRateLimit(key, limit, intervalMs)` helpers
  - [ ] Rate limit `sendMessage` per-user/minute; writes per-user/hour
  - [ ] Provider-configurable AI client (still only Google for now)

## Milestone 8 — Realtime & Proactive Branching (Phase 2/3)

- [ ] Realtime (`/src/lib/realtime`)
  - [ ] SSE helpers (`connectSSE`, `streamToSignal`) or WebSocket (Cloudflare + `solid-socket` optional)
  - [ ] Presence and counters (active users, response counts)
- [ ] Proactive branching (`/src/lib/conversation`)
  - [ ] Types: `ConversationContext`, `PlannedQuestion`, `ProactivePlan`
  - [ ] `planNextQuestions(history, aiConfig, k=3)`
  - [ ] `chooseNextQuestion(plan, userAnswer)`
  - [ ] Integrate planning UI hints; choose best on submit

## Milestone 9 — Component Library Expansion & Polish

- [ ] shadcn/Kobalte wrappers with consistent `variant`/`size`
  - [ ] `Input`, `Textarea`, `Label`, `Switch`, `Checkbox`, `RadioGroup`, `Select`, `Command/Combobox`
  - [ ] `Dialog`, `Drawer/Sheet`, `Popover`, `Tooltip`
  - [ ] `Tabs`, `Breadcrumb`, `Table`, `Pagination`, `Card`, `Separator`, `Badge`, `Avatar`, `Progress`, `Skeleton`, `Alert`
- [ ] Domain components
  - [ ] Conversation: `ChatMessage`, `MessageList`, `ChatComposer`, `TypingIndicator`, `ConversationHeader`
  - [ ] Invites: `InviteIssueCard`, `InviteRedeemForm`, `UsedTokenTable`
  - [ ] Shared: `EmptyState`, `ErrorState`, `LoadingState`, `ConfirmDialog`, `CopyButton`

## Milestone 10 — Dev Seeds & Manual Test Plan

- [ ] Seed script (server action or standalone)
  - [ ] One creator (manual role flip), one sample form, one conversation, sample messages
- [ ] Manual scenarios
  - [ ] Sign in (GitHub/Google)
  - [ ] Creator: create form, edit, publish/unpublish, delete
  - [ ] Respondent: `/r/:slug` → start, message, see streamed AI, complete
  - [ ] Invite: issue token, redeem, role upgrade
  - [ ] Error paths: invalid input, unauthorized, rate-limited

## Milestone 11 — Deployment & Operations

- [ ] Build: `bun run build`; local preview `vinxi start`
- [ ] Cloudflare publish via Wrangler; verify streaming in production
- [ ] Configure Secrets: GAU (GitHub/Google), `AUTH_SECRET`, Turso
- [ ] Backups & data retention notes (Turso)

---

## Quick Reference: Page & Data Map

- Creator
  - `/dashboard`: summaries, recent conversations
  - `/forms`: list/create/publish
  - `/forms/:id`: summary, counters, share link
  - `/forms/:id/edit`: builder skeleton
  - `/invites`: issue/redeem/list used tokens
  - `/profile`: linked accounts
- Respondent
  - `/r/:slug`: entry/chat; single-completion enforced; `/r/:slug/done` completion
