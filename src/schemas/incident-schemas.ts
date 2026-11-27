/**
 * Incidents and the reports fused into them.
 *
 * Every signed-in member can READ both collections live, but nobody writes
 * them from the browser: all writes go through the server actions in
 * src/actions/, which run extraction, fusion and scoring and so keep
 * incidents consistent with their reports. That makes the worker the single
 * place where pipeline rules are enforced.
 */

import type { CollectionSchema } from 'deepspace/schema'

const readOnlyForMembers = {
  viewer: { read: false, create: false, update: false, delete: false },
  member: { read: true, create: false, update: false, delete: false },
  admin: { read: true, create: false, update: false, delete: false },
} as const

const json = { kind: 'json' } as const

export const incidentsSchema: CollectionSchema = {
  name: 'incidents',
  columns: [
    { name: 'eventType', storage: 'text', interpretation: 'plain', required: true },
    { name: 'summary', storage: 'text', interpretation: 'plain', maxLength: 2000 },
    { name: 'locationText', storage: 'text', interpretation: 'plain' },
    { name: 'lat', storage: 'number', interpretation: 'plain' },
    { name: 'lng', storage: 'number', interpretation: 'plain' },
    { name: 'priority', storage: 'number', interpretation: 'plain' },
    { name: 'reasons', storage: 'text', interpretation: json },
    { name: 'recommendedAction', storage: 'text', interpretation: 'plain' },
    { name: 'reportsCount', storage: 'number', interpretation: 'plain' },
    { name: 'peopleAffected', storage: 'number', interpretation: 'plain' },
    { name: 'needs', storage: 'text', interpretation: json },
    { name: 'sources', storage: 'text', interpretation: json },
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'claimedBy', storage: 'text', interpretation: 'plain' },
    { name: 'claimedByName', storage: 'text', interpretation: 'plain' },
    { name: 'lastReportAt', storage: 'text', interpretation: 'plain' },
  ],
  permissions: { ...readOnlyForMembers },
}

export const reportsSchema: CollectionSchema = {
  name: 'reports',
  columns: [
    { name: 'text', storage: 'text', interpretation: 'plain', required: true, maxLength: 2000 },
    { name: 'source', storage: 'text', interpretation: 'plain' },
    { name: 'eventType', storage: 'text', interpretation: 'plain' },
    { name: 'urgency', storage: 'number', interpretation: 'plain' },
    { name: 'needs', storage: 'text', interpretation: json },
    { name: 'peopleAffected', storage: 'number', interpretation: 'plain' },
    { name: 'locationText', storage: 'text', interpretation: 'plain' },
    { name: 'lat', storage: 'number', interpretation: 'plain' },
    { name: 'lng', storage: 'number', interpretation: 'plain' },
    { name: 'reportedAt', storage: 'text', interpretation: 'plain' },
    { name: 'confidence', storage: 'number', interpretation: 'plain' },
    { name: 'extractedBy', storage: 'text', interpretation: 'plain' },
    { name: 'incidentId', storage: 'text', interpretation: 'plain' },
    /** 'merged' | 'created' | 'quarantined' */
    { name: 'outcome', storage: 'text', interpretation: 'plain' },
    { name: 'fusion', storage: 'text', interpretation: json },
    { name: 'submittedByName', storage: 'text', interpretation: 'plain' },
  ],
  permissions: { ...readOnlyForMembers },
}
