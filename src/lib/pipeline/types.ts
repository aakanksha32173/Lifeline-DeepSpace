/**
 * Shared shapes for the incident pipeline. Pure data: no DeepSpace imports, so
 * the same code runs in the worker, in the browser, and in vitest.
 */

export const EVENT_TYPES = [
  'medical_rescue',
  'rescue',
  'fire',
  'earthquake',
  'flood',
  'storm',
  'power_outage',
  'road_block',
  'other',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const SOURCES = ['field', 'voice', 'social', 'web', 'weather', 'sensor'] as const
export type Source = (typeof SOURCES)[number]

/** One report after extraction: what happened, where, how bad. */
export interface ExtractedEvent {
  text: string
  source: Source
  eventType: EventType
  /** 1 (routine) to 10 (life-threatening). */
  urgency: number
  needs: string[]
  peopleAffected: number
  locationText: string
  lat: number | null
  lng: number | null
  /** ISO timestamp. */
  reportedAt: string
  /** Source reliability, 0 to 1. */
  confidence: number
  /** Who did the extraction: the LLM, or the deterministic rules fallback. */
  extractedBy: 'ai' | 'rules'
}

/** The fields of an incident that fusion and scoring need. */
export interface IncidentLike {
  eventType: EventType
  lat: number | null
  lng: number | null
  lastReportAt: string
  summary: string
}

export interface FusionBreakdown {
  semantic: number
  location: number
  time: number
  type: number
  total: number
}
