/**
 * Auto-mirror rules — server-side mirror of frontend/src/config/stageConfigs.ts
 * `MIRROR_RULES`. When a task is created in a SOURCE sub-stage, linked copies
 * are created in each TARGET sub-stage (the frontend drives creation via
 * /tasks/batch).
 *
 * BUG-07: the backend needs these same rules so that RENAMING or DELETING a
 * source task can propagate to its mirror copies (the frontend can't be trusted
 * to fan-out every edit, and other clients must stay in sync via SSE).
 *
 * IMPORTANT: keep this in lock-step with the frontend MIRROR_RULES.
 */
export const MIRROR_RULES: Record<string, string[]> = {
  'modelling-character': [
    'modelling-character-blendshapes',
    'unwrapping-character',
    'texturing-character',
    'rigging-character',
  ],
  'modelling-props': [
    'unwrapping-props',
    'texturing-props',
    'rigging-props',
  ],
  'modelling-bg': [
    'unwrapping-bg',
    'texturing-bg',
    'rigging-bg',
  ],
}
