/**
 * CORS origins are needed in two places — the HTTP server in main.ts and the
 * Socket.IO gateway — and they drifted apart: main.ts split FRONTEND_URL on
 * commas while the gateway used the raw string, so any multi-origin deployment
 * had working REST calls and a permanently rejected websocket handshake.
 */
export function allowedOrigins(): string[] {
  return (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
