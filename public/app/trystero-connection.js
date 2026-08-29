// A real, additional transport — automatic peer discovery via
// Trystero (https://github.com/dmotz/trystero), using the Nostr
// network's real, decentralized relays by default. Never a
// replacement for p2p-connection.js's own manual WebRTC handshake —
// both use the identical, shared synchronization protocol
// (sync-protocol.js) once a real channel to a real peer exists; this
// file's own job is narrower: find that peer automatically, without
// any manual copy-paste, at the real cost of a real, third-party
// relay seeing that this device is looking for peers in this real
// room (never the actual data — see the real, explicit guarantee in
// Trystero's own documentation: "beyond peer discovery, your app's
// data never touches the strategy medium").
//
// A room is identified by (appId, roomId). Using this domain's own
// real domain id as part of the room id means a specific, deliberate
// reconnection (I know who I'm looking for) is possible without any
// manual exchange at all — join the same room as someone you already
// know the domain id of, and Trystero's own real matching finds them.
//
// HONEST LIMIT: like p2p-connection.js, this cannot be exercised by
// this project's own Node-based test suite — real WebRTC and a real
// Nostr relay round-trip have no real equivalent there.

import { attachSyncProtocol } from './sync-protocol.js';

const APP_ID = 'aiwa-chain-v1';

/**
 * One real room, matching zero or more real peers automatically via
 * Trystero. `onPeerConnected(peerId)` / `onPeerDisconnected(peerId)`
 * report real join/leave events. `onSyncEvent(peerId, kind, detail)`
 * reports real, honest facts about what was actually merged, per
 * real peer, never assumed.
 */
export class TrysteroConnection {
  constructor(dag, roomId, { onPeerConnected, onPeerDisconnected, onSyncEvent } = {}) {
    this.dag = dag;
    this.roomId = roomId;
    this.onPeerConnected = onPeerConnected ?? (() => {});
    this.onPeerDisconnected = onPeerDisconnected ?? (() => {});
    this.onSyncEvent = onSyncEvent ?? (() => {});
    this.room = null;
    this._syncAction = null;
    this._detachByPeer = new Map();
  }

  /** Joins the real room and starts real, automatic peer matching. */
  async join() {
    const { joinRoom } = await import('trystero');
    this.room = joinRoom({ appId: APP_ID }, this.roomId);
    this._syncAction = this.room.makeAction('aiwa-sync');

    // A real, single dispatcher — Trystero's own `onMessage` is one
    // shared property for the whole action, not a per-peer
    // registration. An earlier version set this once per joining
    // peer, silently overwriting the previous peer's own handler the
    // moment a second peer joined — a real bug, found and closed here
    // before ever being relied on. Real per-peer callbacks are
    // tracked separately and dispatched to by real peer id.
    const perPeerCallbacks = new Map();
    this._syncAction.onMessage = (data, meta) => {
      const cb = perPeerCallbacks.get(meta.peerId);
      if (cb) cb(data);
    };

    this.room.onPeerJoin((peerId) => {
      const send = (message) => this._syncAction.send(message, { target: peerId });
      const onMessage = (cb) => {
        perPeerCallbacks.set(peerId, cb);
        return () => { perPeerCallbacks.delete(peerId); };
      };
      const detach = attachSyncProtocol(this.dag, { send, onMessage }, (kind, result) => this.onSyncEvent(peerId, kind, result));
      this._detachByPeer.set(peerId, detach);
      this.onPeerConnected(peerId);
    });

    this.room.onPeerLeave((peerId) => {
      const detach = this._detachByPeer.get(peerId);
      if (detach) detach();
      this._detachByPeer.delete(peerId);
      perPeerCallbacks.delete(peerId);
      this.onPeerDisconnected(peerId);
    });
  }

  /** Real, currently-connected peer ids. */
  peerIds() {
    return [...this._detachByPeer.keys()];
  }

  leave() {
    for (const detach of this._detachByPeer.values()) detach();
    this._detachByPeer.clear();
    if (this.room) this.room.leave();
    this.room = null;
  }
}
