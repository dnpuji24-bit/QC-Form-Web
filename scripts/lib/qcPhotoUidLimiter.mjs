/**
 * Per-instance fixed window rate limiter. An additional shared ingress-level
 * rate limiter is required for scaled deployments; this is defense in depth.
 */
export function createUidLimiter({ maxRequests = 30, windowMs = 60_000, maxEntries = 5000, now = () => Date.now() } = {}) {
  const hits = new Map()
  return function allow(uid) {
    if (typeof uid !== 'string' || !uid || uid.length > 160) return false
    const timestamp = now()
    const previous = hits.get(uid)
    const current = !previous || timestamp >= previous.resetAt
      ? { count: 0, resetAt: timestamp + windowMs }
      : previous
    if (current.count >= maxRequests) return false
    current.count++
    hits.delete(uid)
    hits.set(uid, current)
    if (hits.size > maxEntries) hits.delete(hits.keys().next().value)
    return true
  }
}
