import type { FormPlan, TestRunStep } from '~/lib/validation/form-plan'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { uuidV7Base64url } from '~/lib/index'

export const Users = sqliteTable('users', {
  id: text().primaryKey().$defaultFn(() => uuidV7Base64url()),
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
  id: text().primaryKey().$defaultFn(() => uuidV7Base64url()),
  ownerUserId: text().notNull().references(() => Users.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  description: text(),
  // JSON configuration used by the LLM builder
  aiConfigJson: text({ mode: 'json' }).$type<{ prompt: string, provider: string, modelId: string }>(),
  // JSON accepted plan/definition for the form
  settingsJson: text({ mode: 'json' }).$type<FormPlan>(),
  status: text().notNull().default('draft'),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export type Form = typeof Forms.$inferSelect
export type FormNew = typeof Forms.$inferInsert

export const FormTestRuns = sqliteTable('form_test_runs', {
  id: text().primaryKey().$defaultFn(() => uuidV7Base64url()),
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
