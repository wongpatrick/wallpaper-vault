/**
 * @file
 * Defines domain enums mirroring the backend's core enums.
 */
export const TaskStatus = {
    ACCEPTED: "accepted",
    PROCESSING: "processing",
    COMPLETED: "completed",
    ERROR: "error",
} as const;

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

export const AuditIssueType = {
    GHOST: "ghost",
    ORPHAN: "orphan",
} as const;

export type AuditIssueType = typeof AuditIssueType[keyof typeof AuditIssueType];

export const AuditIssueStatus = {
    PENDING: "pending",
    RESOLVED: "resolved",
    IGNORED: "ignored",
} as const;

export type AuditIssueStatus = typeof AuditIssueStatus[keyof typeof AuditIssueStatus];

export const ImageRating = {
    SAFE: "safe",
    QUESTIONABLE: "questionable",
    EXPLICIT: "explicit",
} as const;

export type ImageRating = typeof ImageRating[keyof typeof ImageRating];

export const BulkOperationMode = {
    REPLACE: "replace",
    APPEND: "append",
    REMOVE: "remove",
} as const;

export type BulkOperationMode = typeof BulkOperationMode[keyof typeof BulkOperationMode];

export const CREATOR_TYPES = ['Artist', 'AI Generated', 'Studio', 'Photography', 'Cosplayer', 'Model', 'Unknown'] as const;
