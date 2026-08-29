// The real synchronization protocol — full-sync on connect, live
// relay of new events, real verification via mergeEvents() on
// receipt — is entirely independent of HOW two real devices came to
// have an open channel between them. Manual WebRTC handshake,
// automatic Nostr-based discovery, a future real DTN link: all of
// them just need to provide a real way to send and receive real
// messages. This file is that one, shared, transport-agnostic
// protocol, attached once per real open channel, reused by every
// real transport this project supports.

import { mergeEvents } from './reconciliation.js';

/**
 * @param {import('../core/event-dag.js').EventDag} dag
 * @param {{ send: (message: object) => void, onMessage: (cb: (message: object) => void) => (() => void) }} channel
 *   A real, transport-agnostic channel — `send` takes a real JS
 *   object (never a raw string; each transport's own adapter handles
 *   its own real serialization), `onMessage` registers a callback and
 *   returns a real unsubscribe function.
 * @param {(kind: 'full-sync' | 'new-event', result: { imported: number, alreadyPresent: number, importedDomains: Set<string> }) => void} onSyncEvent
 * @returns {() => void} a real, single function that detaches this protocol from the dag and the channel — call on disconnect.
 */
export function attachSyncProtocol(dag, channel, onSyncEvent) {
  channel.send({ type: 'full-sync', events: dag.topoOrder() });

  const unsubscribeDag = dag.subscribe((event) => {
    channel.send({ type: 'new-event', event });
  });

  const unsubscribeChannel = channel.onMessage(async (message) => {
    if (message?.type === 'full-sync' && Array.isArray(message.events)) {
      const result = await mergeEvents(dag, message.events);
      onSyncEvent('full-sync', result);
    } else if (message?.type === 'new-event' && message.event) {
      const result = await mergeEvents(dag, [message.event]);
      onSyncEvent('new-event', result);
    }
    // A real, unrecognized message shape — ignored, never trusted, never thrown on.
  });

  return () => {
    unsubscribeDag();
    unsubscribeChannel();
  };
}
