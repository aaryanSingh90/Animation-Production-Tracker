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
    specialization: 'Facial Rigging',
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

function makeTask(
  id: string,
  subStageId: string,
  projectId: string,
  overrides: Partial<TaskRow>
): TaskRow {
  return {
    id,
    subStageId,
    projectId,
    itemName: '',
    shotNumber: undefined,
    frameRange: undefined,
    seconds: undefined,
    assignedArtistId: null,
    status: 'NOT_STARTED',
    startDate: null,
    endDate: null,
    timeConsumed: undefined,
    notes: undefined,
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
    statusHistory: [],
    ...overrides,
  }
}

export const INITIAL_TASKS: TaskRow[] = [
  // Audio
  makeTask('task-audio-1', 'audio-audio', 'project-1', {
    itemName: 'Main Soundtrack',
    assignedArtistId: 'emp-1',
    status: 'IN_PROGRESS',
    startDate: '2026-05-20',
    endDate: '2026-05-30',
  }),

  // Animatics - Animatics sub-stage
  makeTask('task-anim-1', 'animatics-animatics', 'project-1', {
    itemName: 'Elephant',
    assignedArtistId: 'emp-1',
    status: 'IN_PROGRESS',
    startDate: '2026-05-20',
    endDate: '2026-05-25',
  }),
  makeTask('task-anim-2', 'animatics-animatics', 'project-1', {
    itemName: 'Boy',
    status: 'NOT_STARTED',
  }),

  // Animatics - Cut Shots
  makeTask('task-cs-1', 'animatics-cut-shots', 'project-1', {
    itemName: 'Shot_01',
    shotNumber: 'Shot_01',
    frameRange: '101-124',
    seconds: 1,
    assignedArtistId: 'emp-1',
    status: 'IN_PROGRESS',
  }),
  makeTask('task-cs-2', 'animatics-cut-shots', 'project-1', {
    itemName: 'Shot_02',
    shotNumber: 'Shot_02',
    frameRange: '101-148',
    seconds: 2,
    status: 'NOT_STARTED',
  }),

  // Modelling - Character
  makeTask('task-mod-char-1', 'modelling-character', 'project-1', {
    itemName: 'Elephant',
    assignedArtistId: 'emp-2',
    status: 'IN_PROGRESS',
    startDate: '2026-05-20',
    endDate: '2026-06-05',
  }),
  makeTask('task-mod-char-2', 'modelling-character', 'project-1', {
    itemName: 'Boy',
    status: 'NOT_STARTED',
  }),

  // Rigging - Character Rig
  makeTask('task-rig-char-1', 'rigging-character-rig', 'project-1', {
    itemName: 'Elephant',
    assignedArtistId: 'emp-3',
    status: 'NOT_STARTED',
  }),

  // Animation - Shot 01 & 02
  makeTask('task-animshot-1', 'animation-animation', 'project-1', {
    itemName: 'Shot_01',
    shotNumber: 'Shot_01',
    frameRange: '101-124',
    seconds: 1,
    assignedArtistId: 'emp-1',
    status: 'IN_PROGRESS',
    startDate: '2026-05-20',
    endDate: '2026-05-28',
  }),
  makeTask('task-animshot-2', 'animation-animation', 'project-1', {
    itemName: 'Shot_02',
    shotNumber: 'Shot_02',
    frameRange: '101-148',
    seconds: 2,
    status: 'NOT_STARTED',
  }),

  // FX - Shot 01
  makeTask('task-fx-1', 'fx-fx', 'project-1', {
    itemName: 'Shot_01',
    shotNumber: 'Shot_01',
    frameRange: '101-124',
    seconds: 1,
    status: 'NOT_STARTED',
  }),

  // Lighting - Shot 01
  makeTask('task-light-1', 'lighting-lighting', 'project-1', {
    itemName: 'Shot_01',
    shotNumber: 'Shot_01',
    frameRange: '101-124',
    seconds: 1,
    assignedArtistId: 'emp-5',
    status: 'NOT_STARTED',
  }),
]
