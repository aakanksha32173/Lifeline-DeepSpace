/**
 * Lightweight text vectors via feature hashing: tokens and adjacent-token
 * bigrams hashed into a fixed-size vector. No model download, deterministic,
 * and fast enough to run inside a Worker request for every candidate incident.
 */

const DIM = 384
const TOKEN = /[a-z0-9]+/g
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'with', 'near', 'there', 'we', 'our',
])

function stem(token: string): string {
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (token.length > suffix.length + 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length)
    }
  }
  return token
}

function features(text: string): string[] {
  const tokens = (text.toLowerCase().match(TOKEN) ?? []).filter((t) => !STOP.has(t)).map(stem)
  const bigrams = tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)
  return [...tokens, ...bigrams]
}

/** FNV-1a 32-bit: stable across runtimes, unlike anything keyed on object identity. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function embed(text: string): Float64Array {
  const vec = new Float64Array(DIM)
  for (const f of features(text)) vec[hash(f) % DIM] += 1
  return vec
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

export function textSimilarity(a: string, b: string): number {
  return cosine(embed(a), embed(b))
}
