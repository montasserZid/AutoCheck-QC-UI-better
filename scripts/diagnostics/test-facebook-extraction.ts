/**
 * Facebook Marketplace extraction diagnostic.
 *
 * This calls the existing worker boundary and parser directly. It does not
 * change the application extraction path or call the Next.js API route, which
 * would perform a second browser request.
 *
 * Usage:
 *   npx tsx scripts/diagnostics/test-facebook-extraction.ts <url> [url...]
 *   npx tsx scripts/diagnostics/test-facebook-extraction.ts --check-config
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  browserWorkerConfiguration,
  browserWorkerTimeoutMs,
  fetchRenderedListingFromWorker,
  type BrowserWorkerConfiguration,
} from "../../src/server/listing/browserWorker";
import {
  FacebookExtractionError,
  detectFacebookPageState,
  extractFacebookListingFromRenderedText,
  isDirectFacebookMarketplaceItemUrl,
  isSupportedFacebookMarketplaceUrl,
  primaryFacebookListingText,
  renderFacebookMarketplaceListing,
  type FacebookRenderedListing,
} from "../../src/server/listing/facebook";
import { emptyIntake, mergeExtractedIntake } from "../../src/lib/listingExtraction";
import type { ListingUrlExtraction } from "../../src/lib/listingUrlExtraction";
import {
  fetchPublicListingHtml,
  LISTING_FETCH_LIMITS,
  ListingFetchError,
} from "../../src/server/listing/secureFetch";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "facebook-extraction-diagnostics");
const DEFAULT_HEALTH_TIMEOUT_MS = 8_000;
const PREVIEW_LENGTH = 120;

type StageStatus = "OK" | "FAILED" | "NOT_CONFIGURED" | "SKIPPED";
type DescriptionStatus = "PRESENT" | "MISSING" | "NOT_CHECKED";
type DiagnosticCode =
  | "DESCRIPTION_PRESENT"
  | "WORKER_NOT_CONFIGURED"
  | "WORKER_UNAVAILABLE"
  | "WORKER_UNAUTHORIZED"
  | "WORKER_BUSY"
  | "WORKER_TIMEOUT"
  | "FACEBOOK_INVALID_URL"
  | "FACEBOOK_NAVIGATION_TIMEOUT"
  | "FACEBOOK_LOGIN_WALL"
  | "FACEBOOK_CHALLENGE"
  | "RENDERED_DESCRIPTION_MISSING"
  | "PARSER_DESCRIPTION_MISSING"
  | "NORMALIZATION_DROPPED_DESCRIPTION"
  | "UNSUPPORTED_URL"
  | "DIAGNOSTIC_ERROR";

interface StageResult {
  status: StageStatus;
  description: DescriptionStatus;
  code?: DiagnosticCode;
  detail?: string;
  httpStatus?: number;
  elapsedMs?: number;
}

interface DescriptionSummary {
  present: boolean;
  characters: number;
  source?: string;
  preview?: string;
}

const TARGET_PHRASES = [
  "Salut je vend mon subaru wrx 2010",
  "Moteur ej20x rebuilt",
  "Turbo td04 rebuilt",
  "JE SUIS NEGO",
] as const;

type RepresentationKind =
  | "literal"
  | "html-entities"
  | "json-escaped"
  | "unicode-escaped"
  | "json+unicode-escaped";

interface PhraseMatch {
  phrase: string;
  found: boolean;
  representations: RepresentationKind[];
}

interface RepresentationStage {
  name: string;
  status: StageStatus;
  description: DescriptionStatus;
  phrases: PhraseMatch[];
  matchedPhraseCount: number;
  bodyCharacters?: number;
  scriptCount?: number;
  httpStatus?: number;
  finalUrl?: string;
  detail?: string;
}

interface DiagnosticResult {
  url: string;
  urlType: "marketplace-item" | "share" | "unsupported";
  startedAt: string;
  durationMs: number;
  worker: StageResult;
  renderedContent: StageResult & {
    bodyCharacters?: number;
    bodyLines?: number;
    pageState?: string;
    sellerDescriptionMarker?: boolean;
    metadataDescription?: DescriptionSummary;
    redirected?: boolean;
    finalUrl?: string;
    itemId?: string;
  };
  facebookParser: StageResult & {
    extractedFields?: number;
    sellerDescription?: DescriptionSummary;
    provenance?: string;
  };
  normalization: StageResult & {
    sellerDescription?: DescriptionSummary;
    listingText?: DescriptionSummary;
  };
  finalOutput: StageResult & {
    sellerDescription?: DescriptionSummary;
    metadataDescription?: DescriptionSummary;
    listingText?: DescriptionSummary;
    extractionStatus?: "extracted" | "partial" | "empty";
  };
  representationStages: RepresentationStage[];
  parserTransformation?: string;
  warnings: string[];
}

interface WorkerHealthResult {
  configured: boolean;
  urlPresent: boolean;
  secretPresent: boolean;
  endpoint?: string;
  healthEndpoint?: string;
  status: StageStatus;
  httpStatus?: number;
  ready?: boolean;
  service?: string;
  detail?: string;
}

function usage(): void {
  console.log(`Facebook Marketplace extraction diagnostic\n\nUsage (when tsx is available):\n  npx tsx scripts/diagnostics/test-facebook-extraction.ts <url> [url...]\n  npx tsx scripts/diagnostics/test-facebook-extraction.ts --check-config\n\nExisting TypeScript tooling (tsx is not required):\n  node node_modules/typescript/bin/tsc --target ES2022 --module CommonJS --moduleResolution Node --esModuleInterop --skipLibCheck --strict --outDir output/diagnostics scripts/diagnostics/test-facebook-extraction.ts\n  node output/diagnostics/scripts/diagnostics/test-facebook-extraction.js <url> [url...]\n\nOptions:\n  --check-config   Check worker configuration and its authenticated health endpoint.\n  --worker-only    Do not fall back to the existing in-process renderer when the\n                   Cloudways worker is not configured.\n  --help           Show this help.\n\nURLs must be Facebook Marketplace item URLs or supported Facebook share URLs.\nReports are written to artifacts/facebook-extraction-diagnostics/.`);
}

function sanitizePreview(value: string | undefined): string | undefined {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > PREVIEW_LENGTH ? `${normalized.slice(0, PREVIEW_LENGTH)}…` : normalized;
}

function summarizeDescription(value: string | undefined, source?: string): DescriptionSummary {
  const text = typeof value === "string" ? value.trim() : "";
  return {
    present: Boolean(text),
    characters: text.length,
    ...(source ? { source } : {}),
    ...(text ? { preview: sanitizePreview(text) } : {}),
  };
}

function redactedEndpoint(raw: string): string {
  try {
    const url = new URL(raw);
    const route = url.searchParams.get("route");
    url.search = route ? `?route=${encodeURIComponent(route)}` : "";
    return url.toString();
  } catch {
    return "<malformed worker endpoint>";
  }
}

function safeListingUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "<invalid URL>";
  }
}

function healthEndpoint(raw: string): string {
  const url = new URL(raw);
  if (url.searchParams.has("route")) {
    url.searchParams.set("route", "health");
    return url.toString();
  }
  if (/\/extract\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/extract\/?$/i, "/health");
  else url.pathname = `${url.pathname.replace(/\/$/, "")}/health`;
  return url.toString();
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof FacebookExtractionError || error instanceof ListingFetchError) return error.code;
  return undefined;
}

function safeErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown extraction failure.";
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(?:authorization|cookie|secret|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 320);
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  Agrave: "À",
  Aacute: "Á",
  Acirc: "Â",
  Auml: "Ä",
  Ccedil: "Ç",
  Eacute: "É",
  Egrave: "È",
  Ecirc: "Ê",
  Euml: "Ë",
  Iacute: "Í",
  Oacute: "Ó",
  Ograve: "Ò",
  Uacute: "Ú",
  Ugrave: "Ù",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  ccedil: "ç",
  oacute: "ó",
  ograve: "ò",
  uacute: "ú",
  ugrave: "ù",
  rsquo: "’",
  lsquo: "‘",
  ndash: "–",
  mdash: "—",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => {
      try { return String.fromCodePoint(Number(digits)); } catch { return _; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => {
      try { return String.fromCodePoint(Number.parseInt(digits, 16)); } catch { return _; }
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (entity, name: string) => {
      const replacement = NAMED_HTML_ENTITIES[name] ?? NAMED_HTML_ENTITIES[name.toLowerCase()];
      return replacement ?? entity;
    });
}

function decodeJsonEscapes(value: string): string {
  return value.replace(/\\(["\\/bfnrt])/g, (match, escaped: string) => {
    const replacements: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    return replacements[escaped] ?? match;
  });
}

function decodeUnicodeEscapes(value: string): string {
  return value
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (match, digits: string) => {
      try { return String.fromCodePoint(Number.parseInt(digits, 16)); } catch { return match; }
    })
    .replace(/\\u([0-9a-f]{4})/gi, (match, digits: string) => {
      try { return String.fromCharCode(Number.parseInt(digits, 16)); } catch { return match; }
    });
}

function includesPhrase(value: string, phrase: string): boolean {
  return value.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());
}

function representationVariants(value: string): Array<{ kind: RepresentationKind; text: string }> {
  const hasJsonEscapes = /\\["\\/bfnrt]/.test(value);
  const hasUnicodeEscapes = /\\u(?:\{[0-9a-f]{1,6}\}|[0-9a-f]{4})/i.test(value);
  const hasHtmlEntities = /&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(value);
  const variants: Array<{ kind: RepresentationKind; text: string }> = [
    { kind: "literal", text: value },
  ];
  if (hasHtmlEntities) variants.push({ kind: "html-entities", text: decodeHtmlEntities(value) });
  if (hasJsonEscapes) variants.push({ kind: "json-escaped", text: decodeJsonEscapes(value) });
  if (hasUnicodeEscapes) variants.push({ kind: "unicode-escaped", text: decodeUnicodeEscapes(value) });
  if (hasJsonEscapes && hasUnicodeEscapes) {
    variants.push({
      kind: "json+unicode-escaped",
      text: decodeUnicodeEscapes(decodeJsonEscapes(value)),
    });
  }
  return variants;
}

function analyzePhrases(value: string, only?: RepresentationKind): PhraseMatch[] {
  const variants = only
    ? [{ kind: only, text: only === "html-entities" ? decodeHtmlEntities(value) : only === "json-escaped" ? decodeJsonEscapes(value) : only === "unicode-escaped" ? decodeUnicodeEscapes(value) : only === "json+unicode-escaped" ? decodeUnicodeEscapes(decodeJsonEscapes(value)) : value }]
    : representationVariants(value);
  return TARGET_PHRASES.map((phrase) => {
    const literalFound = includesPhrase(value, phrase);
    const representations = only
      ? literalFound
        ? []
        : variants.filter((variant) => includesPhrase(variant.text, phrase)).map((variant) => variant.kind)
      : literalFound
        ? ["literal" as const]
        : variants.filter((variant) => variant.kind !== "literal" && includesPhrase(variant.text, phrase)).map((variant) => variant.kind);
    return { phrase, found: representations.length > 0, representations };
  });
}

function representationStage(
  name: string,
  value: string | undefined,
  options: {
    status?: StageStatus;
    only?: RepresentationKind;
    detail?: string;
    httpStatus?: number;
    finalUrl?: string;
    scriptCount?: number;
  } = {},
): RepresentationStage {
  const status = options.status ?? "OK";
  const phrases = value === undefined ? TARGET_PHRASES.map((phrase) => ({ phrase, found: false, representations: [] })) : analyzePhrases(value, options.only);
  const matchedPhraseCount = phrases.filter((phrase) => phrase.found).length;
  return {
    name,
    status,
    description: value === undefined ? "NOT_CHECKED" : matchedPhraseCount ? "PRESENT" : "MISSING",
    phrases,
    matchedPhraseCount,
    ...(value !== undefined ? { bodyCharacters: value.length } : {}),
    ...(options.scriptCount !== undefined ? { scriptCount: options.scriptCount } : {}),
    ...(options.httpStatus !== undefined ? { httpStatus: options.httpStatus } : {}),
    ...(options.finalUrl ? { finalUrl: safeListingUrl(options.finalUrl) } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };
}

function extractScriptData(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

function emptyRepresentationStages(detail: string, status: StageStatus = "SKIPPED"): RepresentationStage[] {
  return [
    representationStage("Raw HTTP response body", undefined, { status, detail }),
    representationStage("HTML source", undefined, { status, detail }),
    representationStage("Embedded JSON/script data", undefined, { status, detail }),
    representationStage("JSON-escaped strings", undefined, { status, only: "json-escaped", detail }),
    representationStage("Unicode-escaped strings", undefined, { status, only: "unicode-escaped", detail }),
    representationStage("HTML entities", undefined, { status, only: "html-entities", detail }),
  ];
}

function parserGapExplanation(bodyText: string, parsedDescription: string | undefined, stages: RepresentationStage[]): string | undefined {
  if (parsedDescription && TARGET_PHRASES.every((phrase) => includesPhrase(parsedDescription, phrase))) return undefined;
  const domStage = stages.find((stage) => stage.name === "Chromium rendered DOM text");
  const domHasAny = Boolean(domStage?.matchedPhraseCount);
  const parserHasAny = Boolean(parsedDescription && TARGET_PHRASES.some((phrase) => includesPhrase(parsedDescription, phrase)));
  if (!domHasAny || parserHasAny) return undefined;

  if (!TARGET_PHRASES.some((phrase) => includesPhrase(bodyText, phrase))) {
    const encoded = stages.find((stage) => ["JSON-escaped strings", "Unicode-escaped strings", "HTML entities"].includes(stage.name) && stage.matchedPhraseCount > 0);
    if (encoded) return `The rendered payload contains the phrases only after ${encoded.name.toLowerCase()} decoding; the existing Facebook parser receives bodyText without that decoding.`;
  }

  const primary = primaryFacebookListingText(bodyText);
  const lines = primary.split("\n").map((line) => line.trim()).filter(Boolean);
  const heading = lines.findIndex((line) => /^seller'?s description$/i.test(line));
  if (heading < 0) return "The existing sellerDescriptionFromPrimary parser requires an exact Seller's description heading, which is absent after primary section normalization.";
  const content = lines.slice(heading + 1);
  const stop = content.findIndex((line) => /^(?:see more|fuel type|exterior colou?r|interior colou?r|location is approximate|listed\b)/i.test(line));
  if (stop >= 0 && content.slice(stop + 1).some((line) => TARGET_PHRASES.some((phrase) => includesPhrase(line, phrase)))) return `sellerDescriptionFromPrimary stops at the ${content[stop]} marker before the target phrase.`;
  return "The rendered DOM contains target phrases, but the existing Facebook parser did not return them; inspect sellerDescriptionFromPrimary field mapping next.";
}

async function inspectRawHttp(url: string): Promise<{ html?: string; stages: RepresentationStage[]; finalUrl?: string }> {
  try {
    const page = await fetchPublicListingHtml(url, {
      maxBodyBytes: LISTING_FETCH_LIMITS.bodyBytes,
      maxRedirects: LISTING_FETCH_LIMITS.redirects,
      timeoutMs: LISTING_FETCH_LIMITS.timeoutMs,
    });
    const scripts = extractScriptData(page.html);
    return {
      html: page.html,
      finalUrl: page.finalUrl,
      stages: [
        representationStage("Raw HTTP response body", page.html, { httpStatus: page.status, finalUrl: page.finalUrl, detail: "Fetched through the existing SSRF-guarded public HTTP reader." }),
        representationStage("HTML source", page.html, { httpStatus: page.status, finalUrl: page.finalUrl, detail: "Same bounded HTTP body, inspected without saving it." }),
        representationStage("Embedded JSON/script data", scripts.join("\n"), { scriptCount: scripts.length, detail: scripts.length ? `Inspected ${scripts.length} inline script block(s).` : "No inline script blocks were returned." }),
        representationStage("JSON-escaped strings", page.html, { only: "json-escaped", detail: "Matched after JSON string escape decoding where escape markers were present." }),
        representationStage("Unicode-escaped strings", page.html, { only: "unicode-escaped", detail: "Matched after Unicode escape decoding where escape markers were present." }),
        representationStage("HTML entities", page.html, { only: "html-entities", detail: "Matched after numeric or named HTML entity decoding where entity markers were present." }),
      ],
    };
  } catch (error) {
    const detail = safeErrorDetail(error);
    return {
      stages: [
        representationStage("Raw HTTP response body", undefined, { status: "FAILED", httpStatus: error instanceof ListingFetchError ? error.status : undefined, detail }),
        ...emptyRepresentationStages(detail).slice(1),
      ],
    };
  }
}

function classifyError(error: unknown): DiagnosticCode {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  switch (code) {
    case "FACEBOOK_INVALID_URL": return "FACEBOOK_INVALID_URL";
    case "FACEBOOK_NAVIGATION_TIMEOUT": return "FACEBOOK_NAVIGATION_TIMEOUT";
    case "FACEBOOK_LOGIN_REQUIRED": return "FACEBOOK_LOGIN_WALL";
    case "FACEBOOK_BLOCKED":
    case "FACEBOOK_CONSENT_REQUIRED": return "FACEBOOK_CHALLENGE";
    case "worker-unauthorized": return "WORKER_UNAUTHORIZED";
    case "worker-busy": return "WORKER_BUSY";
    case "worker-timeout": return "WORKER_TIMEOUT";
    case "worker-unavailable":
    case "worker-invalid-response": return "WORKER_UNAVAILABLE";
    default: return /\btime(?:d|out)\b/i.test(message) ? "FACEBOOK_NAVIGATION_TIMEOUT" : "DIAGNOSTIC_ERROR";
  }
}

function descriptionSource(extraction: ListingUrlExtraction): string | undefined {
  return extraction.provenance.sellerDescription?.source;
}

function rawDescriptionEvidence(bodyText: string): { marker: boolean; characters: number } {
  const primary = primaryFacebookListingText(bodyText);
  const lines = primary.split("\n").map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => /^seller'?s description$/i.test(line));
  if (start < 0) return { marker: false, characters: 0 };
  const content = lines.slice(start + 1);
  const stop = content.findIndex((line) => /^(?:see more|fuel type|exterior colou?r|interior colou?r|location is approximate|listed\b)/i.test(line));
  const text = (stop < 0 ? content : content.slice(0, stop)).join("\n").trim();
  return { marker: true, characters: text.length };
}

function descriptionStage(
  status: StageStatus,
  value: string | undefined,
  source?: string,
  code?: DiagnosticCode,
  detail?: string,
): StageResult & { sellerDescription?: DescriptionSummary } {
  const summary = summarizeDescription(value, source);
  return {
    status,
    description: summary.present ? "PRESENT" : "MISSING",
    ...(code ? { code } : {}),
    ...(detail ? { detail } : {}),
    sellerDescription: summary,
  };
}

async function fetchHealth(configuration: BrowserWorkerConfiguration): Promise<WorkerHealthResult> {
  const endpoint = healthEndpoint(configuration.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${configuration.secret}`,
        "X-AutoCheck-Worker-Secret": configuration.secret,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = undefined; }
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    return {
      configured: true,
      urlPresent: true,
      secretPresent: true,
      endpoint: redactedEndpoint(configuration.url),
      healthEndpoint: redactedEndpoint(endpoint),
      status: response.ok && record.ok === true ? "OK" : "FAILED",
      httpStatus: response.status,
      ready: typeof record.ready === "boolean" ? record.ready : undefined,
      service: typeof record.service === "string" ? record.service : undefined,
      detail: response.ok && record.ok === true ? undefined : `Health endpoint returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      configured: true,
      urlPresent: true,
      secretPresent: true,
      endpoint: redactedEndpoint(configuration.url),
      healthEndpoint: redactedEndpoint(endpoint),
      status: "FAILED",
      detail: error instanceof Error && error.name === "AbortError" ? "Health endpoint timed out." : safeErrorDetail(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function inspectWorkerConfiguration(): { configuration: BrowserWorkerConfiguration | null; health: WorkerHealthResult } {
  const urlPresent = Boolean(process.env.AUTOCHECK_WORKER_URL?.trim());
  const secretPresent = Boolean(process.env.AUTOCHECK_WORKER_SECRET?.trim());
  if (!urlPresent || !secretPresent) {
    return {
      configuration: null,
      health: {
        configured: false,
        urlPresent,
        secretPresent,
        status: "NOT_CONFIGURED",
        detail: urlPresent || secretPresent
          ? "Both AUTOCHECK_WORKER_URL and AUTOCHECK_WORKER_SECRET are required."
          : "Cloudways worker variables are not configured in this environment.",
      },
    };
  }
  try {
    const configuration = browserWorkerConfiguration();
    if (!configuration) throw new Error("Worker configuration could not be read.");
    return { configuration, health: { configured: true, urlPresent: true, secretPresent: true, status: "SKIPPED", endpoint: redactedEndpoint(configuration.url) } };
  } catch (error) {
    return { configuration: null, health: { configured: false, urlPresent: true, secretPresent: true, status: "FAILED", detail: safeErrorDetail(error) } };
  }
}

function urlType(url: string): DiagnosticResult["urlType"] {
  if (isDirectFacebookMarketplaceItemUrl(url)) return "marketplace-item";
  if (isSupportedFacebookMarketplaceUrl(url)) return "share";
  return "unsupported";
}

function extractionStatus(found: string[]): "extracted" | "partial" | "empty" {
  const core = ["year", "make", "model", "askingPriceCad", "mileageKm"];
  const coreCount = core.filter((field) => found.includes(field)).length;
  if (coreCount >= 3) return "extracted";
  if (found.some((field) => !["listingUrl", "listingSource"].includes(field))) return "partial";
  return "empty";
}

async function runOne(url: string, configuration: BrowserWorkerConfiguration | null, workerOnly: boolean): Promise<DiagnosticResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const type = urlType(url);
  const warnings: string[] = [];
  const missingStage = (status: StageStatus, code?: DiagnosticCode, detail?: string): StageResult => ({ status, description: "NOT_CHECKED", ...(code ? { code } : {}), ...(detail ? { detail } : {}) });

  if (type === "unsupported") {
    const detail = "The URL is not a supported Facebook Marketplace item or share URL.";
    return {
      url: safeListingUrl(url), urlType: type, startedAt, durationMs: Date.now() - started,
      worker: missingStage("FAILED", "UNSUPPORTED_URL", detail),
      renderedContent: missingStage("SKIPPED", "UNSUPPORTED_URL", detail),
      facebookParser: missingStage("SKIPPED", "UNSUPPORTED_URL", detail),
      normalization: missingStage("SKIPPED", "UNSUPPORTED_URL", detail),
      finalOutput: missingStage("SKIPPED", "UNSUPPORTED_URL", detail), warnings: [detail],
      representationStages: [
        ...emptyRepresentationStages(detail),
        representationStage("Chromium rendered DOM text", undefined, { status: "SKIPPED", detail }),
        representationStage("Cloudways worker response", undefined, { status: "SKIPPED", detail }),
        representationStage("Facebook parser output", undefined, { status: "SKIPPED", detail }),
      ],
    };
  }

  const rawProbe = await inspectRawHttp(url);
  const representationStages = [...rawProbe.stages];
  if (rawProbe.html === undefined) warnings.push("Raw HTTP response was unavailable; representation checks could not inspect HTML or embedded scripts.");

  let rendered: FacebookRenderedListing | undefined;
  let worker: StageResult;
  if (configuration) {
    let extractionHttpStatus: number | undefined;
    const captureFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      extractionHttpStatus = response.status;
      return response;
    };
    try {
      rendered = await fetchRenderedListingFromWorker(url, { configuration, fetchImpl: captureFetch, timeoutMs: browserWorkerTimeoutMs() });
      worker = { status: "OK", description: "NOT_CHECKED", httpStatus: extractionHttpStatus ?? 200, elapsedMs: rendered.elapsedMs };
    } catch (error) {
      const code = classifyError(error); const detail = safeErrorDetail(error);
      worker = { status: "FAILED", description: "NOT_CHECKED", code, detail, ...(extractionHttpStatus ? { httpStatus: extractionHttpStatus } : {}) }; warnings.push(detail);
    }
  } else if (!workerOnly) {
    try {
      rendered = await renderFacebookMarketplaceListing(url);
      worker = { status: "NOT_CONFIGURED", description: "NOT_CHECKED", code: "WORKER_NOT_CONFIGURED", detail: "Cloudways worker is not configured; used the existing in-process renderer.", httpStatus: 200, elapsedMs: rendered.elapsedMs };
      warnings.push("Cloudways worker was not configured; rendered locally for comparison.");
    } catch (error) {
      const code = classifyError(error); const detail = safeErrorDetail(error);
      worker = { status: "NOT_CONFIGURED", description: "NOT_CHECKED", code, detail }; warnings.push(detail);
    }
  } else {
    worker = { status: "NOT_CONFIGURED", description: "NOT_CHECKED", code: "WORKER_NOT_CONFIGURED", detail: "Cloudways worker is not configured and --worker-only was supplied." };
  }

  if (!rendered) {
    const detail = worker.detail ?? "No rendered listing payload was returned.";
    return {
      url: safeListingUrl(url), urlType: type, startedAt, durationMs: Date.now() - started, worker,
      renderedContent: missingStage("FAILED", classifyError(detail), detail),
      facebookParser: missingStage("SKIPPED", "RENDERED_DESCRIPTION_MISSING", detail),
      normalization: missingStage("SKIPPED", "RENDERED_DESCRIPTION_MISSING", detail),
      finalOutput: missingStage("SKIPPED", "RENDERED_DESCRIPTION_MISSING", detail), warnings,
      representationStages: [
        ...representationStages,
        representationStage("Chromium rendered DOM text", undefined, { status: "FAILED", detail }),
        representationStage("Cloudways worker response", undefined, { status: worker.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "FAILED", detail }),
        representationStage("Facebook parser output", undefined, { status: "SKIPPED", detail: "No rendered payload was available for the parser." }),
      ],
    };
  }

  const rawEvidence = rawDescriptionEvidence(rendered.bodyText);
  const structuredDescription = rendered.sellerDescription?.trim() ?? "";
  const renderedDescriptionPresent = rawEvidence.characters > 0 || structuredDescription.length > 0;
  const pageState = detectFacebookPageState(rendered.finalUrl, rendered.bodyText, rendered.canonicalUrl);
  const metadataSummary = summarizeDescription(rendered.ogDescription, "meta");
  const renderedContent: DiagnosticResult["renderedContent"] = {
    status: "OK",
    description: renderedDescriptionPresent ? "PRESENT" : "MISSING",
    code: renderedDescriptionPresent ? "DESCRIPTION_PRESENT" : "RENDERED_DESCRIPTION_MISSING",
    detail: rawEvidence.characters > 0
      ? "Seller-description marker and non-empty following content were found in rendered text."
      : structuredDescription
        ? "Identity-bound seller description was returned from Facebook's structured listing data."
        : metadataSummary.present
          ? "Rendered payload has no seller-description section; only metadata description is available."
          : "Rendered payload has no seller-description section.",
    bodyCharacters: rendered.bodyText.length,
    bodyLines: rendered.bodyText.split(/\r?\n/).length,
    pageState,
    sellerDescriptionMarker: rawEvidence.marker || structuredDescription.length > 0,
    metadataDescription: metadataSummary,
    redirected: rendered.finalUrl !== url,
    finalUrl: safeListingUrl(rendered.finalUrl),
    itemId: rendered.itemId,
  };
  representationStages.push(
    representationStage("Chromium rendered DOM text", rendered.bodyText, {
      detail: worker.status === "OK"
        ? "The worker rendered bodyText is the Chromium DOM-text payload returned by the existing worker boundary."
        : "The existing in-process Chromium renderer supplied this DOM-text payload because the Cloudways worker was not configured.",
    }),
    representationStage("Cloudways worker response", rendered.bodyText, {
      status: worker.status === "OK" ? "OK" : "NOT_CONFIGURED",
      detail: worker.status === "OK"
        ? "Inspected the bodyText returned by the authenticated Cloudways worker."
        : "No Cloudways response was available; this stage reflects the local renderer payload only.",
      httpStatus: worker.httpStatus,
      finalUrl: rendered.finalUrl,
    }),
  );
  if (pageState === "login-required") warnings.push("Facebook login wall indicators were present in the rendered payload.");
  if (pageState === "blocked") warnings.push("Facebook challenge or block indicators were present in the rendered payload.");

  let extraction: ListingUrlExtraction;
  try {
    extraction = extractFacebookListingFromRenderedText(rendered, rendered.source === "http-metadata" ? "meta" : "facebook-rendered");
  } catch (error) {
    const code = classifyError(error); const detail = safeErrorDetail(error); warnings.push(detail);
    return {
      url: safeListingUrl(url), urlType: type, startedAt, durationMs: Date.now() - started, worker, renderedContent,
      facebookParser: missingStage("FAILED", code, detail),
      normalization: missingStage("SKIPPED", "PARSER_DESCRIPTION_MISSING", detail),
      finalOutput: missingStage("SKIPPED", "PARSER_DESCRIPTION_MISSING", detail), warnings,
      representationStages: [
        ...representationStages,
        representationStage("Facebook parser output", undefined, { status: "FAILED", detail }),
      ],
    };
  }

  const parsedDescription = extraction.details.sellerDescription;
  const parserDescription = descriptionStage("OK", parsedDescription, descriptionSource(extraction), parsedDescription ? "DESCRIPTION_PRESENT" : "PARSER_DESCRIPTION_MISSING", parsedDescription ? "The existing Facebook rendered-text parser returned sellerDescription." : "The existing Facebook parser returned no sellerDescription.");
  const facebookParser: DiagnosticResult["facebookParser"] = { ...parserDescription, extractedFields: extraction.found.length, provenance: descriptionSource(extraction) };
  representationStages.push(
    representationStage("Facebook parser output", parsedDescription, {
      detail: parsedDescription
        ? "Matched phrases in the existing sellerDescription parser output."
        : "The existing Facebook parser returned no sellerDescription text.",
    }),
  );
  if (rawEvidence.characters > 0 && !parsedDescription) warnings.push("Rendered text contained description content, but the Facebook parser did not return it.");

  const source = descriptionSource(extraction);
  const normalized = mergeExtractedIntake(emptyIntake, extraction.details, {
    listingUrl: extraction.details.listingUrl ?? url,
    sellerDescriptionSource: parsedDescription ? source === "meta" || source === "url" ? "unknown" : source as "facebook-structured" | "facebook-rendered" | "brightdata-facebook" | "html" | "json-ld" | "structured-data" | "pasted-section" | "user-edited" | "unknown" : undefined,
    metadataDescription: extraction.metadataDescription,
  });
  const normalizedDescription = summarizeDescription(normalized.sellerDescription, normalized.sellerDescriptionSource);
  const normalization: DiagnosticResult["normalization"] = {
    status: parsedDescription && !normalized.sellerDescription ? "FAILED" : "OK",
    description: normalizedDescription.present ? "PRESENT" : "MISSING",
    code: parsedDescription && !normalized.sellerDescription ? "NORMALIZATION_DROPPED_DESCRIPTION" : normalizedDescription.present ? "DESCRIPTION_PRESENT" : "PARSER_DESCRIPTION_MISSING",
    detail: parsedDescription && !normalized.sellerDescription ? "The intake merge removed a non-empty parser description." : "The existing intake merge preserved the parser output.",
    sellerDescription: normalizedDescription,
    listingText: summarizeDescription(normalized.listingText, "listingText"),
  };
  if (normalization.status === "FAILED") warnings.push(normalization.detail!);

  const finalDescription = summarizeDescription(normalized.sellerDescription, normalized.sellerDescriptionSource);
  const finalOutput: DiagnosticResult["finalOutput"] = {
    status: "OK",
    description: finalDescription.present ? "PRESENT" : "MISSING",
    code: finalDescription.present ? "DESCRIPTION_PRESENT" : "PARSER_DESCRIPTION_MISSING",
    detail: finalDescription.present ? "Final intake contract contains sellerDescription separately from metadataDescription and sellerMessage." : "Final intake contract contains no sellerDescription.",
    sellerDescription: finalDescription,
    metadataDescription: summarizeDescription(extraction.metadataDescription, "meta"),
    listingText: summarizeDescription(normalized.listingText, "listingText"),
    extractionStatus: extractionStatus(extraction.found),
  };

  const parserTransformation = parserGapExplanation(rendered.bodyText, parsedDescription, representationStages);
  if (parserTransformation) warnings.push(parserTransformation);
  return { url: safeListingUrl(url), urlType: type, startedAt, durationMs: Date.now() - started, worker, renderedContent, facebookParser, normalization, finalOutput, representationStages, ...(parserTransformation ? { parserTransformation } : {}), warnings };
}

function reportFileStem(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z") + "-" + Math.random().toString(36).slice(2, 8);
}

function statusCell(result: DiagnosticResult, key: keyof Pick<DiagnosticResult, "worker" | "renderedContent" | "facebookParser" | "normalization" | "finalOutput">): string {
  const stage = result[key];
  return `${stage.status} / ${stage.description}`;
}

function markdownReport(generatedAt: string, health: WorkerHealthResult, results: DiagnosticResult[]): string {
  const lines = [
    "# Facebook extraction diagnostic", "", `Generated: ${generatedAt}`, "",
    "## Worker configuration", "",
    `- Configured: **${health.configured ? "yes" : "no"}**`,
    `- URL present: **${health.urlPresent ? "yes" : "no"}**`,
    `- Secret present: **${health.secretPresent ? "yes" : "no"}**`,
    `- Endpoint: \`${health.endpoint ?? "not configured"}\``,
    `- Health: **${health.status}**${health.httpStatus ? ` (HTTP ${health.httpStatus})` : ""}`,
    ...(health.detail ? [`- Detail: ${health.detail}`] : []), "",
    "## Stage comparison", "",
    "| URL | Worker | Rendered content | Facebook parser | Normalization | Final output |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map((result) => `| ${result.url} | ${statusCell(result, "worker")} | ${statusCell(result, "renderedContent")} | ${statusCell(result, "facebookParser")} | ${statusCell(result, "normalization")} | ${statusCell(result, "finalOutput")} |`), "",
  ];
  for (const result of results) {
    lines.push(`## ${result.url}`, "", `- URL type: **${result.urlType}**`, `- Duration: **${result.durationMs} ms**`);
    const description = result.finalOutput.sellerDescription;
    lines.push(`- Final seller description: **${description?.present ? "present" : "missing"}**, ${description?.characters ?? 0} characters${description?.source ? `, source \`${description.source}\`` : ""}`);
    if (description?.preview) lines.push(`- Sanitized preview: “${description.preview}”`);
    if (result.renderedContent.finalUrl) lines.push(`- Final URL: \`${result.renderedContent.finalUrl}\``);
    if (result.renderedContent.pageState) lines.push(`- Facebook page state: **${result.renderedContent.pageState}**`);
    if (result.parserTransformation) lines.push(`- Parser transformation: ${result.parserTransformation}`);
    lines.push("", "### Phrase representation stages", "", "| Stage | Status | Found phrases | Representations |", "| --- | --- | ---: | --- |", ...result.representationStages.map((stage) => {
      const representations = [...new Set(stage.phrases.flatMap((phrase) => phrase.representations))];
      return `| ${stage.name} | ${stage.status} / ${stage.description} | ${stage.matchedPhraseCount}/${TARGET_PHRASES.length} | ${representations.join(", ") || "—"} |`;
    }), "");
    lines.push("### Exact phrase matches", "", `| Phrase | ${result.representationStages.map((stage) => stage.name).join(" | ")} |`, `| --- | ${result.representationStages.map(() => "---").join(" | ")} |`, ...TARGET_PHRASES.map((phrase) => {
      const cells = result.representationStages.map((stage) => {
        const match = stage.phrases.find((item) => item.phrase === phrase);
        return match?.found ? match.representations.join(", ") : "—";
      });
      return `| ${phrase} | ${cells.join(" | ")} |`;
    }), "");
    if (result.warnings.length) lines.push("- Warnings:", ...result.warnings.map((warning) => `  - ${warning}`));
    lines.push("");
  }
  lines.push("Raw HTML, complete rendered text, cookies, authorization headers, secrets, and full descriptions are intentionally not saved.", "");
  return lines.join("\n");
}

async function writeArtifacts(generatedAt: string, health: WorkerHealthResult, results: DiagnosticResult[]): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const stem = reportFileStem();
  const jsonPath = join(ARTIFACT_DIR, `${stem}.json`);
  const markdownPath = join(ARTIFACT_DIR, `${stem}.md`);
  await writeFile(jsonPath, `${JSON.stringify({ generatedAt, worker: health, results, privacy: { completeDescriptionsSaved: false, rawRenderedContentSaved: false, credentialsSaved: false } }, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdownReport(generatedAt, health, results), "utf8");
  return { jsonPath, markdownPath };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { usage(); return; }
  const checkConfig = args.includes("--check-config");
  const workerOnly = args.includes("--worker-only");
  const urls = args.filter((arg) => !arg.startsWith("--"));
  if (!checkConfig && urls.length === 0) { usage(); process.exitCode = 1; return; }
  // Match the environment loading used by Next while keeping all values in
  // process memory. Values are never printed or written to the report.
  loadEnvConfig(process.cwd(), false, undefined, true);
  const inspected = inspectWorkerConfiguration();
  const health = inspected.configuration ? await fetchHealth(inspected.configuration) : inspected.health;
  const generatedAt = new Date().toISOString();
  const results: DiagnosticResult[] = [];
  for (const url of urls) {
    console.log(`\nTesting ${url}`);
    const result = await runOne(url, inspected.configuration, workerOnly);
    results.push(result);
    console.log(`  Worker: ${result.worker.status} | Rendered: ${result.renderedContent.status} / ${result.renderedContent.description}`);
    console.log(`  Parser: ${result.facebookParser.status} / ${result.facebookParser.description} | Normalization: ${result.normalization.status} / ${result.normalization.description}`);
    console.log(`  Final sellerDescription: ${result.finalOutput.description}`);
    console.table(result.representationStages.map((stage) => ({ stage: stage.name, status: `${stage.status} / ${stage.description}`, phrases: `${stage.matchedPhraseCount}/${TARGET_PHRASES.length}`, representations: [...new Set(stage.phrases.flatMap((phrase) => phrase.representations))].join(", ") || "—" })));
    if (result.parserTransformation) console.log(`  Parser transformation: ${result.parserTransformation}`);
    if (result.warnings.length) console.log(`  Warning: ${result.warnings[0]}`);
  }
  const artifacts = await writeArtifacts(generatedAt, health, results);
  console.log("\nStage comparison:");
  console.table(results.map((result) => ({ url: result.url, worker: statusCell(result, "worker"), rendered: statusCell(result, "renderedContent"), parser: statusCell(result, "facebookParser"), normalization: statusCell(result, "normalization"), final: statusCell(result, "finalOutput") })));
  console.log(`JSON report: ${artifacts.jsonPath}`);
  console.log(`Markdown report: ${artifacts.markdownPath}`);
  if (!urls.length) console.log(`Worker health: ${health.status}${health.httpStatus ? ` (HTTP ${health.httpStatus})` : ""}`);
}

void main().catch((error) => {
  console.error(`Diagnostic failed: ${safeErrorDetail(error)}`);
  process.exitCode = 1;
});
