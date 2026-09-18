/**
 * MCP agent feed — lets a member connect Wick signals to their OWN AI
 * assistant (Claude, ChatGPT, Cursor, …). If that assistant is also
 * connected to the member's Robinhood Agentic account, the member can tell
 * it to act on a signal; orders go through Robinhood, never through us.
 * See docs/wick-agent-feed-plan.md and services/mcpSignals.ts.
 *
 * Deliberately small: a hand-rolled, stateless MCP "Streamable HTTP"
 * endpoint (JSON responses, no SSE, no sessions) — tools only, all
 * read-only. No new npm dependency, so the frozen-lockfile Docker build is
 * untouched. If this grows (prompts, resources, streaming), swap in
 * @modelcontextprotocol/sdk.
 *
 * Auth: Clerk OAuth access tokens (the assistant runs the OAuth flow
 * against Clerk; discovery via the protected-resource metadata below).
 * Clerk session tokens are also accepted, which makes local testing with a
 * signed-in session easy.
 *
 * Off unless MCP_ENABLED=true.
 */
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { parsePublishableKey } from "@clerk/shared/keys";
import { logger } from "../lib/logger.js";
import { resolveDbUserByClerkId } from "../middlewares/requireAuth.js";
import { signalsPlanStatus } from "./signals.js";
import { SERVER_INSTRUCTIONS, TOOLS, TOOL_LIST, ToolInputError } from "../services/mcpSignals.js";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "wick-betts", title: "Wick Betts Signals", version: "1.0.0" };
const UPGRADE_URL = "https://wickbetts.com/settings";

export function mcpEnabled(): boolean {
  return process.env.MCP_ENABLED === "true";
}

function publicOrigin(): string {
  return (process.env.APP_ORIGIN?.split(",")[0]?.trim() || "https://wickbetts.com").replace(/\/$/, "");
}

/** The URL members paste into their assistant. */
export function mcpResourceUrl(): string {
  return process.env.MCP_RESOURCE_URL?.trim() || `${publicOrigin()}/api/mcp`;
}

function metadataUrl(): string {
  const resource = new URL(mcpResourceUrl());
  return `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
}

function clerkIssuer(): string | null {
  const pk = process.env.CLERK_PUBLISHABLE_KEY?.trim() || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const parsed = pk ? parsePublishableKey(pk) : null;
  return parsed?.frontendApi ? `https://${parsed.frontendApi}` : null;
}

// ── OAuth discovery (RFC 9728 / RFC 8414) — mounted at the ROOT in app.ts ──

/** GET /.well-known/oauth-protected-resource[/api/mcp] */
export function protectedResourceMetadata(_req: Request, res: Response): void {
  const issuer = clerkIssuer();
  if (!mcpEnabled() || !issuer) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({
    resource: mcpResourceUrl(),
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["profile", "email"],
    resource_name: "Wick Betts Signals",
  });
}

let asMetadataCache: { body: unknown; at: number } | null = null;

/** GET /.well-known/oauth-authorization-server — legacy clients; mirrors Clerk's. */
export async function authServerMetadata(_req: Request, res: Response): Promise<void> {
  const issuer = clerkIssuer();
  if (!mcpEnabled() || !issuer) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    if (!asMetadataCache || Date.now() - asMetadataCache.at > 60 * 60 * 1000) {
      const upstream = await fetch(`${issuer}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) throw new Error(`Clerk metadata ${upstream.status}`);
      asMetadataCache = { body: await upstream.json(), at: Date.now() };
    }
    res.json(asMetadataCache.body);
  } catch (err) {
    logger.warn({ err }, "MCP: failed to fetch Clerk authorization-server metadata");
    res.status(502).json({ error: "upstream_unavailable" });
  }
}

// ── JSON-RPC over HTTP ──────────────────────────────────────────────────────

interface RpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const rpcResult = (id: RpcMessage["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: RpcMessage["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function toolText(payload: unknown, isError = false) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text", text }],
    ...(typeof payload === "object" && payload !== null && !isError ? { structuredContent: payload } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

async function handleMessage(msg: RpcMessage, user: { id: string; role: string }): Promise<object | null> {
  const isNotification = msg.id === undefined || msg.id === null;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : rpcError(msg.id, -32600, "Invalid Request");
  }
  if (isNotification) return null; // notifications/initialized, notifications/cancelled, …

  switch (msg.method) {
    case "initialize": {
      const requested = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOL_LIST });
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : "";
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);

      // Entitlement is checked per call so a cancelled plan stops the feed
      // immediately — returned as a tool error (not an HTTP 403) so the
      // assistant can show the member a readable message.
      const plan = await signalsPlanStatus(user);
      if (plan !== "ok") {
        const message = plan === "SIGNALS_PLAN_REQUIRED"
          ? `Wick signals for AI agents are included with the Signals and Mentorship plans. Upgrade at ${UPGRADE_URL}.`
          : `An active Wick Betts Signals or Mentorship subscription is required. Manage your plan at ${UPGRADE_URL}.`;
        return rpcResult(msg.id, toolText(message, true));
      }

      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const payload = await tool.run(args);
        logger.info({ userId: user.id, tool: name }, "MCP tool call");
        return rpcResult(msg.id, toolText(payload));
      } catch (err) {
        if (err instanceof ToolInputError) return rpcResult(msg.id, toolText(err.message, true));
        logger.error({ err, userId: user.id, tool: name }, "MCP tool failed");
        return rpcResult(msg.id, toolText("Wick Betts couldn't load that right now. Try again shortly.", true));
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

const router = Router();

// Stateless server: no SSE stream to open and no session to delete.
router.get("/", (_req, res) => {
  res.set("Allow", "POST").status(405).json(rpcError(null, -32000, "Method not allowed — POST JSON-RPC to this endpoint."));
});
router.delete("/", (_req, res) => {
  res.set("Allow", "POST").status(405).end();
});

// Same metadata under /api too, so it's reachable even through proxies that
// only forward /api/* (the root /.well-known routes are wired in app.ts).
router.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

router.post("/", async (req: Request, res: Response) => {
  if (!mcpEnabled()) {
    res.status(503).json(rpcError(null, -32000, "Wick Betts agent access is not enabled."));
    return;
  }

  let clerkUserId: string | null = null;
  try {
    const auth = getAuth(req, { acceptsToken: ["oauth_token", "session_token"] });
    clerkUserId = auth.isAuthenticated ? auth.userId : null;
  } catch (err) {
    logger.warn({ err }, "MCP: getAuth failed");
  }
  if (!clerkUserId) {
    res
      .set("WWW-Authenticate", `Bearer resource_metadata="${metadataUrl()}"`)
      .status(401)
      .json(rpcError(null, -32001, "Sign in to Wick Betts to connect this assistant."));
    return;
  }

  const user = await resolveDbUserByClerkId(clerkUserId);
  if (!user) {
    res.status(401).json(rpcError(null, -32001, "Could not resolve your Wick Betts account."));
    return;
  }

  const body = req.body as RpcMessage | RpcMessage[] | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json(rpcError(null, -32700, "Parse error"));
    return;
  }

  try {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleMessage(m, user)))).filter(Boolean);
      if (out.length === 0) res.status(202).end();
      else res.json(out);
      return;
    }
    const out = await handleMessage(body, user);
    if (out === null) res.status(202).end();
    else res.json(out);
  } catch (err) {
    logger.error({ err }, "MCP: unhandled error");
    if (!res.headersSent) res.status(500).json(rpcError(null, -32603, "Internal error"));
  }
});

export default router;
