import type { Client, Project, Employee, TaskRow } from '../types'

export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'client-1',
    name: 'Studio XYZ',
    description: 'Leading animation studio',
    contactEmail: 'contact@studioxyz.com',
    createdAt: '2026-01-01',
  },
]

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'project-1',
    clientId: 'client-1',
    name: 'Elephant Short Film',
    description: 'A 3D animated short about an elephant and a boy',
    status: 'ACTIVE',
    frameRate: 24,
    createdAt: '2026-01-15',
  },
]

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    name: 'Jaivir Singh',
    email: 'jaivir@studioxyz.com',
    role: 'ARTIST',
    department: 'Animation',
    specialization: 'Character Animation',
    active: true,
    avatarColor: '#6366f1',
  },
  {
    id: 'emp-2',
    name: 'Priya Sharma',
    email: 'priya@studioxyz.com',
    role: 'LEAD',
    department: 'Modelling',
    specialization: 'Character Modelling',
    active: true,
    avatarColor: '#ec4899',
  },
  {
    id: 'emp-3',
    name: 'Arjun Mehta',
    email: 'arjun@studioxyz.com',
    role: 'ARTIST',
    department: 'Rigging',
    specialization: 'Character Rigging',
    active: true,
    avatarColor: '#f59e0b',
  },
  {
    id: 'emp-4',
    name: 'Sara Lee',
    email: 'sara@studioxyz.com',
    role: 'MANAGER',
    department: 'Editing',
    specialization: 'Post Production',
    active: true,
    avatarColor: '#10b981',
  },
  {
    id: 'emp-5',
    name: 'Rahul Gupta',
    email: 'rahul@studioxyz.com',
    role: 'ARTIST',
    department: 'Lighting',
    specialization: 'Environment Lighting',
    active: true,
    avatarColor: '#3b82f6',
  },
]

function makeTask(id: string, subStageId: string, projectId: string, overrides: Partial<TaskRow>): TaskRow {
  return {
    id, subStageId, projectId,
    itemName: '', shotNumber: undefined, frameRange: undefined, seconds: undefined,
    assignedArtistId: null, status: 'NOT_STARTED',
    startDate: null, endDate: null, timeConsumed: undefined,
    audioStatus: undefined, finalOutput: undefined, notes: undefined,
    createdAt: '2026-05-20T00:00:00Z', updatedAt: '2026-05-20T00:00:00Z',
    statusHistory: [],
    ...overrides,
  }
}

export const INITIAL_TASKS: TaskRow[] = [
  // ── Animatics ──────────────────────────────────────────────
  makeTask('task-anim-1', 'animatics-animatics', 'project-1', {
    itemName: 'Elephant', assignedArtistId: 'emp-1', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-anim-2', 'animatics-animatics', 'project-1', { itemName: 'Boy' }),

  // Animatics – Cut Shots
  makeTask('task-cs-1', 'animatics-cut-shots', 'project-1', {
    itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1,
    assignedArtistId: 'emp-1', status: 'IN_PROGRESS',
  }),

  // ── Audio ───────────────────────────────────────────────────
  makeTask('task-audio-1', 'audio-audio', 'project-1', {
    itemName: 'Elephant', assignedArtistId: 'emp-1', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),

  // ── Modelling – Character ───────────────────────────────────
  makeTask('task-mod-char-1', 'modelling-character', 'project-1', {
    itemName: 'Elephant', assignedArtistId: 'emp-2', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-mod-char-2', 'modelling-character', 'project-1', { itemName: 'Boy' }),

  // Modelling – Character Blendshapes
  makeTask('task-mod-bs-1', 'modelling-character-blendshapes', 'project-1', { itemName: 'Elephant' }),

  // Modelling – Props & Bg are empty initially

  // ── Unwrapping – Character ──────────────────────────────────
  makeTask('task-unw-char-1', 'unwrapping-character', 'project-1', {
    itemName: 'Elephant', assignedArtistId: 'emp-2', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-unw-char-2', 'unwrapping-character', 'project-1', { itemName: 'Boy' }),

  // ── Texturing – Character ───────────────────────────────────
  makeTask('task-tex-char-1', 'texturing-character', 'project-1', {
    itemName: 'Elephant', assignedArtistId: 'emp-2', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-tex-char-2', 'texturing-character', 'project-1', { itemName: 'Boy' }),

  // ── Rigging – Character ─────────────────────────────────────
  makeTask('task-rig-char-1', 'rigging-character', 'project-1', {
    itemName: 'Elephant', assignedArtistId: 'emp-3', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-rig-char-2', 'rigging-character', 'project-1', { itemName: 'Boy' }),

  // ── Animation (Shot-wise) ───────────────────────────────────
  makeTask('task-animshot-1', 'animation-animation', 'project-1', {
    itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1,
    assignedArtistId: 'emp-1', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-animshot-2', 'animation-animation', 'project-1', {
    itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-148', seconds: 2,
  }),

  // ── FX ──────────────────────────────────────────────────────
  makeTask('task-fx-1', 'fx-fx', 'project-1', {
    itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1,
    assignedArtistId: 'emp-1', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-fx-2', 'fx-fx', 'project-1', {
    itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-148', seconds: 2,
  }),

  // ── Lighting ────────────────────────────────────────────────
  makeTask('task-light-1', 'lighting-lighting', 'project-1', {
    itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1,
    assignedArtistId: 'emp-5', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-light-2', 'lighting-lighting', 'project-1', {
    itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-148', seconds: 2,
  }),

  // ── Compositing ─────────────────────────────────────────────
  makeTask('task-comp-1', 'compositing-compositing', 'project-1', {
    itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1,
    assignedArtistId: 'emp-1', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
  }),
  makeTask('task-comp-2', 'compositing-compositing', 'project-1', {
    itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-148', seconds: 2,
  }),

  // ── Editing ─────────────────────────────────────────────────
  makeTask('task-edit-1', 'editing-editing', 'project-1', {
    itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1,
    assignedArtistId: 'emp-4', status: 'IN_PROGRESS',
    startDate: '2026-05-20', endDate: '2026-05-20',
    audioStatus: 'NOT_STARTED', finalOutput: '',
  }),
  makeTask('task-edit-2', 'editing-editing', 'project-1', {
    itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-148', seconds: 2,
    audioStatus: 'NOT_STARTED', finalOutput: '',
  }),
]
