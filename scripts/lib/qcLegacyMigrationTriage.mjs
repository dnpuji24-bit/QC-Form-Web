/**
 * Pure QC legacy migration triage. No persistence methods or backend access.
 * Even uniquely matched Auth identities require independent provenance approval.
 */
export function classifyLegacyQc(record, candidates, authVerification) {
  if (!record || typeof record !== 'object') return { status: 'BLOCKED', reason: 'INVALID_RECORD' }
  if (typeof record.ownerUid === 'string' && record.ownerUid.trim()) return { status: 'ALREADY_MAPPED', reason: 'EXISTING_OWNER_UID' }
  const username = typeof record.inputtedBy === 'string' ? record.inputtedBy.trim().toLowerCase() : ''
  if (!username) return { status: 'REVIEW', reason: 'MISSING_USERNAME' }
  if (!Array.isArray(candidates) || !candidates.length) return { status: 'REVIEW', reason: 'NO_USERNAME_MATCH' }
  if (candidates.length !== 1) return { status: 'REVIEW', reason: 'AMBIGUOUS_USERNAME' }
  const candidate = candidates[0]
  if (!candidate || candidate.active !== true || String(candidate.status || '').toUpperCase() !== 'APPROVED') {
    return { status: 'REVIEW', reason: 'ACCOUNT_NOT_APPROVED_ACTIVE' }
  }
  if (!authVerification || authVerification.state !== 'verified' || authVerification.uid !== candidate.uid) {
    return { status: 'REVIEW', reason: 'FIREBASE_AUTH_NOT_VERIFIED' }
  }
  if (typeof record.clientRevision !== 'string' || !record.clientRevision.trim()) {
    return { status: 'REVIEW', reason: 'REVISION_MISSING' }
  }
  // Important: even strong identity matching does NOT prove who actually
  // entered the historical QC. No automated ownerUid assignment.
  return { status: 'MANUAL_PROVENANCE_REQUIRED', reason: 'HISTORICAL_AUTHORSHIP_UNVERIFIED' }
}

export function summarizeLegacyMigration(records) {
  const summary = { total: 0, ALREADY_MAPPED: 0, REVIEW: 0, BLOCKED: 0,
    MANUAL_PROVENANCE_REQUIRED: 0, reasons: {} }
  for (const result of records) {
    summary.total++
    if (!Object.hasOwn(summary, result.status)) throw new Error('Unknown migration classification')
    summary[result.status]++
    summary.reasons[result.reason] = (summary.reasons[result.reason] || 0) + 1
  }
  return summary
}
