/**
 * Structured logging. One JSON object per line in production (what Vercel,
 * Fly and any log drain index), a readable line in development. No
 * server-only import so the proxy (edge-compatible) can use it too.
 *
 *   log.info("job.start", { jobId, tenantId })
 *   → {"ts":"2026-10-24T09:00:00.000Z","level":"info","msg":"job.start","jobId":"...","tenantId":"..."}
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

function format(): "json" | "pretty" {
  const forced = process.env.LOG_FORMAT;
  if (forced === "json" || forced === "pretty") return forced;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

function emit(level: LogLevel, msg: string, fields?: LogFields) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(fields ?? {}) };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (format() === "json") {
    sink(JSON.stringify(entry, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v)));
    return;
  }
  const extra = fields && Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
  sink(`[${level}] ${msg}${extra}`);
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

/** Header carrying the per-request id from the proxy to handlers and logs. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Accept a platform-provided id (Vercel, Fly, a CDN) when it looks sane; otherwise mint one. */
export function resolveRequestId(incoming: string | null | undefined): string {
  if (incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}
