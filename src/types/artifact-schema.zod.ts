// Runtime validator mirroring src/types/capability-artifact.ts.
//
// Two layers of checking:
//  1. Shape — each zod object below mirrors its TS interface field-for-field.
//  2. Cross-field — superRefine passes in validateArtifact() at the bottom
//     that can't be expressed as pure shape (dangling {{param}} refs,
//     unproduced outputs, recoverable steps without hints, empty
//     rationale). Every cross-field failure attaches a specific `path` so
//     callers get a per-field message, not a generic parse failure.

import { z } from 'zod';
import type { CapabilityArtifact } from './capability-artifact';

export const ParamTypeSchema = z.enum(['string', 'number', 'boolean', 'currency', 'date']);

export const ParamSpecSchema = z.object({
  name: z.string().min(1),
  type: ParamTypeSchema,
  required: z.boolean(),
  description: z.string().min(1),
  sensitive: z.boolean()
});

export const OutputSpecSchema = z.object({
  name: z.string().min(1),
  type: ParamTypeSchema,
  description: z.string().min(1),
  sensitive: z.boolean()
});

const RoleLocatorStrategySchema = z.object({
  kind: z.literal('role'),
  role: z.string().min(1),
  name: z.string().optional(),
  exact: z.boolean().optional()
});
const TestIdLocatorStrategySchema = z.object({
  kind: z.literal('testId'),
  testId: z.string().min(1)
});
const LabelLocatorStrategySchema = z.object({
  kind: z.literal('label'),
  label: z.string().min(1),
  exact: z.boolean().optional()
});
const TextLocatorStrategySchema = z.object({
  kind: z.literal('text'),
  text: z.string().min(1),
  exact: z.boolean().optional()
});
const CssLocatorStrategySchema = z.object({
  kind: z.literal('css'),
  selector: z.string().min(1)
});
const XPathLocatorStrategySchema = z.object({
  kind: z.literal('xpath'),
  expression: z.string().min(1)
});

export const LocatorStrategySchema = z.discriminatedUnion('kind', [
  RoleLocatorStrategySchema,
  TestIdLocatorStrategySchema,
  LabelLocatorStrategySchema,
  TextLocatorStrategySchema,
  CssLocatorStrategySchema,
  XPathLocatorStrategySchema
]);

export const LocatorSpecSchema = z.object({
  strategies: z.array(LocatorStrategySchema).min(1, 'at least one locator strategy is required'),
  robustnessRationale: z
    .string()
    .trim()
    .min(15, 'robustnessRationale must be a specific, non-empty justification (>= 15 chars)')
});

export const StepActionSchema = z.enum(['navigate', 'fill', 'click', 'waitFor', 'extract']);
export const FailureClassSchema = z.enum(['hard', 'recoverable']);

export const RecoveryHintSchema = z.object({
  name: z.string().min(1),
  detector: z.string().min(1),
  action: z.enum(['retry', 'retryWithExtendedTimeout', 'reload', 'dismissDialog', 'custom']),
  maxAttempts: z.number().int().min(1),
  extendedTimeoutMs: z.number().int().positive().optional(),
  note: z.string().optional()
});

export const ArtifactStepSchema = z
  .object({
    id: z.string().min(1),
    action: StepActionSchema,
    description: z.string().min(1),
    frame: z.array(LocatorSpecSchema).optional(),
    locator: LocatorSpecSchema.optional(),
    value: z.string().optional(),
    outputName: z.string().optional(),
    timeoutMs: z.number().int().positive(),
    onFailure: FailureClassSchema,
    recoveryHints: z.array(RecoveryHintSchema).optional()
  })
  .superRefine((step, ctx) => {
    if (step.onFailure === 'recoverable' && (!step.recoveryHints || step.recoveryHints.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recoveryHints'],
        message: `step "${step.id}" has onFailure: "recoverable" but no recoveryHints — recoverable steps must name at least one RecoveryHint`
      });
    }
    if (step.action !== 'navigate' && !step.locator) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locator'],
        message: `step "${step.id}" has action "${step.action}", which requires a locator`
      });
    }
    if (step.action === 'fill' && !step.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: `step "${step.id}" has action "fill" but no value template`
      });
    }
    if (step.action === 'navigate' && !step.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: `step "${step.id}" has action "navigate" but no URL template in value`
      });
    }
    if (step.action === 'extract' && !step.outputName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputName'],
        message: `step "${step.id}" has action "extract" but no outputName — nothing declares which output it fills`
      });
    }
  });

export const ExpectationSpecSchema = z
  .object({
    kind: z.enum(['visible', 'textContains']),
    text: z.string().optional()
  })
  .superRefine((exp, ctx) => {
    if (exp.kind === 'textContains' && !exp.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: 'expectation kind "textContains" requires a non-empty "text" field'
      });
    }
  });

export const CheckpointSchema = z.object({
  description: z.string().min(1),
  frame: z.array(LocatorSpecSchema).optional(),
  locator: LocatorSpecSchema,
  expectation: ExpectationSpecSchema
});

export const BusinessOutcomeSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  frame: z.array(LocatorSpecSchema).optional(),
  detector: LocatorSpecSchema,
  expectation: ExpectationSpecSchema,
  outputs: z.array(OutputSpecSchema).optional()
});

export const RiskClassSchema = z.enum(['safe', 'reversible', 'irreversible']);

export const ProvenanceSchema = z.object({
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
  sourceRunId: z.string().optional(),
  reviewedBy: z.string().optional()
});

export const CapabilityTargetSchema = z.object({
  appId: z.string().min(1),
  baseUrl: z.string().min(1),
  entryPath: z.string().min(1)
});

export const CapabilityArtifactShapeSchema = z.object({
  schemaVersion: z.string().min(1),
  capabilityId: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().min(1),
  target: CapabilityTargetSchema,
  parameters: z.array(ParamSpecSchema),
  outputs: z.array(OutputSpecSchema),
  steps: z.array(ArtifactStepSchema).min(1, 'an artifact must have at least one step'),
  checkpoint: CheckpointSchema,
  businessOutcomes: z.array(BusinessOutcomeSchema),
  riskClass: RiskClassSchema,
  provenance: ProvenanceSchema
});

// ---------------------------------------------------------------------
// Cross-field checks that shape validation alone can't express.
// ---------------------------------------------------------------------

const TEMPLATE_REF_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Built-in template variables the engine always provides, not declared params. */
const BUILTIN_TEMPLATE_VARS = new Set(['baseUrl']);

/** Recursively walk a value, calling `visit` with (stringValue, jsonPath) for every string leaf. */
function walkStrings(value: unknown, path: (string | number)[], visit: (str: string, path: (string | number)[]) => void): void {
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkStrings(item, [...path, i], visit));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      walkStrings(v, [...path, key], visit);
    }
  }
}

function checkTemplateReferences(artifact: CapabilityArtifact, ctx: z.RefinementCtx): void {
  const declaredParams = new Set(artifact.parameters.map((p) => p.name));
  walkStrings(artifact, [], (str, path) => {
    for (const match of str.matchAll(TEMPLATE_REF_RE)) {
      const paramName = match[1];
      if (BUILTIN_TEMPLATE_VARS.has(paramName)) continue;
      if (!declaredParams.has(paramName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `template reference {{${paramName}}} does not correspond to any declared parameter`
        });
      }
    }
  });
}

function checkOutputsAreProduced(artifact: CapabilityArtifact, ctx: z.RefinementCtx): void {
  const producedByExtractStep = new Set(
    artifact.steps.filter((s) => s.action === 'extract' && s.outputName).map((s) => s.outputName as string)
  );
  artifact.outputs.forEach((output, i) => {
    if (!producedByExtractStep.has(output.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputs', i, 'name'],
        message: `declared output "${output.name}" is not produced by any step with action "extract" and matching outputName`
      });
    }
  });
}

function checkStepIdsUnique(artifact: CapabilityArtifact, ctx: z.RefinementCtx): void {
  const seen = new Map<string, number>();
  artifact.steps.forEach((step, i) => {
    if (seen.has(step.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', i, 'id'],
        message: `step id "${step.id}" duplicates step ${seen.get(step.id)} — step ids must be unique`
      });
    } else {
      seen.set(step.id, i);
    }
  });
}

export const CapabilityArtifactSchema = CapabilityArtifactShapeSchema.superRefine((artifact, ctx) => {
  checkTemplateReferences(artifact as unknown as CapabilityArtifact, ctx);
  checkOutputsAreProduced(artifact as unknown as CapabilityArtifact, ctx);
  checkStepIdsUnique(artifact as unknown as CapabilityArtifact, ctx);
});

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  artifact?: CapabilityArtifact;
}

/** Validate an unknown JSON value against the full schema, returning per-field issues. */
export function validateArtifact(data: unknown): ValidationResult {
  const result = CapabilityArtifactSchema.safeParse(data);
  if (result.success) {
    return { valid: true, issues: [], artifact: result.data as unknown as CapabilityArtifact };
  }
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message
  }));
  return { valid: false, issues };
}
