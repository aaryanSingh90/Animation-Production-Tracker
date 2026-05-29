/**
 * ShotHub seed — admin + full artist roster + 5 clients + 10 projects + sample shots.
 *
 * Run:  npm run db:seed
 *
 * Employees are upserted (safe to re-run).
 * Clients / Projects / Tasks are created only if no clients exist yet — prevents
 * duplicate demo data on re-runs while still being safe on a fresh DB.
 *
 * Default credentials (override with env vars):
 *   Admin:   SEED_ADMIN_EMAIL  / SEED_ADMIN_PASSWORD  (defaults: admin@studio.local / admin123)
 *   Artists: SEED_DEFAULT_PASSWORD                     (default:  studio123)
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import type { EmployeeRole, EmployeeDepartment } from '@prisma/client'

const prisma = new PrismaClient()

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@studio.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin123'
const DEFAULT_PW     = process.env.SEED_DEFAULT_PASSWORD ?? 'studio123'

// Avatar palette — wraps around
const C = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316','#8b5cf6','#14b8a6','#ef4444','#a855f7']
const col = (i: number) => C[i % C.length]

// ─── Artist Roster (from Productivity Sheet.xlsx) ─────────────────────────────
interface RosterEntry { name: string; email: string; role: EmployeeRole; department: EmployeeDepartment; color: string }

const ROSTER: RosterEntry[] = [
  // Animation (10)
  { name: 'Sneha',         email: 'sneha@studio.local',         role: 'ARTIST', department: 'Animation',   color: col(0) },
  { name: 'Anand',         email: 'anand@studio.local',         role: 'ARTIST', department: 'Animation',   color: col(1) },
  { name: 'Abhishek',      email: 'abhishek@studio.local',      role: 'ARTIST', department: 'Animation',   color: col(2) },
  { name: 'Sandeep Singh', email: 'sandeepsingh@studio.local',  role: 'ARTIST', department: 'Animation',   color: col(3) },
  { name: 'Sanjan',        email: 'sanjan@studio.local',        role: 'ARTIST', department: 'Animation',   color: col(4) },
  { name: 'Krishna',       email: 'krishna@studio.local',       role: 'ARTIST', department: 'Animation',   color: col(5) },
  { name: 'Sreeparna',     email: 'sreeparna@studio.local',     role: 'ARTIST', department: 'Animation',   color: col(6) },
  { name: 'Himanshu',      email: 'himanshu@studio.local',      role: 'ARTIST', department: 'Animation',   color: col(7) },
  { name: 'Priyanshu',     email: 'priyanshu@studio.local',     role: 'ARTIST', department: 'Animation',   color: col(8) },
  { name: 'Ayush',         email: 'ayush@studio.local',         role: 'ARTIST', department: 'Animation',   color: col(9) },

  // Texturing (3)
  { name: 'Pratham',       email: 'pratham@studio.local',       role: 'ARTIST', department: 'Texturing',   color: col(2) },
  { name: 'Prateek',       email: 'prateek@studio.local',       role: 'ARTIST', department: 'Texturing',   color: col(3) },
  { name: 'Praveen',       email: 'praveen@studio.local',       role: 'ARTIST', department: 'Texturing',   color: col(4) },

  // Modelling (3)
  { name: 'Akash',         email: 'akash@studio.local',         role: 'ARTIST', department: 'Modelling',   color: col(5) },
  { name: 'Anjali',        email: 'anjali@studio.local',        role: 'ARTIST', department: 'Modelling',   color: col(6) },
  { name: 'Jaivir',        email: 'jaivir@studio.local',        role: 'ARTIST', department: 'Modelling',   color: col(7) },

  // Lighting (3)
  { name: 'Mukul',         email: 'mukul@studio.local',         role: 'ARTIST', department: 'Lighting',    color: col(0) },
  { name: 'Chandra',       email: 'chandra@studio.local',       role: 'ARTIST', department: 'Lighting',    color: col(1) },
  { name: 'Sandeep',       email: 'sandeep@studio.local',       role: 'ARTIST', department: 'Lighting',    color: col(2) },

  // Editing (1)
  { name: 'Palash',        email: 'palash@studio.local',        role: 'ARTIST', department: 'Editing',     color: col(4) },

  // Rigging (2)
  { name: 'Rashid',        email: 'rashid@studio.local',        role: 'ARTIST', department: 'Rigging',     color: col(5) },
  { name: 'Aashi',         email: 'aashi@studio.local',         role: 'ARTIST', department: 'Rigging',     color: col(6) },

  // Compositing (1)
  { name: 'Ajay',          email: 'ajay@studio.local',          role: 'ARTIST', department: 'Compositing', color: col(7) },

  // FX (1)
  { name: 'Sourav',        email: 'sourav@studio.local',        role: 'ARTIST', department: 'FX',          color: col(8) },
]

// ─── Helper: calculate seconds from frame range (24 fps) ─────────────────────
function sec(start: number, end: number) { return parseFloat(((end - start + 1) / 24).toFixed(1)) }
function fr(start: number, end: number)  { return `${start}-${end}` }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('▶ ShotHub seed starting…\n')

  // ── 1. Employees ─────────────────────────────────────────────────────────────
  const adminHash   = await bcrypt.hash(ADMIN_PASSWORD, 10)
  const defaultHash = await bcrypt.hash(DEFAULT_PW, 10)

  const adminEmp = await prisma.employee.upsert({
    where:  { email: ADMIN_EMAIL },
    update: {},
    create: {
      name: 'Studio Admin', email: ADMIN_EMAIL, passwordHash: adminHash,
      role: 'MANAGER', department: 'Editing', active: true, avatarColor: '#6366f1',
    },
  })
  // BUG-33: never echo plaintext credentials to stdout — seed logs routinely end
  // up in terminal scrollback, CI artifacts and shared screenshares.
  console.log(`  ✓ MANAGER  ${ADMIN_EMAIL.padEnd(30)} (password from SEED_ADMIN_PASSWORD)`)

  // Map email → employee id after upsert
  const empByEmail: Record<string, string> = { [ADMIN_EMAIL]: adminEmp.id }

  for (const e of ROSTER) {
    const emp = await prisma.employee.upsert({
      where:  { email: e.email },
      update: {},
      create: {
        name: e.name, email: e.email, passwordHash: defaultHash,
        role: e.role, department: e.department, active: true, avatarColor: e.color,
      },
    })
    empByEmail[e.email] = emp.id
    console.log(`  ✓ ARTIST   ${e.email.padEnd(30)} (${e.department})`)
  }

  const id = (email: string) => empByEmail[email]!

  console.log(`\n  → ${ROSTER.length + 1} employees ready.\n`)

  // ── 2. Clients / Projects / Tasks (only if DB is empty) ──────────────────────
  const existing = await prisma.client.count()
  if (existing > 0) {
    console.log('  ℹ  Clients already exist — skipping demo data.\n')
    console.log('  Tip: wipe the DB first (prisma migrate reset) then re-run to get fresh demo data.\n')
    return
  }

  console.log('  Creating clients, projects & sample tasks…\n')

  // ── CLIENT 1: Blender Productions ────────────────────────────────────────────
  const c1 = await prisma.client.create({ data: { name: 'Blender Productions', description: 'In-house Blender animation series — Hindi nursery rhymes & folk songs.' } })

  // Project 1-A: Lakdi Ki Kathi
  const p_lkk = await prisma.project.create({ data: { clientId: c1.id, name: 'Lakdi Ki Kathi', description: 'Classic Hindi folk rhyme — horse and rider', folderName: 'LKK_v2', status: 'ACTIVE' } })
  await seedShots(p_lkk.id, [
    { shot:'001', s:101, e:196,  anim: id('sneha@studio.local'),        status:'DONE'          },
    { shot:'002', s:101, e:172,  anim: id('anand@studio.local'),         status:'DONE'          },
    { shot:'003', s:101, e:244,  anim: id('abhishek@studio.local'),      status:'LEAD_APPROVAL' },
    { shot:'004', s:101, e:185,  anim: id('sandeepsingh@studio.local'),  status:'IN_PROGRESS'   },
    { shot:'005', s:101, e:218,  anim: id('sanjan@studio.local'),        status:'YET_TO_START'  },
    { shot:'006', s:101, e:160,  anim: id('krishna@studio.local'),       status:'LEAD_RETAKE'   },
  ])
  await seedModelling(p_lkk.id, [
    { name:'Horse Character',  mod:id('akash@studio.local'),    rig:id('rashid@studio.local'),    tex:id('pratham@studio.local'),  status:'DONE'        },
    { name:'Rider Character',  mod:id('anjali@studio.local'),   rig:id('aashi@studio.local'),     tex:id('prateek@studio.local'),  status:'IN_PROGRESS' },
    { name:'BG – Village Set', mod:id('akash@studio.local'),    rig:id('rashid@studio.local'),    tex:id('praveen@studio.local'),  status:'DONE'        },
  ])

  // Project 1-B: Animal Videos Series
  const p_av = await prisma.project.create({ data: { clientId: c1.id, name: 'Animal Videos Series', description: 'Short animated learning videos featuring animals', folderName: 'ANIMAL_SRS', status: 'ACTIVE' } })
  await seedShots(p_av.id, [
    { shot:'001', s:101, e:232,  anim: id('sreeparna@studio.local'),  status:'DONE'         },
    { shot:'002', s:101, e:195,  anim: id('himanshu@studio.local'),   status:'DONE'         },
    { shot:'003', s:101, e:289,  anim: id('priyanshu@studio.local'),  status:'IN_PROGRESS'  },
    { shot:'004', s:101, e:168,  anim: id('ayush@studio.local'),      status:'YET_TO_START' },
  ])

  // ── CLIENT 2: Client 01 ───────────────────────────────────────────────────────
  const c2 = await prisma.client.create({ data: { name: 'Client 01', description: 'Maya-based external client — nursery rhyme series.' } })

  // Project 2-A: Ek Mota Hathi
  const p_emh = await prisma.project.create({ data: { clientId: c2.id, name: 'Ek Mota Hathi', description: 'Classic elephant nursery rhyme', folderName: 'EMH_IP01', status: 'ACTIVE' } })
  await seedShots(p_emh.id, [
    { shot:'001', s:101, e:310,  anim: id('sneha@studio.local'),        status:'FINAL_APPROVAL' },
    { shot:'002', s:101, e:275,  anim: id('anand@studio.local'),         status:'DONE'           },
    { shot:'003', s:101, e:224,  anim: id('abhishek@studio.local'),      status:'LEAD_APPROVAL'  },
    { shot:'004', s:101, e:182,  anim: id('sandeepsingh@studio.local'),  status:'IN_PROGRESS'    },
    { shot:'005', s:101, e:196,  anim: id('sanjan@studio.local'),        status:'YET_TO_START'   },
  ])
  await seedModelling(p_emh.id, [
    { name:'Elephant Char',    mod:id('akash@studio.local'),   rig:id('rashid@studio.local'),  tex:id('pratham@studio.local'),  status:'DONE'       },
    { name:'Boy Character',    mod:id('anjali@studio.local'),  rig:id('aashi@studio.local'),   tex:id('prateek@studio.local'),  status:'DONE'       },
    { name:'BG – Jungle Path', mod:id('jaivir@studio.local'),  rig:id('rashid@studio.local'),  tex:id('praveen@studio.local'),  status:'IN_PROGRESS'},
  ])

  // Project 2-B: Chun Chun Karti Chidiya
  const p_ckk = await prisma.project.create({ data: { clientId: c2.id, name: 'Chun Chun Karti Chidiya', description: 'Sparrow song — short animated film', folderName: 'CKK_IP01', status: 'ACTIVE' } })
  await seedShots(p_ckk.id, [
    { shot:'001', s:101, e:245,  anim: id('krishna@studio.local'),     status:'DONE'        },
    { shot:'002', s:101, e:183,  anim: id('sreeparna@studio.local'),   status:'IN_PROGRESS' },
    { shot:'003', s:101, e:162,  anim: id('himanshu@studio.local'),    status:'YET_TO_START'},
    { shot:'004', s:101, e:220,  anim: id('priyanshu@studio.local'),   status:'YET_TO_START'},
  ])

  // ── CLIENT 3: IP Studio (Client 02) ──────────────────────────────────────────
  const c3 = await prisma.client.create({ data: { name: 'IP Studio (Client 02)', description: 'IP series — Bandar Mama, Chanda Mama, Kulfi Wala franchise.' } })

  // Project 3-A: Bandar Mama
  const p_bm = await prisma.project.create({ data: { clientId: c3.id, name: 'Bandar Mama', description: 'Monkey uncle nursery rhyme animation series', folderName: 'BANDAR_MAMA_IP02', status: 'ACTIVE' } })
  await seedShots(p_bm.id, [
    { shot:'010', s:101, e:192,  anim: id('sneha@studio.local'),        status:'FINAL_APPROVAL' },
    { shot:'017', s:101, e:265,  anim: id('sanjan@studio.local'),       status:'DONE'           },
    { shot:'020', s:101, e:214,  anim: id('sanjan@studio.local'),       status:'DONE'           },
    { shot:'021', s:101, e:178,  anim: id('sanjan@studio.local'),       status:'LEAD_APPROVAL'  },
    { shot:'023', s:101, e:230,  anim: id('sandeepsingh@studio.local'), status:'DONE'           },
    { shot:'030', s:101, e:196,  anim: id('krishna@studio.local'),      status:'IN_PROGRESS'    },
    { shot:'031', s:101, e:185,  anim: id('krishna@studio.local'),      status:'IN_PROGRESS'    },
    { shot:'036', s:101, e:218,  anim: id('abhishek@studio.local'),     status:'LEAD_RETAKE'    },
    { shot:'038', s:101, e:204,  anim: id('abhishek@studio.local'),     status:'IN_PROGRESS'    },
  ])
  await seedModelling(p_bm.id, [
    { name:'Bandar (Monkey)',   mod:id('akash@studio.local'),   rig:id('rashid@studio.local'),  tex:id('pratham@studio.local'),  status:'DONE'        },
    { name:'Mama Character',    mod:id('anjali@studio.local'),  rig:id('rashid@studio.local'),  tex:id('prateek@studio.local'),  status:'DONE'        },
    { name:'Boy Character',     mod:id('jaivir@studio.local'),  rig:id('aashi@studio.local'),   tex:id('praveen@studio.local'),  status:'IN_PROGRESS' },
    { name:'Banana Prop',       mod:id('akash@studio.local'),   rig:id('aashi@studio.local'),   tex:id('pratham@studio.local'),  status:'DONE'        },
    { name:'BG – Forest',       mod:id('anjali@studio.local'),  rig:id('rashid@studio.local'),  tex:id('praveen@studio.local'),  status:'IN_PROGRESS' },
  ])

  // Project 3-B: Chanda Mama
  const p_cm = await prisma.project.create({ data: { clientId: c3.id, name: 'Chanda Mama', description: 'Moon nursery rhyme — night time animation', folderName: 'CHANDA_MAMA_IP02', status: 'ACTIVE' } })
  await seedShots(p_cm.id, [
    { shot:'001', s:101, e:250,  anim: id('anand@studio.local'),   status:'DONE'           },
    { shot:'002', s:101, e:183,  anim: id('anand@studio.local'),   status:'DONE'           },
    { shot:'003', s:101, e:212,  anim: id('sneha@studio.local'),   status:'FINAL_APPROVAL' },
    { shot:'004', s:101, e:195,  anim: id('ayush@studio.local'),   status:'IN_PROGRESS'    },
    { shot:'005', s:101, e:272,  anim: id('ayush@studio.local'),   status:'YET_TO_START'   },
  ])

  // ── CLIENT 4: English Rhymes Studio ──────────────────────────────────────────
  const c4 = await prisma.client.create({ data: { name: 'English Rhymes Studio', description: 'English language learning & nursery rhymes for toddlers.' } })

  // Project 4-A: 5 Pyare Bandar
  const p_5pb = await prisma.project.create({ data: { clientId: c4.id, name: '5 Pyare Bandar', description: 'Five little monkeys — English learning animation', folderName: '5_PYARE_BANDAR', status: 'ACTIVE' } })
  await seedShots(p_5pb.id, [
    { shot:'001', s:101, e:255,  anim: id('sreeparna@studio.local'),  status:'DONE'         },
    { shot:'002', s:101, e:193,  anim: id('sreeparna@studio.local'),  status:'LEAD_APPROVAL'},
    { shot:'003', s:101, e:228,  anim: id('himanshu@studio.local'),   status:'IN_PROGRESS'  },
    { shot:'004', s:101, e:175,  anim: id('priyanshu@studio.local'),  status:'YET_TO_START' },
  ])

  // Project 4-B: Billi Karti Meow
  const p_bkm = await prisma.project.create({ data: { clientId: c4.id, name: 'Billi Karti Meow Meow', description: 'Cat song — English & Hindi bilingual short', folderName: 'BILLI_MEOW', status: 'ACTIVE' } })
  await seedShots(p_bkm.id, [
    { shot:'001', s:101, e:196,  anim: id('anand@studio.local'),   status:'DONE'        },
    { shot:'002', s:101, e:245,  anim: id('sneha@studio.local'),   status:'IN_PROGRESS' },
    { shot:'003', s:101, e:180,  anim: id('krishna@studio.local'), status:'YET_TO_START'},
  ])

  // ── CLIENT 5: Vehicle Learning Media ─────────────────────────────────────────
  const c5 = await prisma.client.create({ data: { name: 'Vehicle Learning Media', description: 'Learn shapes, colors and counting with vehicles — YouTube series.' } })

  // Project 5-A: Gaiya Meri Gaiya (newest, most active in May sheet)
  const p_gmg = await prisma.project.create({ data: { clientId: c5.id, name: 'Gaiya Meri Gaiya', description: 'Cow folk song animation — current production', folderName: 'GAIYA_MERI_GAIYA', status: 'ACTIVE' } })
  await seedShots(p_gmg.id, [
    { shot:'001', s:101, e:250,  anim: id('sandeepsingh@studio.local'),  status:'DONE'           },
    { shot:'002', s:101, e:204,  anim: id('sandeepsingh@studio.local'),  status:'DONE'           },
    { shot:'003', s:101, e:228,  anim: id('sanjan@studio.local'),        status:'DONE'           },
    { shot:'006', s:101, e:195,  anim: id('abhishek@studio.local'),      status:'DONE'           },
    { shot:'009', s:101, e:263,  anim: id('krishna@studio.local'),       status:'LEAD_APPROVAL'  },
    { shot:'010', s:101, e:243,  anim: id('sandeepsingh@studio.local'),  status:'DONE'           },
    { shot:'011', s:101, e:215,  anim: id('sanjan@studio.local'),        status:'DONE'           },
    { shot:'014', s:101, e:195,  anim: id('krishna@studio.local'),       status:'DONE'           },
    { shot:'015', s:101, e:228,  anim: id('sneha@studio.local'),         status:'IN_PROGRESS'    },
    { shot:'016', s:101, e:245,  anim: id('anand@studio.local'),         status:'YET_TO_START'   },
    { shot:'017', s:101, e:250,  anim: id('anand@studio.local'),         status:'YET_TO_START'   },
    { shot:'022', s:101, e:218,  anim: id('abhishek@studio.local'),      status:'IN_PROGRESS'    },
    { shot:'023', s:101, e:204,  anim: id('himanshu@studio.local'),      status:'IN_PROGRESS'    },
    { shot:'024', s:101, e:195,  anim: id('sanjan@studio.local'),        status:'YET_TO_START'   },
    { shot:'027', s:101, e:228,  anim: id('sandeepsingh@studio.local'),  status:'YET_TO_START'   },
    { shot:'030', s:101, e:258,  anim: id('sanjan@studio.local'),        status:'YET_TO_START'   },
  ])
  await seedModelling(p_gmg.id, [
    { name:'Cow (Gaiya)',       mod:id('akash@studio.local'),   rig:id('rashid@studio.local'),  tex:id('pratham@studio.local'),  status:'DONE'        },
    { name:'Calf Rig',          mod:id('anjali@studio.local'),  rig:id('rashid@studio.local'),  tex:id('prateek@studio.local'),  status:'DONE'        },
    { name:'Girl Character',    mod:id('jaivir@studio.local'),  rig:id('aashi@studio.local'),   tex:id('praveen@studio.local'),  status:'DONE'        },
    { name:'Boy Character',     mod:id('akash@studio.local'),   rig:id('aashi@studio.local'),   tex:id('pratham@studio.local'),  status:'IN_PROGRESS' },
    { name:'Grass Prop',        mod:id('anjali@studio.local'),  rig:id('rashid@studio.local'),  tex:id('praveen@studio.local'),  status:'DONE'        },
  ])

  // Project 5-B: Vehicle Learning Series
  const p_vl = await prisma.project.create({ data: { clientId: c5.id, name: 'Vehicle Learning Series', description: 'Learn colors and shapes with cartoon vehicles', folderName: 'VEHICLE_SRS', status: 'ACTIVE' } })
  await seedShots(p_vl.id, [
    { shot:'001', s:101, e:275,  anim: id('sandeep@studio.local'),   status:'DONE'        },
    { shot:'003', s:101, e:215,  anim: id('mukul@studio.local'),     status:'DONE'        },
    { shot:'004', s:101, e:228,  anim: id('chandra@studio.local'),   status:'IN_PROGRESS' },
    { shot:'005', s:101, e:195,  anim: id('sandeep@studio.local'),   status:'YET_TO_START'},
    { shot:'006', s:101, e:258,  anim: id('mukul@studio.local'),     status:'YET_TO_START'},
  ])

  const totalTasks = await prisma.task.count()
  console.log(`\n  ✓ 5 clients · 10 projects · ${totalTasks} tasks created.\n`)
}

// ─── Shot helper ──────────────────────────────────────────────────────────────
interface ShotSpec {
  shot:   string
  s:      number
  e:      number
  anim:   string
  status: 'YET_TO_START'|'IN_PROGRESS'|'LEAD_APPROVAL'|'LEAD_RETAKE'|'DONE'|'FINAL_APPROVAL'
}

async function seedShots(projectId: string, shots: ShotSpec[]) {
  for (const sh of shots) {
    const frameRange = fr(sh.s, sh.e)
    const seconds    = sec(sh.s, sh.e)

    // Cut Shots (Animatics)
    const cutTask = await prisma.task.create({
      data: {
        projectId, subStageId: 'animatics-cut-shots',
        itemName: `Shot ${sh.shot}`,
        shotNumber: sh.shot, frameRange, seconds,
        assignedArtistId: sh.anim,
        status: sh.status,
      },
    })

    // Animation mirror (same shot, same artist, same status — but no thumbnail)
    await prisma.task.create({
      data: {
        projectId, subStageId: 'animation-animation',
        itemName: `Shot ${sh.shot}`,
        shotNumber: sh.shot, frameRange, seconds,
        assignedArtistId: sh.anim,
        status: sh.status,
      },
    })

    // Add status history for tasks that aren't YET_TO_START
    if (sh.status !== 'YET_TO_START') {
      await prisma.statusChange.create({
        data: { taskId: cutTask.id, from: 'YET_TO_START', to: 'IN_PROGRESS', changedAt: new Date(Date.now() - 86400_000 * 7) },
      })
    }
    if (sh.status === 'LEAD_APPROVAL' || sh.status === 'DONE' || sh.status === 'FINAL_APPROVAL' || sh.status === 'LEAD_RETAKE') {
      await prisma.statusChange.create({
        data: { taskId: cutTask.id, from: 'IN_PROGRESS', to: 'LEAD_APPROVAL', changedAt: new Date(Date.now() - 86400_000 * 3) },
      })
    }
    if (sh.status === 'DONE' || sh.status === 'FINAL_APPROVAL') {
      await prisma.statusChange.create({
        data: { taskId: cutTask.id, from: 'LEAD_APPROVAL', to: 'DONE', changedAt: new Date(Date.now() - 86400_000 * 1) },
      })
    }
  }
}

// ─── Modelling / Rigging / Texturing helper ───────────────────────────────────
interface AssetSpec {
  name:   string
  mod:    string    // modelling artist id
  rig:    string    // rigging artist id
  tex:    string    // texturing artist id
  status: 'YET_TO_START'|'IN_PROGRESS'|'DONE'
}

async function seedModelling(projectId: string, assets: AssetSpec[]) {
  for (const a of assets) {
    await prisma.task.create({ data: { projectId, subStageId: 'modelling-character',             itemName: a.name, assignedArtistId: a.mod, status: a.status } })
    // BUG-23: the real auto-mirror (MIRROR_RULES) fans Modelling Character out to
    // Blendshapes + Unwrapping as well. The seed previously skipped both, so the
    // export's Character Sheet (which reads modelling-character-blendshapes) and
    // the Unwrapping stage showed empty rows for every seeded asset. Mirror the
    // app's behaviour: same name/artist/status as the modelling source.
    await prisma.task.create({ data: { projectId, subStageId: 'modelling-character-blendshapes', itemName: a.name, assignedArtistId: a.mod, status: a.status } })
    await prisma.task.create({ data: { projectId, subStageId: 'unwrapping-character',            itemName: a.name, assignedArtistId: a.mod, status: a.status } })
    await prisma.task.create({ data: { projectId, subStageId: 'rigging-character',               itemName: a.name, assignedArtistId: a.rig, status: a.status } })
    await prisma.task.create({ data: { projectId, subStageId: 'texturing-character',             itemName: a.name, assignedArtistId: a.tex, status: a.status } })
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main()
  .then(() => {
    console.log('╔══════════════════════════════════════════════════════════╗')
    console.log('║              ✅  SEED COMPLETE                           ║')
    console.log('╠══════════════════════════════════════════════════════════╣')
    console.log(`║  Admin login:                                            ║`)
    console.log(`║    Email:    ${ADMIN_EMAIL.padEnd(42)} ║`)
    console.log(`║    Password: ${'see SEED_ADMIN_PASSWORD in backend/.env'.padEnd(42)} ║`)
    console.log('╠══════════════════════════════════════════════════════════╣')
    console.log(`║  All artists:                                            ║`)
    console.log(`║    Password: ${'see SEED_DEFAULT_PASSWORD in backend/.env'.padEnd(42)} ║`)
    console.log(`║    Email:    [firstname]@studio.local                    ║`)
    console.log(`║    e.g.      sneha@studio.local                          ║`)
    console.log('╚══════════════════════════════════════════════════════════╝')
  })
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
