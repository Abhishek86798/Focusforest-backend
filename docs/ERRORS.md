# FocusForest — Error Handling Reference

This document defines the **single, consistent error format** for every route in this backend.  
AI-generated routes must follow this format exactly. No exceptions.

---

## Standard Error Envelope

Every error response — regardless of HTTP status — always has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description of what went wrong.",
    "details": {}
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | Machine-readable error code (screaming snake case). Always present. |
| `message` | `string` | Human-readable message safe to display in the UI. Always present. |
| `details` | `object?` | Optional. Extra context (e.g. field-level validation errors). Omit if empty. |

> **RULE:** Never return a bare `{ "message": "..." }` or `{ "error": "message string" }`.  
> Always use the nested `{ "error": { "code", "message" } }` envelope above.

---

## HTTP Status Code Usage

| Status | When to Use |
|--------|-------------|
| `200` | Success |
| `201` | Resource created |
| `400` | Client sent bad data (validation errors, malformed JSON) |
| `401` | Not authenticated (missing or invalid JWT) |
| `403` | Authenticated but not authorised (not admin, not a member, group full) |
| `404` | Resource does not exist |
| `409` | Conflict (duplicate `clientSessionId`, email already exists, already a member) |
| `422` | Business logic violation (e.g. trying to join a group that has 5 members) |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error — log it, never expose internal details |

---

## Error Codes

### Auth Errors

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | `401` | No JWT cookie present or JWT is expired/invalid |
| `INVALID_CREDENTIALS` | `401` | Email/password login failed |
| `FORBIDDEN` | `403` | User is authenticated but lacks permission for this action |

### Validation Errors

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | `400` | Zod validation failed. Include field errors in `details`. |
| `INVALID_INVITE_CODE` | `400` | Invite code format is invalid |

### Resource Errors

| Code | Status | Description |
|------|--------|-------------|
| `NOT_FOUND` | `404` | The requested resource does not exist |
| `GROUP_NOT_FOUND` | `404` | Group with given ID not found |
| `USER_NOT_FOUND` | `404` | User with given ID not found |

### Conflict Errors

| Code | Status | Description |
|------|--------|-------------|
| `DUPLICATE_SESSION` | `409` | `clientSessionId` has already been processed |
| `EMAIL_TAKEN` | `409` | Email is already registered |
| `ALREADY_MEMBER` | `409` | User is already a member of this group |

### Business Logic Errors

| Code | Status | Description |
|------|--------|-------------|
| `GROUP_FULL` | `422` | Group already has 5 members — cannot join |
| `INVITE_DISABLED` | `422` | Group is full so invite code is inactive |
| `SELF_REMOVE_FORBIDDEN` | `422` | Admin cannot remove themselves (use leave endpoint instead) |

### Server Errors

| Code | Status | Description |
|------|--------|-------------|
| `INTERNAL_ERROR` | `500` | Unexpected server error. Log the real error; return a generic message. |

---

## Example Error Responses

### Validation error (400)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid.",
    "details": {
      "focusMinutes": "Expected number, received string",
      "variant": "Invalid enum value. Expected 'sprint' | 'classic' | 'deep_work' | 'flow' | 'custom'"
    }
  }
}
```

### Unauthorized (401)
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please log in."
  }
}
```

### Group full (422)
```json
{
  "error": {
    "code": "GROUP_FULL",
    "message": "This group already has 5 members and is not accepting new members."
  }
}
```

### Duplicate session (409)
```json
{
  "error": {
    "code": "DUPLICATE_SESSION",
    "message": "This session has already been recorded."
  }
}
```

### Internal server error (500)
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong on our end. Please try again."
  }
}
```
> Log the real error to the server console. Never include stack traces or internal messages in the response.

---

## TypeScript Error Helper

Use this helper in every route. Never construct error responses manually.

```typescript
// src/lib/apiError.ts

export type ErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_INVITE_CODE"
  | "NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "DUPLICATE_SESSION"
  | "EMAIL_TAKEN"
  | "ALREADY_MEMBER"
  | "GROUP_FULL"
  | "INVITE_DISABLED"
  | "SELF_REMOVE_FORBIDDEN"
  | "INTERNAL_ERROR";

export function apiError(
  code: ErrorCode,
  message: string,
  details?: Record<string, string>
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
```

**Usage in routes:**
```typescript
import { apiError } from "../lib/apiError";
import { Response } from "express";

// 404
res.status(404).json(apiError("NOT_FOUND", "Group not found."));

// 422
res.status(422).json(apiError("GROUP_FULL", "This group is full."));

// 400 with validation details
res.status(400).json(
  apiError("VALIDATION_ERROR", "Request body is invalid.", {
    focusMinutes: "Must be a positive integer",
  })
);
```

---

## Zod Validation Middleware

Wrap every POST route with this middleware to automatically format Zod errors:

```typescript
// src/middleware/validate.ts
import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { apiError } from "../lib/apiError";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        details[e.path.join(".")] = e.message;
      });
      res
        .status(400)
        .json(apiError("VALIDATION_ERROR", "Request body is invalid.", details));
      return;
    }
    req.body = result.data;
    next();
  };
}
```
