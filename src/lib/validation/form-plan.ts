import { z } from 'zod'

export const fieldTypeSchema = z.enum([
  'short_text',
  'long_text',
  'multiple_choice',
  'checkbox',
  'rating',
  'number',
  'date',
])

export const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
})

export const fieldValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  regex: z.string().optional(),
}).partial()

export const formFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: fieldTypeSchema,
  required: z.boolean().default(true),
  helpText: z.string().optional(),
  options: z.array(optionSchema).max(10).optional(),
  validation: fieldValidationSchema.optional(),
})

export const conditionOpSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'lt',
  'includes',
  'not_includes',
  'filled',
  'not_filled',
])

export const conditionSchema = z.object({
  fieldId: z.string().min(1).max(48),
  op: conditionOpSchema,
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
})

export const branchRuleSchema = z.object({
  when: z.array(conditionSchema).min(1).max(5),
  goTo: z.union([z.literal('next'), z.literal('end'), z.string().regex(/^field:[\w-]{1,48}$/i)]),
})

export const formPlanSchema = z.object({
  summary: z.string().min(1),
  intro: z.string().optional(),
  outro: z.string().optional(),
  seed: formFieldSchema,
  stopping: z.object({
    hardLimit: z.object({
      maxQuestions: z.number().int().min(1).max(50).default(10),
    }).default({ maxQuestions: 10 }),
    llmMayEnd: z.boolean().default(true),
    endReasons: z.array(z.enum(['enough_info', 'trolling'])).min(0).max(2).default(['enough_info', 'trolling']),
  }).optional(),
})

export type FormPlan = z.infer<typeof formPlanSchema>
export type FormField = z.infer<typeof formFieldSchema>

export const testRunStepSchema = z.object({
  step: z.number().int().min(1),
  question: formFieldSchema,
  answer: z.any(),
  notes: z.string().optional(),
})

export const testRunTranscriptSchema = z.array(testRunStepSchema).min(1)

export type TestRunStep = z.infer<typeof testRunStepSchema>
