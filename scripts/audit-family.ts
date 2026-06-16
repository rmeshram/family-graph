#!/usr/bin/env npx tsx
/**
 * scripts/audit-family.ts
 * Audits a specific family's relationship data for in-law/structural bugs.
 * Usage: npx tsx scripts/audit-family.ts [familyId]
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

if (typeof (globalThis as any).WebSocket === 'undefined') {
  ;(globalThis as any).WebSocket = class NoopWebSocket { constructor() {} close() {} }
}

function loadEnv() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function main() {
  const FAMILY = process.argv[2] ?? '816baa44-d9ff-47ff-842a-77a23991398b'
  const NAMES = ['shubham', 'shikha', 'sushita', 'shuchita', 'pushpa', 'sukhdev', 'ratnamala', 'vibha', 'pl ']

  const { data, error } = await admin
    .from('family_members')
    .select('id, name, relationship, generation, parent_ids, spouse_ids, network_group')
    .eq('family_id', FAMILY)
    .is('deleted_at', null)

  if (error) { console.error('Error:', error.message); process.exit(1) }
  const rows = (data ?? []) as any[]
  const byId = new Map(rows.map((r: any) => [r.id as string, r.name as string]))

  const hits = rows.filter((r: any) => NAMES.some(n => (r.name as string).toLowerCase().includes(n)))

  console.log('\nFamily:', FAMILY, ' | Members:', rows.length)
  console.log('='.repeat(72))

  for (const r of hits) {
    const pNames = (r.parent_ids ?? []).map((id: string) => byId.get(id) ?? '?' + id.slice(0,8))
    const sNames = (r.spouse_ids ?? []).map((id: string) => byId.get(id) ?? '?' + id.slice(0,8))
    const isChildOf = rows.filter((x: any) => (x.parent_ids ?? []).includes(r.id)).map((x: any) => x.name)
    console.log('\n' + r.name)
    console.log('  id:        ', r.id)
    console.log('  rel:       ', r.relationship ?? '—')
    console.log('  gen:       ', r.generation)
    console.log('  parentIds: ', JSON.stringify(r.parent_ids ?? []))
    console.log('  parents:   ', pNames.join(', ') || '—')
    console.log('  spouseIds: ', JSON.stringify(r.spouse_ids ?? []))
    console.log('  spouses:   ', sNames.join(', ') || '—')
    console.log('  isChildOf: ', isChildOf.join(', ') || '—')
    for (const sid of (r.spouse_ids ?? [])) {
      const sp = rows.find((x: any) => x.id === sid)
      if (!sp) continue
      const shared = (r.parent_ids ?? []).filter((pid: string) => (sp.parent_ids ?? []).includes(pid))
      if (shared.length > 0)
        console.log('  ⚠ INLAW_AS_CHILD shared parents with', sp.name + ':', shared.map((id: string) => byId.get(id) ?? id).join(', '))
      if (!(sp.spouse_ids ?? []).includes(r.id))
        console.log('  ⚠ ONE-WAY SPOUSE: not reciprocated by', sp.name)
    }
    console.log('-'.repeat(72))
  }

  const hitIds = new Set(hits.map((r: any) => r.id as string))
  const children = rows.filter((r: any) => (r.parent_ids ?? []).some((pid: string) => hitIds.has(pid)))
  if (children.length > 0) {
    console.log('\nNodes that list any of the above as parents:')
    for (const c of children) {
      const pNames = (c.parent_ids ?? []).map((id: string) => byId.get(id) ?? id)
      const sNames = (c.spouse_ids ?? []).map((id: string) => byId.get(id) ?? id)
      console.log(` ${c.name} | rel:${c.relationship ?? '—'} | gen:${c.generation}`)
      console.log(`   parents:[${pNames.join(', ')}]  spouses:[${sNames.join(', ')}]`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
