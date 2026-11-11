import assert from 'node:assert/strict'
import { createUidLimiter } from './lib/qcPhotoUidLimiter.mjs'
let clock = 1000
const limiter = createUidLimiter({ maxRequests: 2, windowMs: 10000, maxEntries: 3, now: () => clock })
assert.equal(limiter('userA'), true)
assert.equal(limiter('userA'), true)
assert.equal(limiter('userA'), false)
assert.equal(limiter('userB'), true)
assert.equal(limiter(''), false)
clock += 10001
assert.equal(limiter('userA'), true)
console.log('SUCCESS: 6 signed-photo rate-limit checks passed (pure local; no network).')
