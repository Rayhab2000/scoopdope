# ADR-003: Use Socket.IO for real-time notifications instead of polling

## Status

Accepted

## Context

The platform needs to deliver timely updates for comments, course events, and learner notifications. We considered polling the backend or using a streaming protocol for live delivery.

Key requirements:
- Near-real-time delivery of notifications
- Low server overhead for many connected clients
- Compatibility with a NestJS backend and browser clients
- A simple fallback path for reconnects

## Decision

We use Socket.IO for real-time notification delivery and connection management, rather than relying on periodic polling from the client.

## Alternatives Considered

- Polling the REST API at regular intervals
- Server-sent events (SSE) for one-way updates
- A full custom WebSocket implementation

## Consequences

**Positive:**
- Notifications appear quickly without client polling overhead
- Socket.IO provides room-based messaging and reconnect support
- The same transport can support both browser and mobile clients over time

**Negative:**
- WebSocket connections add operational complexity compared with stateless REST calls
- Reconnect and auth handling need careful implementation
- The transport must be monitored to avoid connection storms during incidents

**Neutral:**
- REST endpoints remain the source of truth for CRUD operations
- The real-time layer is additive rather than a replacement for the API layer

## References

- [Socket.IO Documentation](https://socket.io/docs/v4)
- [MDN WebSockets](https://developer.mozilla.org/docs/Web/API/WebSockets_API)
- [scoopdope notifications guide](../../docs/notifications-guide.md)
