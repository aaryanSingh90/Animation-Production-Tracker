/**
 * Seed script — populates the database with the studio admin + the 25-artist roster.
 *
 * Run:  npm run db:seed   (or `npx prisma db seed`)
 *
 * Idempotent: uses upsert keyed on email, so re-running won't create duplicates.
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient, EmployeeRole, EmployeeDepartment } from '@prisma/client'

const prisma = new PrismaClient()

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@studio.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin123'
const DEFAULT_PW     = process.env.SEED_DEFAULT_PASSWORD ?? 'studio123'

const C = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316','#8b5cf6','#14b8a6']
const c = (i: number) => C[i % C.length]

interface RosterEntry {
  name:       string
  email:      string
  role:       EmployeeRole
  department: EmployeeDepartment
  color:      string
}

const ROSTER: RosterEntry[] = [
  // Animation (10)
  { name: 'Sneha',         email: 'sneha@studio.local',         role: 'ARTIST', department: 'Animation',   color: c(0) },
  { name: 'Himanshu',      email: 'himanshu@studio.local',      role: 'ARTIST', department: 'Animation',   color: c(1) },
  { name: 'Anand',         email: 'anand@studio.local',         role: 'LEAD',   department: 'Animation',   color: c(2) },
  { name: 'Abhishek',      email: 'abhishek@studio.local',      role: 'ARTIST', department: 'Animation',   color: c(3) },
  { name: 'Sandeep Singh', email: 'sandeep.singh@studio.local', role: 'ARTIST', department: 'Animation',   color: c(4) },
  { name: 'Sanjan',        email: 'sanjan@studio.local',        role: 'ARTIST', department: 'Animation',   color: c(5) },
  { name: 'Sreeparna',     email: 'sreeparna@studio.local',     role: 'ARTIST', department: 'Animation',   color: c(6) },
  { name: 'Krishna',       email: 'krishna@studio.local',       role: 'ARTIST', department: 'Animation',   color: c(7) },
  { name: 'Priyanshu',     email: 'priyanshu@studio.local',     role: 'ARTIST', department: 'Animation',   color: c(0) },
  { name: 'Ayush',         email: 'ayush@studio.local',         role: 'ARTIST', department: 'Animation',   color: c(1) },

  // Texturing (3)
  { name: 'Pratham',       email: 'pratham@studio.local',       role: 'ARTIST', department: 'Texturing',   color: c(2) },
  { name: 'Praveen',       email: 'praveen@studio.local',       role: 'ARTIST', department: 'Texturing',   color: c(3) },
  { name: 'Prateek',       email: 'prateek@studio.local',       role: 'ARTIST', department: 'Texturing',   color: c(4) },

  // Modelling (3)
  { name: 'Akash',         email: 'akash@studio.local',         role: 'ARTIST', department: 'Modelling',   color: c(5) },
  { name: 'Anjali',        email: 'anjali@studio.local',        role: 'ARTIST', department: 'Modelling',   color: c(6) },
  { name: 'Jaivir',        email: 'jaivir@studio.local',        role: 'LEAD',   department: 'Modelling',   color: c(7) },

  // Lighting (4)
  { name: 'Mukul',         email: 'mukul@studio.local',         role: 'LEAD',   department: 'Lighting',    color: c(0) },
  { name: 'Chandra',       email: 'chandra@studio.local',       role: 'ARTIST', department: 'Lighting',    color: c(1) },
  { name: 'Sandeep',       email: 'sandeep@studio.local',       role: 'ARTIST', department: 'Lighting',    color: c(2) },
  { name: 'Mohit',         email: 'mohit@studio.local',         role: 'ARTIST', department: 'Lighting',    color: c(3) },

  // Editing (1)
  { name: 'Palash',        email: 'palash@studio.local',        role: 'LEAD',   department: 'Editing',     color: c(4) },

  // Rigging (2)
  { name: 'Rashid',        email: 'rashid@studio.local',        role: 'LEAD',   department: 'Rigging',     color: c(5) },
  { name: 'Aashi',         email: 'aashi@studio.local',         role: 'ARTIST', department: 'Rigging',     color: c(6) },

  // Compositing (1)
  { name: 'Ajay',          email: 'ajay@studio.local',          role: 'LEAD',   department: 'Compositing', color: c(7) },

  // FX (1)
  { name: 'Sourav',        email: 'sourav@studio.local',        role: 'LEAD',   department: 'FX',          color: c(0) },
]

async function main() {
  console.log('▶ Seeding ShotHub database…\n')

  // Admin
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
  await prisma.employee.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},  // don't clobber a changed password on re-seed
    create: {
      name:         'Studio Admin',
      email:        ADMIN_EMAIL,
      passwordHash: adminHash,
      role:         'MANAGER',
      department:   'Editing',
      active:       true,
      avatarColor:  '#6366f1',
    },
  })
  console.log(`  ✓ Admin       ${ADMIN_EMAIL.padEnd(28)} (password: ${ADMIN_PASSWORD})`)

  // Roster
  const defaultHash = await bcrypt.hash(DEFAULT_PW, 10)
  for (const entry of ROSTER) {
    await prisma.employee.upsert({
      where: { email: entry.email },
      update: {},
      create: {
        name:         entry.name,
        email:        entry.email,
        passwordHash: defaultHash,
        role:         entry.role,
        department:   entry.department,
        active:       true,
        avatarColor:  entry.color,
      },
    })
    console.log(`  ✓ ${entry.role.padEnd(7)} ${entry.email.padEnd(28)} (${entry.department})`)
  }

  console.log(`\n✓ Seed complete — ${ROSTER.length + 1} employees.\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
