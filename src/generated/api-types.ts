/* eslint-disable */
/**
 * Auto-generated from the delivery API OpenAPI spec.
 * Do not edit by hand — run `bun run generate-types` to regenerate.
 */
export interface paths {
    "/api/catalog/{course}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    release?: string;
                };
                header?: never;
                path: {
                    course: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Course catalog with enriched module states */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            releaseId?: string;
                            releaseManifestHash?: string;
                            course: string;
                            modules: {
                                module: number;
                                title: string;
                                releaseAt: string;
                                /** @enum {string|null} */
                                stateOverride: "locked" | "unlocked" | null;
                                /** @enum {string} */
                                effectiveState: "locked" | "unlocked";
                            }[];
                            lessons: {
                                lessonId: string;
                                module: number;
                                lesson: number;
                                title: string;
                                summary: string;
                                bundlePath: string;
                                contentHash?: string;
                                availableLanguages?: string[];
                            }[];
                        };
                    };
                };
                /** @description Course access denied */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
                /** @description Course not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lessons/{course}/{lessonId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    release?: string;
                    tool?: string;
                    lang?: string;
                };
                header?: never;
                path: {
                    course: string;
                    lessonId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Lesson bundle with all artifacts */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            course?: string;
                            releaseId?: string;
                            releaseManifestHash?: string;
                            lessonId: string;
                            module: number;
                            lesson: number;
                            title: string;
                            summary: string;
                            skills: {
                                name: string;
                                files: {
                                    path: string;
                                    content: string;
                                    executable?: boolean;
                                }[];
                                universalContent?: string;
                                contentHash?: string;
                            }[];
                            prompts: {
                                name: string;
                                content: string;
                                universalContent?: string;
                                contentHash?: string;
                            }[];
                            rules: {
                                name: string;
                                content: string;
                                universalContent?: string;
                                contentHash?: string;
                            }[];
                            configs: {
                                name: string;
                                content: string;
                                universalContent?: string;
                                contentHash?: string;
                            }[];
                        };
                    };
                };
                /** @description Course access denied or module locked */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            module?: number;
                            releaseAt?: string;
                        };
                    };
                };
                /** @description Course or lesson not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/artifacts/{course}/{lessonId}/{type}/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    release?: string;
                    tool?: string;
                    lang?: string;
                };
                header?: never;
                path: {
                    course: string;
                    lessonId: string;
                    type: "skills" | "prompts" | "rules" | "configs";
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Individual artifact with content */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            course?: string;
                            releaseId?: string;
                            releaseManifestHash?: string;
                            /** @enum {string} */
                            type: "skills";
                            name: string;
                            files: {
                                path: string;
                                content: string;
                                executable?: boolean;
                            }[];
                            universalContent?: string;
                        } | {
                            course?: string;
                            releaseId?: string;
                            releaseManifestHash?: string;
                            /** @enum {string} */
                            type: "prompts" | "rules" | "configs";
                            name: string;
                            content: string;
                        };
                    };
                };
                /** @description Course access denied or module locked */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            module?: number;
                            releaseAt?: string;
                        };
                    };
                };
                /** @description Course, lesson, or artifact not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lessons/{course}/{lessonId}/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    release?: string;
                    type?: "skills" | "prompts" | "rules" | "configs";
                    name?: string;
                    tool?: string;
                    lang?: string;
                };
                header?: never;
                path: {
                    course: string;
                    lessonId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description ZIP bundle or raw artifact file */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/zip": unknown;
                        "text/markdown": string;
                    };
                };
                /** @description Course access denied or module locked */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            module?: number;
                            releaseAt?: string;
                        };
                    };
                };
                /** @description Course, lesson, or artifact not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/me/courses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Live course grants and highest available edition */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            courses: {
                                id: string;
                                slug: string;
                                title: string;
                                edition: number;
                                available: boolean;
                            }[];
                            defaultCourse: string | null;
                        };
                    };
                };
                /** @description Membership, catalog or module-state lookup failed */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/courses/{course}/migration-map": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    release?: string;
                };
                header?: never;
                path: {
                    course: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Signed unavailable mapping envelope; grants no access */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {number} */
                            schemaVersion: 1;
                            /** @enum {string} */
                            sourceCourse: "10xdevs3";
                            /** @enum {string} */
                            targetCourse: "10xdevs4";
                            releaseId: string;
                            /** @enum {string} */
                            mappingStatus: "unavailable";
                            entries: Record<string, never>[];
                            /** @enum {string} */
                            course: "10xdevs4";
                            releaseManifestHash: string;
                            mapHash: string;
                        };
                    };
                };
                /** @description Course denied or module locked */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
                /** @description Release unavailable */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/modules/{course}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    release?: string;
                };
                header?: never;
                path: {
                    course: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of modules with enriched states */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            releaseId?: string;
                            releaseManifestHash?: string;
                            course: string;
                            modules: {
                                module: number;
                                title: string;
                                releaseAt: string;
                                /** @enum {string|null} */
                                stateOverride: "locked" | "unlocked" | null;
                                /** @enum {string} */
                                effectiveState: "locked" | "unlocked";
                            }[];
                        };
                    };
                };
                /** @description Course access denied */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
                /** @description Course not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/modules/{course}/{module}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    release?: string;
                };
                header?: never;
                path: {
                    course: string;
                    module: number | null;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Single module with its lessons */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            module: number;
                            title: string;
                            releaseAt: string;
                            /** @enum {string|null} */
                            stateOverride: "locked" | "unlocked" | null;
                            /** @enum {string} */
                            effectiveState: "locked" | "unlocked";
                            course?: string;
                            releaseId?: string;
                            releaseManifestHash?: string;
                            lessons: {
                                lessonId: string;
                                lesson: number;
                                title: string;
                                summary: string;
                                /**
                                 * @default [
                                 *       "en"
                                 *     ]
                                 */
                                availableLanguages: string[];
                            }[];
                        };
                    };
                };
                /** @description Course access denied */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
                /** @description Course or module not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/modules/{course}/{module}/state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    course: string;
                    module: number | null;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string|null} */
                        stateOverride: "locked" | "unlocked" | null;
                    };
                };
            };
            responses: {
                /** @description State override updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok: boolean;
                            key: string;
                            value: string | null;
                        };
                    };
                };
                /** @description Admin access required */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
                /** @description Course not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                    };
                };
            };
            responses: {
                /** @description Magic link sent — poll /auth/verify with session_id */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            session_id: string;
                            /** @enum {string} */
                            message: "check_your_inbox";
                        };
                    };
                };
                /** @description No active course membership */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        };
                    };
                };
                /** @description Rate limited */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        };
                    };
                };
                /** @description Email delivery failed */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    token: string;
                    session: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success or error HTML page */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html": string;
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    session: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Session verified — tokens delivered */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            token: string;
                            refresh_token: string;
                            expires_at: string;
                        };
                    };
                };
                /** @description Still waiting for magic link click */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "pending";
                        };
                    };
                };
                /** @description Session not found or expired */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        refresh_token: string;
                    };
                };
            };
            responses: {
                /** @description New JWT and refresh token */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            token: string;
                            refresh_token: string;
                            expires_at: string;
                        };
                    };
                };
                /** @description Invalid or revoked refresh token */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        };
                    };
                };
                /** @description Membership revoked */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/circle/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        client?: {
                            hostname?: string;
                            os?: string;
                        };
                    };
                };
            };
            responses: {
                /** @description Circle message sent — poll /auth/circle/poll with device_code */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            device_code: string;
                            expires_in: number;
                            interval: number;
                            /** @enum {string} */
                            delivery: "sent" | "unknown";
                        };
                    };
                };
                /** @description No active course membership */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
                /** @description Cooldown or budget exhausted */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
                /** @description Circle refused the message */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
                /** @description Circle login switched off or misconfigured */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/circle/poll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        device_code: string;
                    };
                };
            };
            responses: {
                /** @description Login approved and redeemed — tokens delivered exactly once */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            token: string;
                            refresh_token: string;
                            expires_at: string;
                        };
                    };
                };
                /** @description Waiting for approval */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "pending" | "dispatched";
                        };
                    };
                };
                /** @description Polling faster than the advertised interval */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
                /** @description Login denied — no active course membership */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
                /** @description Login expired, unknown or already redeemed */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/circle/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Approval page — reads #bearer from the fragment and POSTs it */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html": string;
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        bearer: string;
                    };
                };
            };
            responses: {
                /** @description Terminal approved — the CLI receives tokens on its next poll */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            approved: true;
                            requested_at: string;
                            client: {
                                hostname?: string;
                                os?: string;
                            };
                        };
                    };
                };
                /** @description Cross-origin request or no active course membership */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
                /** @description Link expired, unknown or already used */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
                /** @description Admission budget exhausted */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                            retry_after_s?: number;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
