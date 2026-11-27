/** Calls a server action in src/actions/ as the signed-in user. */

import { getAuthToken } from 'deepspace'

export type ActionResponse<T> = { success: true; data: T } | { success: false; error: string }

export async function callAction<T = unknown>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<ActionResponse<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'Sign in first.' }
  try {
    const res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as ActionResponse<T> | { error?: string } | null
    if (!res.ok || !body || !('success' in body)) {
      return { success: false, error: (body as { error?: string } | null)?.error ?? `Request failed (${res.status})` }
    }
    return body
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
