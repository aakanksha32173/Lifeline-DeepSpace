/**
 * Priority 0 to 100 for an incident, with the reasons behind it, so a
 * responder can see why something is at the top of the queue.
 */

import type { EventType, ExtractedEvent } from './types'

const MEDICAL_NEEDS = new Set(['oxygen', 'insulin', 'dialysis', 'ambulance', 'medicine'])
const VULNERABLE_WORDS = [
  'elderly', 'grandmother', 'grandfather', 'child', 'children', 'baby', 'nursing home',
  'senior', 'disabled', 'wheelchair', 'pregnant',
]

export interface Priority {
  score: number
  reasons: string[]
}

type ScoredEvent = Pick<ExtractedEvent, 'urgency' | 'peopleAffected' | 'text' | 'source' | 'needs'>

export function calculatePriority(events: ScoredEvent[]): Priority {
  if (events.length === 0) return { score: 0, reasons: [] }
  const reasons: string[] = []
  const maxUrgency = Math.max(...events.map((e) => e.urgency))
  // Duplicate reports of the same people should not add up, so take the
  // largest single estimate rather than the sum.
  const people = Math.max(...events.map((e) => e.peopleAffected))
  const allText = events.map((e) => e.text.toLowerCase()).join(' ')
  const sources = new Set(events.map((e) => e.source))
  const needs = new Set(events.flatMap((e) => e.needs.map((n) => n.toLowerCase())))

  let score = maxUrgency * 10
  reasons.push(`Urgency ${maxUrgency}/10 (+${maxUrgency * 10})`)

  const medical = [...needs].filter((n) => MEDICAL_NEEDS.has(n))
  if (medical.length) {
    score += 15
    reasons.push(`Medical need: ${medical.join(', ')} (+15)`)
  }
  const vulnerable = VULNERABLE_WORDS.find((w) => allText.includes(w))
  if (vulnerable) {
    score += 10
    reasons.push(`Vulnerable people mentioned ("${vulnerable}") (+10)`)
  }
  if (people >= 10) {
    score += 10
    reasons.push(`About ${people} people affected (+10)`)
  } else if (people >= 3) {
    score += 5
    reasons.push(`About ${people} people affected (+5)`)
  }
  if (sources.size >= 2) {
    score += 5
    reasons.push(`Confirmed by ${sources.size} independent sources (+5)`)
  }

  return { score: Math.min(score, 100), reasons }
}

const ACTIONS: Partial<Record<EventType, string>> = {
  medical_rescue: 'Dispatch medical team and ambulance',
  rescue: 'Dispatch rescue team',
  fire: 'Dispatch fire response and set a safety perimeter',
  earthquake: 'Assess structural damage and check for trapped people',
  flood: 'Monitor flooding and prepare evacuation support',
  storm: 'Pre-position crews for wind and storm damage',
  road_block: 'Send a field unit to verify road access',
  power_outage: 'Notify the utility response team',
}

export function recommendedAction(priority: number, eventType: EventType): string {
  if (priority >= 90) return 'Immediate dispatch required'
  return ACTIONS[eventType] ?? 'Review incident'
}

export function severityLabel(priority: number): 'critical' | 'high' | 'medium' | 'low' {
  if (priority >= 90) return 'critical'
  if (priority >= 70) return 'high'
  if (priority >= 50) return 'medium'
  return 'low'
}
