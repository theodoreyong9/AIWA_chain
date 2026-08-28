// WebRTC needs some real channel to exchange an initial offer/answer
// before any live connection exists. With no signaling server (this
// is a static site), that exchange happens by hand: one real blob of
// text, copied through whatever channel two people already share.
//
// Trickle ICE is deliberately not used: candidates are gathered fully
// before the offer/answer blob is produced, so exactly one blob needs
// to move in each direction.

const FORMAT = 'aiwa-chain-signal-v1';

export function encodeSignal(kind, domainId, sdp) {
  const payload = { format: FORMAT, kind, domainId, sdp, createdAt: Date.now() };
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

export function decodeSignal(blob) {
  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(atob(blob.trim())));
  } catch {
    throw new Error('Not a real, recognized connection blob.');
  }
  if (payload.format !== FORMAT) throw new Error('Not a real, recognized connection blob.');
  if (payload.kind !== 'offer' && payload.kind !== 'answer') throw new Error('Malformed connection blob.');
  if (typeof payload.sdp !== 'string' || typeof payload.domainId !== 'string') throw new Error('Malformed connection blob.');
  return payload;
}
