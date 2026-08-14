import { logger } from "../lib/logger.js";

/**
 * Calls Claude's vision API directly to review a member's trade chart
 * screenshot. Uses raw `fetch` against the Anthropic Messages API instead of
 * the `@anthropic-ai/sdk` package — this repo's `pnpm install` runs with
 * `--frozen-lockfile` in the Docker build, so adding a new dependency
 * without being able to regenerate pnpm-lock.yaml locally would break the
 * next deploy. Every other external integration in this service already
 * follows this same fetch-only pattern (see services/marketHistory.ts,
 * services/economicCalendar.ts).
 */

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

export interface TradeReviewResult {
  technicalRead: string;
  verdict: "Agrees" | "Disagrees" | "Mixed";
  biasExplanation: string;
  riskNote: string;
  summary: string;
}

export class TradeReviewAIError extends Error {}

function buildPrompt(description: string, bias: "Bullish" | "Bearish" | "Neutral"): string {
  return (
    `You are reviewing a trader's chart screenshot for an educational trading community. ` +
    `This is NOT financial advice — frame everything as educational technical analysis only.\n\n` +
    `The trader's own description of their setup: "${description}"\n` +
    `The trader's stated bias: ${bias}\n\n` +
    `Look at the attached chart image and respond with ONLY raw JSON (no markdown fences, no ` +
    `commentary outside the JSON) in exactly this shape:\n` +
    `{\n` +
    `  "technicalRead": "2-3 sentences on what you actually see on the chart — trend direction, ` +
    `visible support/resistance levels, candle patterns, any indicators shown",\n` +
    `  "verdict": "Agrees" | "Disagrees" | "Mixed",\n` +
    `  "biasExplanation": "1-2 sentences explaining why you agree, disagree, or are mixed on their ` +
    `stated ${bias} bias given what the chart actually shows",\n` +
    `  "riskNote": "1-2 sentences on what would invalidate this setup and a reasonable risk/stop ` +
    `consideration",\n` +
    `  "summary": "One sentence overall takeaway"\n` +
    `}`
  );
}

/** Splits a "data:image/jpeg;base64,AAAA..." data URL into its media type and raw base64 payload. */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!match) {
    throw new TradeReviewAIError("Image must be a base64 data URL (data:image/...;base64,...)");
  }
  return { mediaType: match[1], data: match[2] };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export async function reviewTradeChart(
  imageDataUrl: string,
  description: string,
  bias: "Bullish" | "Bearish" | "Neutral",
): Promise<TradeReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new TradeReviewAIError(
      "ANTHROPIC_API_KEY is not configured — add it in Railway's service variables to enable Review My Trade.",
    );
  }

  const { mediaType, data } = parseDataUrl(imageDataUrl);
  const model = process.env.ANTHROPIC_TRADE_REVIEW_MODEL || DEFAULT_MODEL;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: buildPrompt(description, bias) },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body: body.slice(0, 500) }, "Claude trade review request failed");
    throw new TradeReviewAIError(`Claude review failed (HTTP ${res.status})`);
  }

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = json.content?.find((b) => b.type === "text")?.text;
  if (!textBlock) {
    throw new TradeReviewAIError("Claude returned no text content");
  }

  let parsed: Partial<TradeReviewResult>;
  try {
    parsed = JSON.parse(stripCodeFences(textBlock));
  } catch (err) {
    logger.error({ err, raw: textBlock.slice(0, 500) }, "Could not parse Claude trade review JSON");
    throw new TradeReviewAIError("Claude's response wasn't valid JSON — try again");
  }

  const validVerdicts = ["Agrees", "Disagrees", "Mixed"];
  if (
    !parsed.technicalRead ||
    !parsed.verdict ||
    !validVerdicts.includes(parsed.verdict) ||
    !parsed.biasExplanation ||
    !parsed.riskNote ||
    !parsed.summary
  ) {
    logger.error({ parsed }, "Claude trade review JSON missing required fields");
    throw new TradeReviewAIError("Claude's review response was incomplete — try again");
  }

  return {
    technicalRead: parsed.technicalRead,
    verdict: parsed.verdict as TradeReviewResult["verdict"],
    biasExplanation: parsed.biasExplanation,
    riskNote: parsed.riskNote,
    summary: parsed.summary,
  };
}
