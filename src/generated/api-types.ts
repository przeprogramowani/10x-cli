/* eslint-disable */
/**
 * Auto-generated from https://10x-toolkit-api.przeprogramowani.workers.dev/openapi.json
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
                query?: never;
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
                            }[];
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
                query?: never;
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
                            lessonId: string;
                            module: number;
                            lesson: number;
                            title: string;
                            summary: string;
                            skills: {
                                name: string;
                                content: string;
                            }[];
                            prompts: {
                                name: string;
                                content: string;
                            }[];
                            rules: {
                                name: string;
                                content: string;
                            }[];
                            configs: {
                                name: string;
                                content: string;
                            }[];
                        };
                    };
                };
                /** @description Module is locked */
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
    "/api/modules/{course}": {
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
                query?: never;
                header?: never;
                path: {
                    course: string;
                    module: number;
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
                            lessons: {
                                lessonId: string;
                                lesson: number;
                                title: string;
                                summary: string;
                            }[];
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
                    module: number;
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
