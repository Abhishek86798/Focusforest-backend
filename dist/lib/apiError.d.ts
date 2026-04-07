export type ErrorCode = "UNAUTHORIZED" | "INVALID_CREDENTIALS" | "FORBIDDEN" | "VALIDATION_ERROR" | "INVALID_INVITE_CODE" | "NOT_FOUND" | "GROUP_NOT_FOUND" | "USER_NOT_FOUND" | "DUPLICATE_SESSION" | "EMAIL_TAKEN" | "ALREADY_MEMBER" | "GROUP_FULL" | "INVITE_DISABLED" | "SELF_REMOVE_FORBIDDEN" | "SESSION_NOT_FOUND" | "SESSION_NOT_ACTIVE" | "SESSION_TOO_SHORT" | "INVALID_SESSION" | "NOT_GROUP_MEMBER" | "NOT_GROUP_ADMIN" | "INTERNAL_ERROR";
export declare function apiError(code: ErrorCode, message: string, details?: Record<string, string>): {
    error: {
        details?: Record<string, string> | undefined;
        code: ErrorCode;
        message: string;
    };
};
//# sourceMappingURL=apiError.d.ts.map