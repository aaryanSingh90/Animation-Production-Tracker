import type { StageConfig, ColumnConfig } from '../types'

const ASSET_COLUMNS: ColumnConfig[] = [
  { key: 'itemName',         label: 'Asset Name',   type: 'text',   width: 180 },
  { key: 'assignedArtistId', label: 'Artist',       type: 'artist', width: 160 },
  { key: 'status',           label: 'Status',       type: 'status', width: 140 },
  { key: 'startDate',        label: 'Start Date',   type: 'date',   width: 120 },
  { key: 'endDate',          label: 'End Date',     type: 'date',   width: 120 },
]

const SHOT_COLUMNS: ColumnConfig[] = [
  { key: 'shotNumber',       label: 'Shot No.',     type: 'text',        width: 100 },
  { key: 'frameRange',       label: 'Frame Range',  type: 'frameRange',  width: 120 },
  { key: 'seconds',          label: 'Seconds',      type: 'seconds',     width: 80, readOnly: true },
  { key: 'assignedArtistId', label: 'Artist',       type: 'artist',      width: 160 },
  { key: 'status',           label: 'Status',       type: 'status',      width: 140 },
  { key: 'startDate',        label: 'Start Date',   type: 'date',        width: 120 },
  { key: 'endDate',          label: 'End Date',     type: 'date',        width: 120 },
  { key: 'timeConsumed',     label: 'Time (hrs)',   type: 'number',      width: 100 },
]

export const STAGE_CONFIGS: StageConfig[] = [
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
    id: 'animatics',
    slug: 'animatics',
    name: 'Animatics',
    icon: '🎬',
    workflowType: 'ASSET',
    subStages: [
      { id: 'animatics-animatics', slug: 'animatics', name: 'Animatics', columns: ASSET_COLUMNS },
      {
        id: 'animatics-cut-shots',
        slug: 'cut-shots',
        name: 'Cut Shots',
        columns: SHOT_COLUMNS,
      },
    ],
  },
  {
    id: 'modelling',
    slug: 'modelling',
    name: 'Modelling',
    icon: '🧊',
    workflowType: 'ASSET',
    subStages: [
      { id: 'modelling-character',  slug: 'character',  name: 'Character',   columns: ASSET_COLUMNS },
      { id: 'modelling-props',      slug: 'props',      name: 'Props',        columns: ASSET_COLUMNS },
      { id: 'modelling-background', slug: 'background', name: 'Background',   columns: ASSET_COLUMNS },
    ],
  },
  {
    id: 'unwrapping',
    slug: 'unwrapping',
    name: 'Unwrapping',
    icon: '📐',
    workflowType: 'ASSET',
    subStages: [
      { id: 'unwrapping-character',  slug: 'character',  name: 'Character',   columns: ASSET_COLUMNS },
      { id: 'unwrapping-props',      slug: 'props',      name: 'Props',        columns: ASSET_COLUMNS },
      { id: 'unwrapping-background', slug: 'background', name: 'Background',   columns: ASSET_COLUMNS },
    ],
  },
  {
    id: 'texturing',
    slug: 'texturing',
    name: 'Texturing',
    icon: '🎨',
    workflowType: 'ASSET',
    subStages: [
      { id: 'texturing-character',  slug: 'character',  name: 'Character',   columns: ASSET_COLUMNS },
      { id: 'texturing-props',      slug: 'props',      name: 'Props',        columns: ASSET_COLUMNS },
      { id: 'texturing-background', slug: 'background', name: 'Background',   columns: ASSET_COLUMNS },
    ],
  },
  {
    id: 'rigging',
    slug: 'rigging',
    name: 'Rigging',
    icon: '🦴',
    workflowType: 'ASSET',
    subStages: [
      { id: 'rigging-character-rig', slug: 'character-rig', name: 'Character Rig', columns: ASSET_COLUMNS },
      { id: 'rigging-facial-rig',    slug: 'facial-rig',    name: 'Facial Rig',    columns: ASSET_COLUMNS },
      { id: 'rigging-blendshape',    slug: 'blendshape',    name: 'Blendshape',    columns: ASSET_COLUMNS },
    ],
  },
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
    id: 'composite',
    slug: 'composite',
    name: 'Composite',
    icon: '🖼️',
    workflowType: 'SHOT',
    subStages: [
      { id: 'composite-composite', slug: 'composite', name: 'Composite', columns: SHOT_COLUMNS },
    ],
  },
  {
    id: 'editing',
    slug: 'editing',
    name: 'Editing',
    icon: '✂️',
    workflowType: 'SHOT',
    subStages: [
      { id: 'editing-editing', slug: 'editing', name: 'Editing', columns: SHOT_COLUMNS },
    ],
  },
]

export const STAGE_MAP = Object.fromEntries(STAGE_CONFIGS.map(s => [s.slug, s]))
export const SUB_STAGE_MAP = Object.fromEntries(
  STAGE_CONFIGS.flatMap(s => s.subStages.map(ss => [ss.id, ss]))
)
