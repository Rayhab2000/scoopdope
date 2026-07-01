# Access Control Flow

This document summarizes the evaluation order used by the backend access-control service for course and content access.

## Evaluation Precedence

The service treats access checks as a strict precedence chain:

1. Explicit revoke
2. Time-limited grant
3. Subscription tier
4. Default deny

A user is denied immediately when the first matching denial signal appears. The service does not fall back to a later, less specific grant once a higher-precedence condition has blocked access.

## Flow Diagram

```text
Start
  |
  v
Load access record for (courseId, userId)
  |
  +--> No record or record inactive?
  |       |
  |       +--> Deny: explicit revoke / no access granted
  |
  +--> Time-limited grant expired?
  |       |
  |       +--> Deny: access pass expired
  |
  +--> Subscription tier valid?
          |
          +--> Allow access
          |
          +--> Deny: default deny
```

## Notes

- Explicit revocation is represented by an inactive access record and takes precedence over any other grant state.
- Time-limited grants are checked before subscription-tier access is treated as valid.
- Content access uses the same precedence order as general course access, with additional logging for content-specific denials.
- The service logs each denial branch separately so maintainers can see why a request was blocked.
