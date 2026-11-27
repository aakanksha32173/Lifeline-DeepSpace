/**
 * Deterministic extraction and triage. Used as the fallback whenever the LLM
 * is unavailable or returns something unusable, and for the scripted demo so
 * it never depends on a model being up.
 */

import type { EventType, ExtractedEvent, Source } from './types'

const TYPE_RULES: [EventType, number, string[]][] = [
  ['medical_rescue', 9, ['oxygen', 'insulin', 'dialysis', 'ambulance', 'injured', 'unconscious', 'not breathing', 'heart attack', 'bleeding', 'medical']],
  ['rescue', 8, ['trapped', 'stranded', 'rescue', 'stuck', "can't get out", 'cannot get out', 'collapsed on']],
  ['fire', 8, ['fire', 'smoke', 'burning', 'wildfire', 'flames']],
  ['earthquake', 7, ['earthquake', 'quake', 'tremor', 'aftershock', 'magnitude']],
  ['flood', 7, ['flood', 'water rising', 'inundat', 'underwater', 'storm surge']],
  ['storm', 6, ['storm', 'high wind', 'wind warning', 'hurricane', 'tornado', 'gust']],
  ['power_outage', 6, ['power outage', 'blackout', 'no power', 'power is out', 'power lines down', 'lost power']],
  ['road_block', 5, ['road blocked', 'road closed', 'closure', 'debris', 'landslide', 'mudslide', 'fallen tree', 'impassable']],
]

const ESCALATORS = ['urgent', 'emergency', 'immediately', 'asap', 'critical', 'dying', 'life-threatening', 'please help']
const VULNERABLE = ['elderly', 'child', 'children', 'baby', 'nursing home', 'senior', 'disabled', 'wheelchair', 'pregnant']

const NEEDS: Record<string, string[]> = {
  oxygen: ['oxygen'],
  insulin: ['insulin'],
  dialysis: ['dialysis'],
  medicine: ['medicine', 'medication', 'prescription'],
  ambulance: ['ambulance', 'injured', 'unconscious', 'bleeding'],
  water: ['drinking water', 'need water', 'no water'],
  food: ['food', 'hungry'],
  shelter: ['shelter', 'homeless', 'nowhere to go'],
  evacuation: ['evacuat'],
  rescue: ['trapped', 'stranded', 'rescue', 'stuck'],
  power: ['generator', 'no power'],
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  dozen: 12, twenty: 20, fifty: 50, hundred: 100,
}
const PEOPLE_RE = new RegExp(
  `\\b(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:\\w+\\s+)?(people|persons|residents|families|children|kids|adults|patients|seniors|students|workers)\\b`,
  'gi',
)

export const SOURCE_CONFIDENCE: Record<Source, number> = {
  weather: 0.9, sensor: 0.9, field: 0.85, voice: 0.75, web: 0.7, social: 0.6,
}

export function countPeople(text: string): number {
  let total = 0
  for (const m of text.matchAll(PEOPLE_RE)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()]
    total += n * (m[2].toLowerCase() === 'families' ? 3 : 1)
  }
  return Math.max(total, 1)
}

export interface RulesInput {
  text: string
  source: Source
  locationText?: string
  lat?: number | null
  lng?: number | null
  reportedAt?: string
}

export function extractWithRules(input: RulesInput): ExtractedEvent {
  const text = input.text.toLowerCase()
  const matches = TYPE_RULES.filter(([, , kws]) => kws.some((k) => text.includes(k)))
  let [eventType, urgency]: [EventType, number] = ['other', 3]
  for (const [t, u] of matches) if (u > urgency || eventType === 'other') [eventType, urgency] = [t, u]
  if (ESCALATORS.some((w) => text.includes(w))) urgency += 1
  if (VULNERABLE.some((w) => text.includes(w))) urgency += 1

  const needs = Object.entries(NEEDS)
    .filter(([, kws]) => kws.some((k) => text.includes(k)))
    .map(([need]) => need)

  const lat = input.lat ?? null
  const lng = input.lng ?? null
  let confidence = SOURCE_CONFIDENCE[input.source] ?? 0.7
  if (lat == null) confidence -= 0.15

  return {
    text: input.text.trim(),
    source: input.source,
    eventType,
    urgency: Math.max(1, Math.min(urgency, 10)),
    needs,
    peopleAffected: countPeople(input.text),
    locationText: input.locationText?.trim() || 'Unknown',
    lat,
    lng,
    reportedAt: input.reportedAt ?? new Date().toISOString(),
    confidence: Math.round(Math.max(confidence, 0.1) * 100) / 100,
    extractedBy: 'rules',
  }
}

const TRIAGE_KEYWORDS = [
  'flood', 'rescue', 'help', 'trapped', 'evacuat', 'fire', 'smoke', 'medical', 'oxygen',
  'insulin', 'injur', 'power outage', 'no power', 'power is out', 'road blocked', 'road closed',
  'stranded', 'water rising', 'earthquake', 'aftershock', 'collapse', 'warning', 'watch',
  'advisory', 'storm', 'high wind', 'landslide', 'mudslide',
]

/**
 * Filters routine chatter ("lovely sunny day") before it creates an incident.
 * Returns a 0 to 1 score; below 0.5 the report is kept but quarantined.
 */
export function actionability(e: ExtractedEvent): number {
  let score = 0
  const text = e.text.toLowerCase()
  if (e.lat != null || (e.locationText && e.locationText !== 'Unknown')) score += 0.3
  if (e.urgency >= 5) score += 0.2
  if (e.eventType !== 'other' || TRIAGE_KEYWORDS.some((k) => text.includes(k))) score += 0.4
  if (e.confidence >= 0.7) score += 0.1
  return Math.round(Math.min(score, 1) * 100) / 100
}

export const ACTIONABLE_THRESHOLD = 0.5
