import type { FormField, FormPlan, TestRunStep } from '~/lib/validation/form-plan'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { uuidV7Base58 } from '~/lib/index'

export const Users = sqliteTable('users', {
  id: text().primaryKey().$defaultFn(() => uuidV7Base58()),
  name: text(),
  email: text().unique(),
  emailVerified: integer({ mode: 'boolean' }),
  image: text(),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export type User = typeof Users.$inferSelect
export type UserNew = typeof Users.$inferInsert

export const Accounts = sqliteTable('accounts', {
  userId: text().notNull().references(() => Users.id, { onDelete: 'cascade' }),
  type: text().notNull(),
  provider: text().notNull(),
  providerAccountId: text().notNull(),
  refreshToken: text(),
  accessToken: text(),
  expiresAt: integer(),
  tokenType: text(),
  scope: text(),
  idToken: text(),
  sessionState: text(),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
}, account => [
  primaryKey({
    columns: [account.provider, account.providerAccountId],
  }),
])

export type Account = typeof Accounts.$inferSelect
export type AccountNew = typeof Accounts.$inferInsert

export const Forms = sqliteTable('forms', {
  id: text().primaryKey().$defaultFn(() => uuidV7Base58()),
  ownerUserId: text().notNull().references(() => Users.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  slug: text(),
  aiConfigJson: text({ mode: 'json' }).$type<{ prompt: string, provider: string, modelId: string }>(),
  aiProviderKeyEnc: text(),
  seedQuestionJson: text({ mode: 'json' }).$type<FormField>(),
  settingsJson: text({ mode: 'json' }).$type<FormPlan>(),
  status: text().notNull().default('draft'),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
}, t => [
  uniqueIndex('forms_slug_unique').on(t.slug),
  index('forms_status_idx').on(t.status),
])

export type Form = typeof Forms.$inferSelect
export type FormNew = typeof Forms.$inferInsert

export const FormTestRuns = sqliteTable('form_test_runs', {
  id: text().primaryKey().$defaultFn(() => uuidV7Base58()),
  formId: text().notNull().references(() => Forms.id, { onDelete: 'cascade' }),
  createdByUserId: text().notNull().references(() => Users.id, { onDelete: 'cascade' }),
  prompt: text().notNull(),
  provider: text().notNull().default('google'),
  modelId: text().notNull(),
  transcriptJson: text({ mode: 'json' }).$type<TestRunStep[]>().notNull(),
  tokensIn: integer().default(0),
  tokensOut: integer().default(0),
  latencyMs: integer().default(0),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export type FormTestRun = typeof FormTestRuns.$inferSelect
export type FormTestRunNew = typeof FormTestRuns.$inferInsert

export const Conversations = sqliteTable('conversations', {
  id: text().primaryKey().$defaultFn(() => uuidV7Base58()),
  formId: text().notNull().references(() => Forms.id, { onDelete: 'cascade' }),
  respondentUserId: text().references(() => Users.id, { onDelete: 'cascade' }),
  inviteJti: text(),
  status: text().notNull().default('active'),
  startedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
  completedAt: integer({ mode: 'timestamp' }),
  clientMetaJson: text({ mode: 'json' }).$type<Record<string, unknown>>(),
}, t => [
  uniqueIndex('conversations_form_user_unique').on(t.formId, t.respondentUserId),
  uniqueIndex('conversations_form_invite_unique').on(t.formId, t.inviteJti),
  index('conversations_form_idx').on(t.formId),
  index('conversations_user_idx').on(t.respondentUserId),
  index('conversations_invite_idx').on(t.inviteJti),
  index('conversations_status_idx').on(t.status),
])

export type Conversation = typeof Conversations.$inferSelect
export type ConversationNew = typeof Conversations.$inferInsert

// Turns capture each Q/A step with the exact question snapshot next to the answer
export const Turns = sqliteTable('turns', {
  id: text().primaryKey().$defaultFn(() => uuidV7Base58()),
  conversationId: text().notNull().references(() => Conversations.id, { onDelete: 'cascade' }),
  index: integer().notNull(),
  questionJson: text({ mode: 'json' }).$type<FormField>().notNull(),
  plan: text(),
  answerJson: text({ mode: 'json' }).$type<{ value: unknown, providedAt: string }>(),
  status: text().notNull().default('awaiting_answer'), // 'awaiting_answer' | 'answered'
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
  answeredAt: integer({ mode: 'timestamp' }),
}, t => [
  index('turns_conversation_index_idx').on(t.conversationId, t.index),
])

export type Turn = typeof Turns.$inferSelect
export type TurnNew = typeof Turns.$inferInsert

export const Invites = sqliteTable('invites', {
  jti: text().primaryKey(),
  formId: text().notNull().references(() => Forms.id, { onDelete: 'cascade' }),
  shortCode: text().notNull(),
  label: text(),
  expAt: integer({ mode: 'timestamp' }),
  createdByUserId: text().references(() => Users.id, { onDelete: 'set null' }),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
  usedAt: integer({ mode: 'timestamp' }),
  usedByUserId: text().references(() => Users.id, { onDelete: 'set null' }),
  revokedAt: integer({ mode: 'timestamp' }),
}, t => [
  uniqueIndex('invites_short_code_unique').on(t.shortCode),
  index('invites_form_idx').on(t.formId),
  index('invites_used_idx').on(t.usedAt),
  index('invites_revoked_idx').on(t.revokedAt),
])

export type Invite = typeof Invites.$inferSelect
export type InviteNew = typeof Invites.$inferInsert
