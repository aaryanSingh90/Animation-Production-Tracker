/**
 * Demo seed — populates the database with realistic studio data
 * for product demos / Google Meet walkthroughs.
 *
 * Wipes clients / projects / tasks / status-history / comments (NOT employees),
 * then creates:
 *   • 3 clients (Cocomelon Studios, T-Series Kids, Disney+ Hotstar)
 *   • 5 projects with varied production progress
 *   • ~100 tasks across stages with realistic statuses, retake notes,
 *     assigned to real roster artists matched to their department.
 *
 * Run:  npm run db:demo
 *
 * Safe to re-run — it wipes and reseeds on every call.
 */
import 'dotenv/config'
import {
  PrismaClient,
  type Employee,
  type TaskStatus,
  type AudioStatus,
  type ProjectStatus,
  type EmployeeDepartment,
} from '@prisma/client'

const prisma = new PrismaClient()

// ─── Helpers ────────────────────────────────────────────────────────────────

const daysAgo  = (n: number) => new Date(Date.now() - n * 86_400_000)
const daysFrom = (n: number) => new Date(Date.now() + n * 86_400_000)

type Roster = Record<EmployeeDepartment, Employee[]>
let roster: Roster

function pickArtist(dept: EmployeeDepartment, i: number): string | null {
  const list = roster[dept] ?? []
  return list[i % list.length]?.id ?? null
}

function pickLead(dept: EmployeeDepartment): string | null {
  return roster[dept]?.find(e => e.role === 'LEAD')?.id ?? null
}

interface SeedTaskBase {
  itemName:    string
  subStageId:  string
  status:      TaskStatus
  dept:        EmployeeDepartment
  startOffset?: number  // days from now (negative = past)
  endOffset?:   number
  shotNumber?: string
  frameRange?: string
  seconds?:    number
  retakeNote?: string
  audioStatus?: AudioStatus
  finalOutput?: string
  notes?:      string
}

// ─── Seed bodies — one per project, returns an array of task specs ──────────

// Helper that mirrors an asset across the modelling → unwrapping → texturing → rigging
// pipeline, with progressively-earlier completion (rigging is least done).
function pipelineAssets(
  names: string[],
  category: 'character' | 'props' | 'bg',
  dept: EmployeeDepartment,
  startOffset: number,
): SeedTaskBase[] {
  const out: SeedTaskBase[] = []
  names.forEach((name, i) => {
    out.push({
      itemName: name, subStageId: `modelling-${category}`, status: i === 0 ? 'FINAL_APPROVAL' : 'IN_PROGRESS',
      dept: 'Modelling', startOffset, endOffset: startOffset + 5,
    })
    out.push({
      itemName: name, subStageId: `unwrapping-${category}`, status: i === 0 ? 'FINAL_APPROVAL' : 'YET_TO_START',
      dept: 'Modelling', startOffset: startOffset + 3,
    })
    out.push({
      itemName: name, subStageId: `texturing-${category}`,
      status: i === 0 ? 'IN_PROGRESS' : 'YET_TO_START',
      dept: 'Texturing', startOffset: startOffset + 5,
    })
    if (category !== 'bg') {
      out.push({
        itemName: name, subStageId: `rigging-${category}`,
        status: 'YET_TO_START',
        dept, startOffset: startOffset + 8,
      })
    }
  })
  return out
}

function elephantBoyTasks(): SeedTaskBase[] {
  return [
    // Animatics
    { itemName: 'Elephant',  subStageId: 'animatics-animatics', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -14, endOffset: -10 },
    { itemName: 'Boy',       subStageId: 'animatics-animatics', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -14, endOffset: -10 },
    { itemName: 'Jungle BG', subStageId: 'animatics-animatics', status: 'IN_PROGRESS',    dept: 'Animation', startOffset: -10, endOffset: -2 },

    // Cut shots under animatics
    { itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1, subStageId: 'animatics-cut-shots', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -12 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-148', seconds: 2, subStageId: 'animatics-cut-shots', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -12 },
    { itemName: 'Shot _03', shotNumber: 'Shot _03', frameRange: '101-96',  seconds: 4, subStageId: 'animatics-cut-shots', status: 'IN_PROGRESS',    dept: 'Animation', startOffset: -8 },

    // Audio
    { itemName: 'Elephant trumpet', subStageId: 'audio-audio', status: 'FINAL_APPROVAL', dept: 'Editing', startOffset: -8, endOffset: -5 },
    { itemName: 'Boy giggle',       subStageId: 'audio-audio', status: 'IN_PROGRESS',    dept: 'Editing', startOffset: -5 },

    // Modelling/Unwrapping/Texturing/Rigging — Character + Props + Bg
    ...pipelineAssets(['Elephant', 'Boy'], 'character', 'Rigging', -12),
    ...pipelineAssets(['Bamboo Stick', 'Hat'], 'props',    'Rigging', -10),
    ...pipelineAssets(['Jungle Floor'], 'bg', 'Modelling', -9),

    // RETAKE — manager flagged elephant proportions
    { itemName: 'Elephant', subStageId: 'modelling-character-blendshapes', status: 'LEAD_RETAKE', dept: 'Modelling',
      startOffset: -6, retakeNote: 'Head proportions look off — elephant\'s skull is too small for the body. Please re-do the head sculpt and align ear placement before re-submitting.' },

    // Animation shots (Shot Wise)
    { itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-124', seconds: 1, subStageId: 'animation-animation', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -7 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-148', seconds: 2, subStageId: 'animation-animation', status: 'LEAD_APPROVAL',  dept: 'Animation', startOffset: -5 },
    { itemName: 'Shot _03', shotNumber: 'Shot _03', frameRange: '101-96',  seconds: 4, subStageId: 'animation-animation', status: 'IN_PROGRESS',    dept: 'Animation', startOffset: -3 },
    { itemName: 'Shot _04', shotNumber: 'Shot _04', frameRange: '101-72',  seconds: 3, subStageId: 'animation-animation', status: 'LEAD_RETAKE',    dept: 'Animation',
      startOffset: -2, retakeNote: 'Walk cycle timing too slow — speed up by 20%. The bounce on the boy needs to feel more energetic.' },

    // FX
    { itemName: 'Shot _01', shotNumber: 'Shot _01', subStageId: 'fx-fx', status: 'IN_PROGRESS', dept: 'FX', startOffset: -4 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', subStageId: 'fx-fx', status: 'YET_TO_START', dept: 'FX' },

    // Lighting
    { itemName: 'Shot _01', shotNumber: 'Shot _01', subStageId: 'lighting-lighting', status: 'IN_PROGRESS', dept: 'Lighting', startOffset: -2 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', subStageId: 'lighting-lighting', status: 'YET_TO_START', dept: 'Lighting' },

    // Compositing
    { itemName: 'Shot _01', shotNumber: 'Shot _01', subStageId: 'compositing-compositing', status: 'YET_TO_START', dept: 'Compositing' },

    // Editing (with audio + final output)
    { itemName: 'Master cut v1', shotNumber: 'MC-v1', subStageId: 'editing-editing', status: 'IN_PROGRESS', dept: 'Editing',
      startOffset: -1, audioStatus: 'WIP_INHOUSE', finalOutput: 's3://shothub-renders/elephant-boy-v1.mp4' },
  ]
}

function bandarMamaTasks(): SeedTaskBase[] {
  return [
    { itemName: 'Bandar Mama',  subStageId: 'animatics-animatics', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -10, endOffset: -7 },
    { itemName: 'Banana Tree',  subStageId: 'animatics-animatics', status: 'IN_PROGRESS',    dept: 'Animation', startOffset: -6 },

    { itemName: 'Bandar voice', subStageId: 'audio-audio',         status: 'IN_PROGRESS',    dept: 'Editing',   startOffset: -4 },

    ...pipelineAssets(['Bandar Mama', 'Baby Bandar'], 'character', 'Rigging', -8),
    ...pipelineAssets(['Banana', 'Drum'], 'props', 'Rigging', -7),

    { itemName: 'Bandar Mama', subStageId: 'texturing-character',  status: 'LEAD_RETAKE', dept: 'Texturing',
      startOffset: -3, retakeNote: 'Fur texture is too smooth — needs more directional brush detail around the cheeks and chest. Reference image attached in Discord.' },

    { itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-200', seconds: 4, subStageId: 'animation-animation', status: 'IN_PROGRESS',  dept: 'Animation', startOffset: -2 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-180', seconds: 3, subStageId: 'animation-animation', status: 'YET_TO_START', dept: 'Animation' },
    { itemName: 'Shot _03', shotNumber: 'Shot _03', frameRange: '101-100', seconds: 2, subStageId: 'animation-animation', status: 'LEAD_APPROVAL', dept: 'Animation', startOffset: -1 },
  ]
}

function elephantCycleTasks(): SeedTaskBase[] {
  return [
    { itemName: 'Elephant',  subStageId: 'animatics-animatics', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -25, endOffset: -22 },
    { itemName: 'Cycle',     subStageId: 'animatics-animatics', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -25, endOffset: -22 },

    ...pipelineAssets(['Elephant'], 'character', 'Rigging', -22),
    ...pipelineAssets(['Cycle', 'Wheel'], 'props', 'Rigging', -20),

    // Most shots completed
    { itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-72',  seconds: 3, subStageId: 'animation-animation', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -18 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-96',  seconds: 4, subStageId: 'animation-animation', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -15 },
    { itemName: 'Shot _03', shotNumber: 'Shot _03', frameRange: '101-120', seconds: 5, subStageId: 'animation-animation', status: 'LEAD_APPROVAL',  dept: 'Animation', startOffset: -5 },

    { itemName: 'Shot _01', shotNumber: 'Shot _01', subStageId: 'lighting-lighting',     status: 'FINAL_APPROVAL', dept: 'Lighting', startOffset: -10 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', subStageId: 'lighting-lighting',     status: 'FINAL_APPROVAL', dept: 'Lighting', startOffset: -8 },
    { itemName: 'Shot _03', shotNumber: 'Shot _03', subStageId: 'lighting-lighting',     status: 'IN_PROGRESS',    dept: 'Lighting', startOffset: -3 },

    { itemName: 'Shot _01', shotNumber: 'Shot _01', subStageId: 'compositing-compositing', status: 'FINAL_APPROVAL', dept: 'Compositing', startOffset: -7 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', subStageId: 'compositing-compositing', status: 'LEAD_APPROVAL',  dept: 'Compositing', startOffset: -3 },

    { itemName: 'Master cut',   shotNumber: 'MC-v3', subStageId: 'editing-editing', status: 'LEAD_APPROVAL', dept: 'Editing',
      startOffset: -1, audioStatus: 'APPROVED_INHOUSE', finalOutput: 's3://shothub-renders/elephant-cycle-final.mp4' },
  ]
}

function lakdiKiKathiTasks(): SeedTaskBase[] {
  return [
    // Just started — most things YET_TO_START
    { itemName: 'Lakdi (wooden horse)', subStageId: 'animatics-animatics', status: 'IN_PROGRESS', dept: 'Animation', startOffset: -2 },
    { itemName: 'Boy',                  subStageId: 'animatics-animatics', status: 'IN_PROGRESS', dept: 'Animation', startOffset: -1 },

    { itemName: 'Lakdi',               subStageId: 'modelling-props',     status: 'YET_TO_START', dept: 'Modelling' },
    { itemName: 'Boy',                 subStageId: 'modelling-character', status: 'YET_TO_START', dept: 'Modelling' },
  ]
}

function chandaMamaTasks(): SeedTaskBase[] {
  return [
    { itemName: 'Chanda Mama (Moon)', subStageId: 'animatics-animatics', status: 'FINAL_APPROVAL', dept: 'Animation', startOffset: -6, endOffset: -4 },
    { itemName: 'Child',              subStageId: 'animatics-animatics', status: 'IN_PROGRESS',    dept: 'Animation', startOffset: -3 },

    ...pipelineAssets(['Chanda Mama', 'Child'], 'character', 'Rigging', -5),

    { itemName: 'Shot _01', shotNumber: 'Shot _01', frameRange: '101-144', seconds: 6, subStageId: 'animation-animation', status: 'IN_PROGRESS', dept: 'Animation', startOffset: -2 },
    { itemName: 'Shot _02', shotNumber: 'Shot _02', frameRange: '101-96',  seconds: 4, subStageId: 'animation-animation', status: 'YET_TO_START', dept: 'Animation' },

    { itemName: 'Lullaby vocals', subStageId: 'audio-audio', status: 'IN_PROGRESS', dept: 'Editing', startOffset: -1 },
  ]
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('▶ Demo seed: wiping existing clients / projects / tasks…\n')
  await prisma.statusChange.deleteMany()
  await prisma.reviewComment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()
  await prisma.client.deleteMany()

  const employees = await prisma.employee.findMany({ where: { active: true } })
  if (employees.length === 0) {
    throw new Error('No employees found. Run `npm run db:seed` first to load the roster.')
  }
  roster = {} as Roster
  for (const dept of ['Animation','Rigging','Lighting','FX','Compositing','Modelling','Texturing','Audio','Editing'] as EmployeeDepartment[]) {
    roster[dept] = employees.filter(e => e.department === dept)
  }
  // Editing serves as audio fallback if Audio dept is empty
  if (roster.Audio.length === 0) roster.Audio = roster.Editing

  const adminId = employees.find(e => e.role === 'MANAGER')?.id ?? null
  console.log(`  Loaded ${employees.length} employees, admin id = ${adminId ?? '—'}`)

  // ─── Clients ────────────────────────────────────────────────────────────
  const cocomelon = await prisma.client.create({
    data: { name: 'Cocomelon Studios', description: 'Children\'s nursery-rhyme animations', contactEmail: 'production@cocomelon.com' },
  })
  const tseries   = await prisma.client.create({
    data: { name: 'T-Series Kids',     description: 'Animated music videos for kids',       contactEmail: 'kids@tseries.com' },
  })
  const disney    = await prisma.client.create({
    data: { name: 'Disney+ Hotstar',   description: 'Original animated short films',        contactEmail: 'studios@disney-hotstar.com' },
  })
  console.log('  ✓ 3 clients created\n')

  // ─── Projects ───────────────────────────────────────────────────────────
  const projects = [
    { client: cocomelon, name: 'Bandar Mama Series',     status: 'ACTIVE'    as ProjectStatus, tasks: bandarMamaTasks(),    description: 'Mid-production · ~40% complete' },
    { client: cocomelon, name: 'Elephant Cycle Song',    status: 'ACTIVE'    as ProjectStatus, tasks: elephantCycleTasks(), description: 'Near-complete · ~85%, final audio review' },
    { client: tseries,   name: 'Lakdi Ki Kathi',         status: 'ACTIVE'    as ProjectStatus, tasks: lakdiKiKathiTasks(),  description: 'Just kicked off · ~10%' },
    { client: tseries,   name: 'Chanda Mama Door Ke',    status: 'ACTIVE'    as ProjectStatus, tasks: chandaMamaTasks(),    description: 'Early production · ~25%' },
    { client: disney,    name: 'The Elephant and the Boy', status: 'ACTIVE'  as ProjectStatus, tasks: elephantBoyTasks(),   description: 'Mid-production · ~50%, includes active retakes' },
  ]

  let totalTasks = 0
  let artistCursor = 0

  for (const p of projects) {
    const project = await prisma.project.create({
      data: { name: p.name, clientId: p.client.id, status: p.status, description: p.description, frameRate: 24 },
    })

    for (const t of p.tasks) {
      const artistId = pickArtist(t.dept, artistCursor++)
      const leadId   = pickLead(t.dept) ?? adminId

      const startDate = t.startOffset !== undefined ? daysAgo(-t.startOffset) : null
      const endDate   = t.endOffset   !== undefined ? daysAgo(-t.endOffset)   : null

      const task = await prisma.task.create({
        data: {
          itemName:         t.itemName,
          subStageId:       t.subStageId,
          projectId:        project.id,
          shotNumber:       t.shotNumber,
          frameRange:       t.frameRange,
          seconds:          t.seconds,
          assignedArtistId: artistId,
          status:           t.status,
          startDate,
          endDate,
          audioStatus:      t.audioStatus,
          finalOutput:      t.finalOutput,
          notes:            t.notes,
          retakeNote:       t.retakeNote,
        },
      })

      // For retake tasks, add the manager's retake comment + a status history entry
      if (t.status === 'LEAD_RETAKE' && t.retakeNote && leadId) {
        const lead = employees.find(e => e.id === leadId)
        await prisma.reviewComment.create({
          data: {
            taskId:      task.id,
            message:     t.retakeNote,
            type:        'retake',
            authorId:    leadId,
            authorName:  lead?.name ?? 'Lead',
            avatarColor: lead?.avatarColor ?? '#f43f5e',
          },
        })
        await prisma.statusChange.create({
          data: {
            taskId:          task.id,
            from:            'LEAD_APPROVAL',
            to:              'LEAD_RETAKE',
            changedByUserId: leadId,
            changedAt:       daysAgo(1),
          },
        })
      }

      // For approved tasks, add an approval comment so the feed isn't empty
      if (t.status === 'FINAL_APPROVAL' && leadId) {
        const lead = employees.find(e => e.id === leadId)
        await prisma.reviewComment.create({
          data: {
            taskId:      task.id,
            message:     'Approved.',
            type:        'approval',
            authorId:    leadId,
            authorName:  lead?.name ?? 'Lead',
            avatarColor: lead?.avatarColor ?? '#10b981',
          },
        })
      }

      totalTasks++
    }

    console.log(`  ✓ ${p.name.padEnd(34)} ${p.tasks.length} tasks  (${p.client.name})`)
  }

  console.log(`\n✓ Demo seed complete — ${projects.length} projects, ${totalTasks} tasks.\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
