// A real, live peer-to-peer connection — WebRTC's own native browser
// APIs, no external signaling server (this is a static site; there is
// nowhere for one to run), no external library. Bootstrapping still
// needs some real channel for the first offer/answer exchange — see
// p2p-signaling.js's own header for why that stays manual (or use
// trystero-connection.js's own automatic discovery instead, an
// additional transport, never a replacement of this one).
//
// The real synchronization behavior once connected — full-sync, live
// relay, real verification on receipt — lives in sync-protocol.js,
// shared with every other real transport this project supports. This
// file's own job is narrower: get one real, open channel between two
// real devices, however manually that has to happen here.
//
// HONEST LIMIT: this file cannot be exercised by this project's own
// Node-based test suite — RTCPeerConnection has no real equivalent
// there. Reviewed carefully, syntax-checked, structured to reuse
// already-tested logic wherever real logic exists to reuse — not the
// same claim as verified working end to end in two real browsers.

import { encodeSignal, decodeSignal } from '../core/p2p-signaling.js';
import { attachSyncProtocol } from './sync-protocol.js';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    function check() {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/**
 * One real, live connection to a single peer. `onStatusChange(status)`
 * fires with 'connecting' | 'open' | 'closed'. `onSyncEvent(kind,
 * detail)` fires with real, honest facts about what was actually
 * merged — never assumed.
 */
export class P2PConnection {
  constructor(dag, domainId, { onStatusChange, onSyncEvent } = {}) {
    this.dag = dag;
    this.domainId = domainId;
    this.onStatusChange = onStatusChange ?? (() => {});
    this.onSyncEvent = onSyncEvent ?? (() => {});
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.channel = null;
    this._detachSync = null;
  }

  // Wraps the raw RTCDataChannel (string-based, event-callback style)
  // into sync-protocol.js's own real, transport-agnostic interface —
  // real JS objects in, real JS objects out, never a raw string
  // leaking past this one, narrow adapter.
  _wireChannel(channel) {
    this.channel = channel;
    channel.onopen = () => {
      this.onStatusChange('open');
      const send = (message) => {
        if (channel.readyState === 'open') channel.send(JSON.stringify(message));
      };
      const onMessage = (cb) => {
        channel.onmessage = (e) => {
          let parsed;
          try {
            parsed = JSON.parse(e.data);
          } catch {
            return; // a malformed message — ignored, never trusted
          }
          cb(parsed);
        };
        return () => { channel.onmessage = null; };
      };
      this._detachSync = attachSyncProtocol(this.dag, { send, onMessage }, this.onSyncEvent);
    };
    channel.onclose = () => {
      this.onStatusChange('closed');
      if (this._detachSync) this._detachSync();
    };
  }

  /** The initiating side: creates a real data channel and a real, gathered offer. */
  async createOffer() {
    this.onStatusChange('connecting');
    const channel = this.pc.createDataChannel('aiwa-sync');
    this._wireChannel(channel);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(this.pc);
    return encodeSignal('offer', this.domainId, this.pc.localDescription.sdp);
  }

  /** The responding side: accepts a real offer blob, produces a real answer blob. */
  async acceptOfferAndCreateAnswer(offerBlob) {
    this.onStatusChange('connecting');
    const decoded = decodeSignal(offerBlob);
    if (decoded.kind !== 'offer') throw new Error('Expected an offer, not an answer.');
    this.pc.ondatachannel = (e) => this._wireChannel(e.channel);
    await this.pc.setRemoteDescription({ type: 'offer', sdp: decoded.sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(this.pc);
    return encodeSignal('answer', this.domainId, this.pc.localDescription.sdp);
  }

  /** The initiating side: completes the connection with the real answer blob. */
  async completeWithAnswer(answerBlob) {
    const decoded = decodeSignal(answerBlob);
    if (decoded.kind !== 'answer') throw new Error('Expected an answer, not an offer.');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: decoded.sdp });
  }

  close() {
    if (this._detachSync) this._detachSync();
    if (this.channel) this.channel.close();
    this.pc.close();
    this.onStatusChange('closed');
  }
}
