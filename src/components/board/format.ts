import { severityLabel } from '@/lib/pipeline/scoring'
import type { EventType } from '@/lib/pipeline/types'

export const SEVERITY_COLOR = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#64748b',
} as const

export function priorityColor(priority: number): string {
  return SEVERITY_COLOR[severityLabel(priority)]
}

const TYPE_LABEL: Record<EventType, string> = {
  medical_rescue: 'Medical',
  rescue: 'Rescue',
  fire: 'Fire',
  earthquake: 'Earthquake',
  flood: 'Flood',
  storm: 'Storm',
  power_outage: 'Power outage',
  road_block: 'Road blocked',
  other: 'Other',
}

export function typeLabel(t: string): string {
  return TYPE_LABEL[t as EventType] ?? t
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

/** JSON columns can arrive parsed or as strings depending on the path. */
export function asArray<T = string>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      return JSON.parse(v) as T[]
    } catch {
      return []
    }
  }
  return []
}

export function asObject<T>(v: unknown): T | null {
  if (v && typeof v === 'object') return v as T
  if (typeof v === 'string' && v.startsWith('{')) {
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }
  return null
}
