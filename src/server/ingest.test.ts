import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { ingest, buildIncident, type IncidentData } from './ingest'
import { extractWithRules } from '../lib/pipeline/rules'
import { DEMO_REPORTS } from '../lib/demo'
import { fusionBreakdown } from '../lib/pipeline/fusion'

/** Just enough of the RecordRoom tools to run the pipeline in memory. */
function fakeTools() {
  const db: Record<string, Map<string, Record<string, unknown>>> = { reports: new Map(), incidents: new Map() }
  let n = 0
  const ok = <T>(data: T) => ({ success: true as const, data })
  const tools = {
    async create(c: string, data: Record<string, unknown>) {
      const id = `${c}_${++n}`
      db[c].set(id, { ...data })
      return ok({ recordId: id })
    },
    async update(c: string, id: string, data: Record<string, unknown>) {
      db[c].set(id, { ...db[c].get(id), ...data })
      return ok({ recordId: id })
    },
    async get(c: string, id: string) {
      return ok({ record: { recordId: id, data: db[c].get(id) } })
    },
    async query(c: string, opts: { where?: Record<string, unknown> } = {}) {
      const records = [...db[c].entries()]
        .filter(([, d]) => Object.entries(opts.where ?? {}).every(([k, v]) => d[k] === v))
        .map(([recordId, data]) => ({ recordId, data }))
      return ok({ records, count: records.length })
    },
  }
  return { db, tools: tools as unknown as ActionTools }
}

async function runDemo() {
  const { db, tools } = fakeTools()
  const t0 = Date.parse('2026-11-26T20:00:00Z')
  const outcomes = []
  for (const [i, r] of DEMO_REPORTS.entries()) {
    const e = extractWithRules({ ...r, reportedAt: new Date(t0 + i * 60_000).toISOString() })
    outcomes.push(await ingest(tools, e, 'tester'))
  }
  return { db, outcomes }
}

describe('demo scenario', () => {
  it('fuses 9 reports into 5 incidents and quarantines the chatter', async () => {
    const { db, outcomes } = await runDemo()
    expect(outcomes.map((o) => o.outcome)).toEqual([
      'created', 'merged', 'merged', // Mission St flood: field + social + voice
      'created', 'merged', // Pine St nursing home oxygen
      'created', 'created', 'created', // Marina outage, Embarcadero tree, SoMa fire
      'quarantined', // "Lovely sunny afternoon"
    ])
    expect(db.incidents.size).toBe(5)
    expect(db.reports.size).toBe(9)
  })

  it('ranks the oxygen emergency and the stranded people above the road block', async () => {
    const { db } = await runDemo()
    const incidents = [...db.incidents.values()] as IncidentData[]
    const ranked = incidents.sort((a, b) => b.priority - a.priority)
    expect(ranked[0].locationText).toBe('Pine St')
    expect(ranked[0].priority).toBe(100)
    expect(ranked[0].reasons.join(' ')).toMatch(/oxygen/)
    expect(ranked.at(-1)!.eventType).toBe('road_block')
    const flood = incidents.find((i) => i.reportsCount === 3)!
    expect(flood.sources.sort()).toEqual(['field', 'social', 'voice'])
  })
})

describe('fusion', () => {
  it('does not merge similar text from far away', () => {
    const a = extractWithRules({ text: 'Flooding, people trapped on a car roof', source: 'field', lat: 37.765, lng: -122.419 })
    const b = extractWithRules({ text: 'Flooding, people trapped on a car roof', source: 'field', lat: 37.9, lng: -122.2 })
    const inc = { ...buildIncident([a]), lastReportAt: a.reportedAt }
    const near = fusionBreakdown(a, inc, [a.text])
    const far = fusionBreakdown(b, inc, [a.text])
    expect(near.total).toBeGreaterThan(0.9)
    expect(far.location).toBe(0)
    expect(far.total).toBeLessThan(0.8)
  })

  it('keeps a claim when a new report merges in', () => {
    const a = extractWithRules({ text: 'Fire at warehouse on 7th St', source: 'social', lat: 37.77, lng: -122.4 })
    const inc = buildIncident([a, a], { status: 'claimed', claimedBy: 'u1', claimedByName: 'Sam' })
    expect(inc.status).toBe('claimed')
    expect(inc.claimedByName).toBe('Sam')
    expect(buildIncident([a], { status: 'resolved', claimedBy: '', claimedByName: '' }).status).toBe('open')
  })
})
