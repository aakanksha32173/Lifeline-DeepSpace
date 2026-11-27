/**
 * Decides whether a new report describes an incident we already know about.
 * Weighted blend of text similarity, distance, time gap and type compatibility,
 * ported from the original Python FusionAgent.
 */

import { textSimilarity } from './embeddings'
import type { EventType, ExtractedEvent, FusionBreakdown, IncidentLike } from './types'

export const FUSION_THRESHOLD = 0.62
/** Only incidents within this radius are scored at all. */
export const CANDIDATE_RADIUS_KM = 5

const WEIGHTS = { semantic: 0.45, location: 0.25, time: 0.2, type: 0.1 }

const COMPATIBLE: Partial<Record<EventType, EventType[]>> = {
  flood: ['flood', 'rescue', 'medical_rescue', 'road_block', 'storm'],
  rescue: ['rescue', 'medical_rescue', 'flood', 'fire', 'earthquake'],
  medical_rescue: ['medical_rescue', 'rescue', 'flood', 'fire', 'earthquake', 'power_outage'],
  road_block: ['road_block', 'flood', 'storm', 'earthquake'],
  power_outage: ['power_outage', 'storm', 'medical_rescue'],
  fire: ['fire', 'rescue', 'medical_rescue'],
  earthquake: ['earthquake', 'rescue', 'medical_rescue', 'road_block'],
  storm: ['storm', 'flood', 'power_outage', 'road_block'],
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function locationScore(e: ExtractedEvent, inc: IncidentLike): number {
  if (e.lat == null || e.lng == null || inc.lat == null || inc.lng == null) return 0
  const d = distanceKm(e.lat, e.lng, inc.lat, inc.lng)
  if (d <= 0.5) return 1
  if (d <= 2) return 0.8
  if (d <= 5) return 0.5
  return 0
}

function timeScore(a: string, b: string): number {
  const hours = Math.abs(Date.parse(a) - Date.parse(b)) / 3_600_000
  if (hours <= 1) return 1
  if (hours <= 3) return 0.8
  if (hours <= 6) return 0.5
  return 0
}

function typeScore(eventType: EventType, incidentType: EventType): number {
  if (eventType === incidentType) return 1
  return COMPATIBLE[incidentType]?.includes(eventType) ? 0.7 : 0
}

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * @param memberTexts recent report texts already in the incident; semantic
 *   similarity is the best match against any of them (or the summary).
 */
export function fusionBreakdown(
  e: ExtractedEvent,
  inc: IncidentLike,
  memberTexts: string[],
): FusionBreakdown {
  const texts = memberTexts.length ? memberTexts.slice(-10) : [inc.summary]
  const semantic = Math.max(...texts.map((t) => textSimilarity(e.text, t)))
  const location = locationScore(e, inc)
  const time = timeScore(e.reportedAt, inc.lastReportAt)
  const type = typeScore(e.eventType, inc.eventType)
  const total =
    WEIGHTS.semantic * semantic + WEIGHTS.location * location + WEIGHTS.time * time + WEIGHTS.type * type
  return {
    semantic: round(semantic),
    location: round(location),
    time: round(time),
    type: round(type),
    total: round(total),
  }
}

export interface Candidate<T extends IncidentLike> {
  id: string
  incident: T
  memberTexts: string[]
}

/** Best incident to merge into, or null when the report should open a new one. */
export function pickIncident<T extends IncidentLike>(
  e: ExtractedEvent,
  candidates: Candidate<T>[],
): { id: string; breakdown: FusionBreakdown } | null {
  let best: { id: string; breakdown: FusionBreakdown } | null = null
  for (const c of candidates) {
    const { lat, lng } = c.incident
    if (e.lat != null && e.lng != null && lat != null && lng != null) {
      if (distanceKm(e.lat, e.lng, lat, lng) > CANDIDATE_RADIUS_KM) continue
    }
    const breakdown = fusionBreakdown(e, c.incident, c.memberTexts)
    if (!best || breakdown.total > best.breakdown.total) best = { id: c.id, breakdown }
  }
  return best && best.breakdown.total >= FUSION_THRESHOLD ? best : null
}
