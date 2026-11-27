/**
 * Server actions: the only way the browser changes incident data.
 * Each one runs after `resolveAuth` in src/server/action-routes.ts, so
 * `userId` is a verified signed-in user. Record tools here bypass per-record
 * RBAC, so every action validates its own params.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { extractEvent } from '../server/extract-ai'
import { geocode, type Viewbox } from '../server/geocode'
import { ingest, type IncidentData } from '../server/ingest'
import { extractWithRules } from '../lib/pipeline/rules'
import { SOURCES, type Source } from '../lib/pipeline/types'
import { DEMO_REPORTS } from '../lib/demo'

const MAX_TEXT = 2000

async function callerName(tools: ActionTools, userId: string): Promise<string> {
  const r = await tools.get<{ name?: string }>('users', userId)
  return (r.success && r.data.record?.data?.name) || 'A responder'
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function parseViewbox(v: unknown): Viewbox | undefined {
  if (!v || typeof v !== 'object') return undefined
  const b = v as Record<string, unknown>
  const [west, south, east, north] = [num(b.west), num(b.south), num(b.east), num(b.north)]
  if (west == null || south == null || east == null || north == null) return undefined
  return { west, south, east, north }
}

const submitReport: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const text = typeof params.text === 'string' ? params.text.trim() : ''
  if (!text) return { success: false, error: 'Write what is happening first.' }
  if (text.length > MAX_TEXT) return { success: false, error: `Keep reports under ${MAX_TEXT} characters.` }
  const source: Source = SOURCES.includes(params.source as Source) ? (params.source as Source) : 'field'
  const pinLat = num(params.lat)
  const pinLng = num(params.lng)
  const pinned = pinLat != null && pinLng != null

  const { event, locationQuery, fallbackReason } = await extractEvent(env, {
    text,
    source,
    lat: pinLat,
    lng: pinLng,
    locationText: pinned ? 'Pinned on map' : undefined,
  })

  // A dropped pin wins over geocoding: the responder knows where it is.
  if (!pinned && locationQuery) {
    const hit = await geocode(locationQuery, parseViewbox(params.viewbox))
    event.locationText = locationQuery
    if (hit) {
      event.lat = hit.lat
      event.lng = hit.lng
    } else {
      event.confidence = Math.max(0.1, Math.round((event.confidence - 0.15) * 100) / 100)
    }
  }

  const result = await ingest(tools, event, await callerName(tools, userId))
  return {
    success: true,
    data: { ...result, extractedBy: event.extractedBy, located: event.lat != null, fallbackReason },
  }
}

const loadDemo: ActionHandler<Env> = async ({ userId, tools }) => {
  // Rules extraction keeps the scripted demo fast, free and identical every run.
  const name = await callerName(tools, userId)
  const outcomes: string[] = []
  const start = Date.now() - DEMO_REPORTS.length * 60_000
  for (const [i, r] of DEMO_REPORTS.entries()) {
    const event = extractWithRules({ ...r, reportedAt: new Date(start + i * 60_000).toISOString() })
    outcomes.push((await ingest(tools, event, `${name} (demo)`)).outcome)
  }
  return { success: true, data: { outcomes } }
}

async function loadIncident(tools: ActionTools, id: unknown) {
  if (typeof id !== 'string' || !id) return null
  const r = await tools.get<IncidentData>('incidents', id)
  return r.success && r.data.record ? r.data.record.data : null
}

const claimIncident: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const inc = await loadIncident(tools, params.id)
  if (!inc) return { success: false, error: 'Incident not found.' }
  if (inc.status === 'claimed' && inc.claimedBy !== userId) {
    return { success: false, error: `${inc.claimedByName} is already on this one.` }
  }
  const res = await tools.update('incidents', params.id as string, {
    status: 'claimed',
    claimedBy: userId,
    claimedByName: await callerName(tools, userId),
  })
  return res.success ? { success: true, data: { status: 'claimed' } } : res
}

const releaseIncident: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const inc = await loadIncident(tools, params.id)
  if (!inc) return { success: false, error: 'Incident not found.' }
  if (inc.claimedBy && inc.claimedBy !== userId) {
    return { success: false, error: 'Only the responder who claimed it can release it.' }
  }
  const res = await tools.update('incidents', params.id as string, { status: 'open', claimedBy: '', claimedByName: '' })
  return res.success ? { success: true, data: { status: 'open' } } : res
}

const resolveIncident: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const inc = await loadIncident(tools, params.id)
  if (!inc) return { success: false, error: 'Incident not found.' }
  if (inc.status === 'claimed' && inc.claimedBy !== userId) {
    return { success: false, error: 'Only the responder who claimed it can resolve it.' }
  }
  const res = await tools.update('incidents', params.id as string, { status: 'resolved' })
  return res.success ? { success: true, data: { status: 'resolved' } } : res
}

/** Wipe the board. Owner only, because it removes everyone's data. */
const resetBoard: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (userId !== env.OWNER_USER_ID) return { success: false, error: 'Only the app owner can reset the board.' }
  let deleted = 0
  for (const collection of ['reports', 'incidents']) {
    // deleteWhere refuses an empty filter by design, so drain page by page.
    for (;;) {
      const page = await tools.query(collection, { limit: 200 })
      if (!page.success || page.data.records.length === 0) break
      let removed = 0
      for (const r of page.data.records) {
        if ((await tools.remove(collection, r.recordId)).success) removed++
      }
      deleted += removed
      if (removed === 0) break
    }
  }
  return { success: true, data: { deleted } }
}

export const actions: Record<string, ActionHandler<Env>> = {
  submitReport,
  loadDemo,
  claimIncident,
  releaseIncident,
  resolveIncident,
  resetBoard,
}
