import type { StageConfig, ColumnConfig } from '../types'

const ASSET_COLUMNS: ColumnConfig[] = [
  { key: 'itemName',         label: 'Names',        type: 'text',   width: 180 },
  { key: 'assignedArtistId', label: 'Artist Name',  type: 'artist', width: 160 },
  { key: 'status',           label: 'Status',       type: 'status', width: 140 },
  { key: 'startDate',        label: 'Start Date',   type: 'date',   width: 120 },
  { key: 'endDate',          label: 'End Date',     type: 'date',   width: 120 },
]

const SHOT_COLUMNS: ColumnConfig[] = [
  { key: 'shotNumber',       label: 'Shot No.',             type: 'text',        width: 100 },
  { key: 'frameRange',       label: 'Frame Range',          type: 'frameRange',  width: 120 },
  { key: 'seconds',          label: 'Seconds',              type: 'seconds',     width: 80,  readOnly: true },
  { key: 'assignedArtistId', label: 'Artist Name',          type: 'artist',      width: 160 },
  { key: 'status',           label: 'Status',               type: 'status',      width: 140 },
  { key: 'startDate',        label: 'Start Date',           type: 'date',        width: 120 },
  { key: 'endDate',          label: 'End Date',             type: 'date',        width: 120 },
  { key: 'timeConsumed',     label: 'Total Time Consumed',  type: 'number',      width: 140 },
]

// Editing gets two extra columns matching the Excel exactly
const EDITING_COLUMNS: ColumnConfig[] = [
  ...SHOT_COLUMNS,
  { key: 'audioStatus',  label: 'Audio',        type: 'audioStatus', width: 140 },
  { key: 'finalOutput',  label: 'Final Output', type: 'text',        width: 180 },
]

// Cut Shots under Animatics — no start/end date per Excel layout
const CUT_SHOT_COLUMNS: ColumnConfig[] = [
  { key: 'shotNumber',       label: 'Shot No.',    type: 'text',       width: 100 },
  { key: 'frameRange',       label: 'Frame Range', type: 'frameRange', width: 120 },
  { key: 'seconds',          label: 'Seconds',     type: 'seconds',    width: 80, readOnly: true },
  { key: 'assignedArtistId', label: 'Artist Name', type: 'artist',     width: 160 },
  { key: 'status',           label: 'Status',      type: 'status',     width: 140 },
]

export const STAGE_CONFIGS: StageConfig[] = [
  // ── Without Shot Wise (Asset Stages) ─────────────────────────────
  {
    id: 'animatics',
    slug: 'animatics',
    name: 'Animatics',
    icon: '🎬',
    workflowType: 'ASSET',
    subStages: [
      { id: 'animatics-animatics',  slug: 'animatics',  name: 'Animatics',  columns: ASSET_COLUMNS },
      { id: 'animatics-cut-shots',  slug: 'cut-shots',  name: 'Cut Shots',  columns: CUT_SHOT_COLUMNS },
    ],
  },
  {
    id: 'audio',
    slug: 'audio',
    name: 'Audio',
    icon: '🎵',
    workflowType: 'ASSET',
    subStages: [
      { id: 'audio-audio', slug: 'audio', name: 'Audio', columns: ASSET_COLUMNS },
    ],
  },
  {
    id: 'modelling',
    slug: 'modelling',
    name: 'Modelling',
    icon: '🧊',
    workflowType: 'ASSET',
    subStages: [
      { id: 'modelling-character',            slug: 'character',            name: 'Character',            columns: ASSET_COLUMNS },
      { id: 'modelling-character-blendshapes', slug: 'character-blendshapes', name: 'Character Blendshapes', columns: ASSET_COLUMNS },
      { id: 'modelling-props',                slug: 'props',                name: 'Props',                columns: ASSET_COLUMNS },
      { id: 'modelling-bg',                   slug: 'bg',                   name: 'Bg',                   columns: ASSET_COLUMNS },
    ],
  },
  {
    id: 'unwrapping',
    slug: 'unwrapping',
    name: 'Unwrapping',
    icon: '📐',
    workflowType: 'ASSET',
    subStages: [
      { id: 'unwrapping-character', slug: 'character', name: 'Character', columns: ASSET_COLUMNS },
      { id: 'unwrapping-props',     slug: 'props',     name: 'Props',     columns: ASSET_COLUMNS },
      { id: 'unwrapping-bg',        slug: 'bg',        name: 'Bg',        columns: ASSET_COLUMNS },
    ],
  },
  {
    id: 'texturing',
    slug: 'texturing',
    name: 'Texturing',
    icon: '🎨',
    workflowType: 'ASSET',
    subStages: [
      { id: 'texturing-character', slug: 'character', name: 'Character', columns: ASSET_COLUMNS },
      { id: 'texturing-props',     slug: 'props',     name: 'Props',     columns: ASSET_COLUMNS },
      { id: 'texturing-bg',        slug: 'bg',        name: 'Bg',        columns: ASSET_COLUMNS },
    ],
  },
  {
    id: 'rigging',
    slug: 'rigging',
    name: 'Rigging',
    icon: '🦴',
    workflowType: 'ASSET',
    subStages: [
      { id: 'rigging-character', slug: 'character', name: 'Character', columns: ASSET_COLUMNS },
      { id: 'rigging-props',     slug: 'props',     name: 'Props',     columns: ASSET_COLUMNS },
      { id: 'rigging-bg',        slug: 'bg',        name: 'Bg',        columns: ASSET_COLUMNS },
    ],
  },

  // ── Shot Wise ────────────────────────────────────────────────────
  {
    id: 'animation',
    slug: 'animation',
    name: 'Animation',
    icon: '🏃',
    workflowType: 'SHOT',
    subStages: [
      { id: 'animation-animation', slug: 'animation', name: 'Animation', columns: SHOT_COLUMNS },
    ],
  },
  {
    id: 'fx',
    slug: 'fx',
    name: 'FX',
    icon: '✨',
    workflowType: 'SHOT',
    subStages: [
      { id: 'fx-fx', slug: 'fx', name: 'FX', columns: SHOT_COLUMNS },
    ],
  },
  {
    id: 'lighting',
    slug: 'lighting',
    name: 'Lighting',
    icon: '💡',
    workflowType: 'SHOT',
    subStages: [
      { id: 'lighting-lighting', slug: 'lighting', name: 'Lighting', columns: SHOT_COLUMNS },
    ],
  },
  {
    id: 'compositing',
    slug: 'compositing',
    name: 'Compositing',
    icon: '🖼️',
    workflowType: 'SHOT',
    subStages: [
      { id: 'compositing-compositing', slug: 'compositing', name: 'Compositing', columns: SHOT_COLUMNS },
    ],
  },
  {
    id: 'editing',
    slug: 'editing',
    name: 'Editing',
    icon: '✂️',
    workflowType: 'SHOT',
    subStages: [
      { id: 'editing-editing', slug: 'editing', name: 'Editing', columns: EDITING_COLUMNS },
    ],
  },
]

export const STAGE_MAP = Object.fromEntries(STAGE_CONFIGS.map(s => [s.slug, s]))
export const SUB_STAGE_MAP = Object.fromEntries(
  STAGE_CONFIGS.flatMap(s => s.subStages.map(ss => [ss.id, ss]))
)
