// Phone approvals (owner/door.mjs): paired owner devices and the audit trail of refused phone decisions. A device is
// recorded by the sha256 of its secret only; the secret itself is shown once to the phone and never journaled.
export const OWNER_EVENTS = new Set(['OWNER_PAIRING_STARTED', 'OWNER_DEVICE_PAIRED', 'OWNER_DEVICE_RENEWED', 'OWNER_DEVICE_REVOKED', 'OWNER_DECISION_REFUSED']);

export function reduceOwner(state, event) {
  const { type, data: d, at } = event;
  if (!OWNER_EVENTS.has(type)) return;
  state.owner ??= { devices: {}, refusals: 0 };
  if (type === 'OWNER_DEVICE_PAIRED') state.owner.devices[d.deviceId] = { id: d.deviceId, label: d.label, credentialHash: d.credentialHash, pairingId: d.pairingId, pairedAt: at, expiresAt: d.expiresAt, revokedAt: null, revokedBy: null, revokeReason: null };
  // Renewal never revives a revoked device and never shortens a lifetime.
  if (type === 'OWNER_DEVICE_RENEWED') { const dev = state.owner.devices[d.deviceId]; if (dev && !dev.revokedAt && d.expiresAt > dev.expiresAt) dev.expiresAt = d.expiresAt; }
  if (type === 'OWNER_DEVICE_REVOKED' && state.owner.devices[d.deviceId]) Object.assign(state.owner.devices[d.deviceId], { revokedAt: at, revokedBy: d.by, revokeReason: d.reason ?? null });
  if (type === 'OWNER_DECISION_REFUSED') state.owner.refusals += 1;
}

// What the Command Center may show about a device: never its credential hash.
export const deviceView = d => ({ id: d.id, label: d.label, pairedAt: d.pairedAt, expiresAt: d.expiresAt, revokedAt: d.revokedAt, revokedBy: d.revokedBy, revokeReason: d.revokeReason });
