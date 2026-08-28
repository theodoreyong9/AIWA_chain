import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSignal, decodeSignal } from '../public/core/p2p-signaling.js';

test('a real offer round-trips exactly', () => {
  const blob = encodeSignal('offer', 'domain-abc', 'v=0\r\no=- 123 456 IN IP4 0.0.0.0\r\n...');
  const decoded = decodeSignal(blob);
  assert.equal(decoded.kind, 'offer');
  assert.equal(decoded.domainId, 'domain-abc');
  assert.equal(decoded.sdp, 'v=0\r\no=- 123 456 IN IP4 0.0.0.0\r\n...');
});

test('a real answer round-trips exactly', () => {
  const blob = encodeSignal('answer', 'domain-xyz', 'v=0\r\no=- 789 IN IP4 0.0.0.0\r\n...');
  const decoded = decodeSignal(blob);
  assert.equal(decoded.kind, 'answer');
});

test('SECURITY: a malformed blob is rejected without throwing an uncaught error', () => {
  assert.throws(() => decodeSignal('not real base64 at all'), /Not a real/);
  assert.throws(() => decodeSignal(btoa('{"not":"the right shape"}')), /Malformed|Not a real/);
});

test('SECURITY: a blob from a different format/app is rejected', () => {
  const foreign = btoa(encodeURIComponent(JSON.stringify({ format: 'something-else', kind: 'offer', domainId: 'x', sdp: 'y' })));
  assert.throws(() => decodeSignal(foreign), /Not a real/);
});

test('rejects an unknown kind', () => {
  const blob = btoa(encodeURIComponent(JSON.stringify({ format: 'aiwa-chain-signal-v1', kind: 'something-weird', domainId: 'x', sdp: 'y' })));
  assert.throws(() => decodeSignal(blob), /Malformed/);
});

test('handles real SDP content with special characters safely', () => {
  const sdp = 'a=candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host\r\nunicode: café ☕';
  const blob = encodeSignal('offer', 'd', sdp);
  assert.equal(decodeSignal(blob).sdp, sdp);
});
