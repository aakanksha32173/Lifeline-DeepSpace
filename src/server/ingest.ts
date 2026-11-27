/**
 * Report -> incident. Runs inside a server action with RBAC-off record tools,
 * so this file is the only writer of `reports` and `incidents`.
 *
 * Steps: triage (quarantine chatter), find candidate incidents, fuse or open
 * a new incident, then rebuild that incident's aggregate fields from all of
 * its reports so priority always reflects the full picture.
 */

import type { ActionTools } from 'deepspace/worker'
import { actionability, ACTIONABLE_THRESHOLD } from '../lib/pipeline/rules'
import { pickIncident, type Candidate } from '../lib/pipeline/fusion'
import { calculatePriority, recommendedAction } from '../lib/pipeline/scoring'
import type { EventType, ExtractedEvent, FusionBreakdown, Source } from '../lib/pipeline/types'

export interface IncidentData extends Record<string, unknown> {
  eventType: EventType
  summary: string
  locationText: string
  lat: number | null
  lng: number | null
  priority: number
  reasons: string[]
  recommendedAction: string
  reportsCount: number
  peopleAffected: number
  needs: string[]
  sources: string[]
  status: 'open' | 'claimed' | 'resolved'
  claimedBy: string
  claimedByName: string
  lastReportAt: string
}

export interface ReportData extends Record<string, unknown> {
  text: string
  source: Source
  eventType: EventType
  urgency: number
  needs: string[]
  peopleAffected: number
  locationText: string
  lat: number | null
  lng: number | null
  reportedAt: string
  confidence: number
  extractedBy: 'ai' | 'rules'
  incidentId: string
  outcome: 'merged' | 'created' | 'quarantined'
  fusion: FusionBreakdown | null
  submittedByName: string
}

export interface IngestResult {
  outcome: ReportData['outcome']
  reportId: string
  incidentId: string | null
  fusion: FusionBreakdown | null
  actionability: number
}

function unwrap<T>(r: { success: true; data: T } | { success: false; error: string }, what: string): T {
  if (!r.success) throw new Error(`${what}: ${r.error}`)
  return r.data
}

function mostCommon<T>(items: T[]): T {
  const counts = new Map<T, number>()
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** Aggregate an incident from its member reports. Pure; exported for tests. */
export function buildIncident(
  members: ExtractedEvent[],
  prev?: Pick<IncidentData, 'status' | 'claimedBy' | 'claimedByName'>,
): IncidentData {
  const eventType = mostCommon(members.map((m) => m.eventType))
  const { score, reasons } = calculatePriority(members)
  const located = members.filter((m) => m.lat != null && m.lng != null)
  const places = members.map((m) => m.locationText).filter((p) => p && p !== 'Unknown')
  const people = Math.max(...members.map((m) => m.peopleAffected))
  const label = eventType.replace('_', ' ')
  const summary =
    members.length === 1
      ? members[0].text
      : `${members.length} reports of ${label}${places.length ? ` near ${mostCommon(places)}` : ''}. About ${people} people affected.`
  return {
    eventType,
    summary,
    locationText: places.length ? mostCommon(places) : 'Unknown',
    lat: located.length ? located.reduce((s, m) => s + m.lat!, 0) / located.length : null,
    lng: located.length ? located.reduce((s, m) => s + m.lng!, 0) / located.length : null,
    priority: score,
    reasons,
    recommendedAction: recommendedAction(score, eventType),
    reportsCount: members.length,
    peopleAffected: people,
    needs: [...new Set(members.flatMap((m) => m.needs))],
    sources: [...new Set(members.map((m) => m.source))],
    // A new report on a resolved incident reopens it: something is still happening.
    status: prev?.status === 'claimed' ? 'claimed' : 'open',
    claimedBy: prev?.status === 'claimed' ? prev.claimedBy : '',
    claimedByName: prev?.status === 'claimed' ? prev.claimedByName : '',
    lastReportAt: members.map((m) => m.reportedAt).sort().at(-1)!,
  }
}

const OPEN_INCIDENT_SCAN_LIMIT = 200

export async function ingest(
  tools: ActionTools,
  event: ExtractedEvent,
  submittedByName: string,
): Promise<IngestResult> {
  const score = actionability(event)
  const base = { ...event, submittedByName }

  if (score < ACTIONABLE_THRESHOLD) {
    const created = unwrap(
      await tools.create<ReportData>('reports', { ...base, incidentId: '', outcome: 'quarantined', fusion: null }),
      'save quarantined report',
    )
    return { outcome: 'quarantined', reportId: created.recordId, incidentId: null, fusion: null, actionability: score }
  }

  // Candidate incidents: everything not resolved. The radius filter in
  // pickIncident keeps scoring cheap; a GEO index is the next step at scale.
  const open = unwrap(
    await tools.query<IncidentData>('incidents', { orderBy: 'lastReportAt', orderDir: 'desc', limit: OPEN_INCIDENT_SCAN_LIMIT }),
    'load incidents',
  ).records.filter((r) => r.data.status !== 'resolved')

  const candidates: Candidate<IncidentData>[] = await Promise.all(
    open.map(async (r) => {
      const members = unwrap(
        await tools.query<ReportData>('reports', { where: { incidentId: r.recordId }, orderBy: 'reportedAt', limit: 10 }),
        'load incident reports',
      ).records
      return { id: r.recordId, incident: r.data, memberTexts: members.map((m) => m.data.text) }
    }),
  )

  const match = pickIncident(event, candidates)
  let incidentId: string
  if (match) {
    incidentId = match.id
  } else {
    const seed = buildIncident([event])
    incidentId = unwrap(await tools.create<IncidentData>('incidents', seed), 'create incident').recordId
  }

  const report = unwrap(
    await tools.create<ReportData>('reports', {
      ...base,
      incidentId,
      outcome: match ? 'merged' : 'created',
      fusion: match?.breakdown ?? null,
    }),
    'save report',
  )

  if (match) {
    const all = unwrap(
      await tools.query<ReportData>('reports', { where: { incidentId }, limit: 500 }),
      'load all incident reports',
    ).records.map((r) => r.data as unknown as ExtractedEvent)
    const prev = candidates.find((c) => c.id === incidentId)!.incident
    unwrap(await tools.update<IncidentData>('incidents', incidentId, buildIncident(all, prev)), 'update incident')
  }

  return {
    outcome: match ? 'merged' : 'created',
    reportId: report.recordId,
    incidentId,
    fusion: match?.breakdown ?? null,
    actionability: score,
  }
}
