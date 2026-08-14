import OpenAI from "openai";
import { logger } from "../lib/logger.js";

/**
 * Calls OpenAI's vision-capable chat completions API to review a member's
 * trade chart screenshot. Uses the `openai` package (already a dependency —
 * see routes/admin.ts's extract-signal feature) rather than adding
 * `@anthropic-ai/sdk`, both to keep one AI provider across the app and
 * because this repo's Docker build runs `pnpm install --frozen-lockfile`,
 * so introducing a new dependency without being able to regenerate
 * pnpm-lock.yaml here would break the next deploy.
 */

const DEFAULT_MODEL = "gpt-4o";

export interface TradeReviewResult {
  technicalRead: string;
  verdict: "Agrees" | "Disagrees" | "Mixed";
  biasExplanation: string;
  riskNote: string;
  summary: string;
}

export class TradeReviewAIError extends Error {}

// Lazy-init so a missing key surfaces as a clean 503 at request time rather
// than crashing the process at import time (same pattern as routes/admin.ts).
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new TradeReviewAIError(
      "OPENAI_API_KEY is not configured — add it in Railway's service variables to enable Review My Trade.",
    );
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

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

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function reviewTradeChart(
  imageDataUrl: string,
  description: string,
  bias: "Bullish" | "Bearish" | "Neutral",
): Promise<TradeReviewResult> {
  if (!imageDataUrl.startsWith("data:image/")) {
    throw new TradeReviewAIError("Image must be a base64 image data URL (data:image/...;base64,...)");
  }

  const openai = getOpenAI();
  const model = process.env.OPENAI_TRADE_REVIEW_MODEL || DEFAULT_MODEL;

  let response;
  try {
    response = await openai.chat.completions.create({
      model,
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(description, bias) },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
    });
  } catch (err) {
    logger.error(err, "OpenAI trade review call failed");
    throw new TradeReviewAIError("Trade review failed — check the OpenAI API key and try again.");
  }

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    throw new TradeReviewAIError("OpenAI returned no content");
  }

  let parsed: Partial<TradeReviewResult>;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch (err) {
    logger.error({ err, raw: raw.slice(0, 500) }, "Could not parse OpenAI trade review JSON");
    throw new TradeReviewAIError("The AI response wasn't valid JSON — try again");
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
    logger.error({ parsed }, "OpenAI trade review JSON missing required fields");
    throw new TradeReviewAIError("The AI review response was incomplete — try again");
  }

  return {
    technicalRead: parsed.technicalRead,
    verdict: parsed.verdict as TradeReviewResult["verdict"],
    biasExplanation: parsed.biasExplanation,
    riskNote: parsed.riskNote,
    summary: parsed.summary,
  };
}
