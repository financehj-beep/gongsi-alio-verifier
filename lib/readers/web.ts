import "server-only";
import * as cheerio from "cheerio";
import type { ImageStats, ImageText } from "@/lib/readers/image-types";

// Design Ref: DESIGN.md §3 1단계 읽기 2번 — URL의 웹페이지를 가져와 메뉴·광고·스크립트를 걷어내고 본문 후보만 남긴다

// 본문 덩어리 하나: 가장 가까운 소제목과 그 아래 문장들 (결과 위치 표시에 쓴다)
export type WebBlock = { heading: string; sentences: string[] };

export type WebImage = { index: number; src: string; alt: string };

export type WebPage = {
  url: string;
  title: string;
  blocks: WebBlock[];
  images: WebImage[];
  // 1단계 읽기가 이미지 속 글자를 읽은 뒤 채운다
  imageTexts?: ImageText[];
  imageStats?: ImageStats;
  charCount: number;
};

export type WebReadError = {
  code: "invalid_url" | "not_found" | "blocked" | "timeout" | "unreachable" | "not_html" | "empty";
  message: string;
};

const TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_FRAMES = 3;
const MAX_IMAGES = 30;

// 메뉴·광고·스크립트 등 본문이 아닌 부분
const NOISE =
  "script, style, noscript, template, svg, nav, header, footer, aside, form, button, select, " +
  "[role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true], " +
  "[class*=gnb], [class*=lnb], [class*=footer], [class*=banner], [id*=footer]";

const ERRORS: Record<WebReadError["code"], string> = {
  invalid_url: "웹페이지 주소가 올바르지 않거나, 열 수 없는 내부 주소입니다.",
  not_found: "웹페이지를 찾을 수 없습니다. 공고가 삭제되었거나 마감되었는지 URL을 확인해 주세요.",
  blocked: "사이트가 자동 접속을 막았습니다. 다른 URL을 쓰거나 직접 확인해 주세요.",
  timeout: "웹페이지가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
  unreachable: "웹페이지에 접속하지 못했습니다. URL을 확인해 주세요.",
  not_html: "웹페이지가 아닌 주소입니다. 공고 상세 페이지 주소를 넣어 주세요.",
  empty: "웹페이지에서 공고 본문을 찾지 못했습니다. URL이 공고 상세 페이지인지 확인해 주세요.",
};

function fail(code: WebReadError["code"]): { ok: false; error: WebReadError } {
  return { ok: false, error: { code, message: ERRORS[code] } };
}

// 서버가 내부망 주소를 대신 열지 않도록 막는다
export function isPublicHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "0.0.0.0" ||
      host === "[::1]" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

type FetchResult = { ok: true; html: string; finalUrl: string } | { ok: false; error: WebReadError };

async function fetchHtml(url: URL): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // 일반 브라우저처럼 요청해야 열리는 사이트가 많다
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    return fail(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable");
  }

  if (res.status === 404 || res.status === 410) return fail("not_found");
  if (res.status === 401 || res.status === 403 || res.status === 429) return fail("blocked");
  if (!res.ok) return fail("unreachable");

  const type = res.headers.get("content-type") ?? "";
  if (type && !type.includes("html")) return fail("not_html");

  const buffer = new Uint8Array(await res.arrayBuffer()).slice(0, MAX_HTML_BYTES);
  return { ok: true, html: decode(buffer, type), finalUrl: res.url || url.toString() };
}

// 한국 공공기관 사이트는 EUC-KR인 경우가 있어 글자 인코딩을 확인해 읽는다
function decode(buffer: Uint8Array, contentType: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const head = new TextDecoder("latin1").decode(buffer.slice(0, 4096));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset === "ks_c_5601-1987" ? "euc-kr" : charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
}

// 문장 단위로 나눈다. 숫자 속 마침표(1.5, 2026.11.03)는 자르지 않는다.
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[다요음함됨임][.!?])\s+|(?<=[.!?])\s+(?=[가-힣A-Z(\[「"'])/)
    .map(clean)
    // "/" "-" 처럼 기호만 있는 조각은 문장으로 치지 않는다
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

function extractBlocks($: cheerio.CheerioAPI): WebBlock[] {
  $(NOISE).remove();
  const blocks: WebBlock[] = [];
  let current: WebBlock = { heading: "", sentences: [] };

  // 글자를 담는 덩어리 요소를 위에서부터 차례로 훑는다 (span·strong 같은 글자 꾸밈 요소는 덩어리 안에 포함)
  const selector = "h1, h2, h3, h4, h5, h6, dt, th, p, li, dd, td, pre, div, section, article";
  $("body")
    .find(selector)
    .each((_, el) => {
      const node = $(el);
      let raw: string;
      if (node.find(selector).length > 0) {
        // 안에 다른 덩어리가 있으면, 그 덩어리 밖에 직접 쓰인 글자만 읽는다 (안쪽은 따로 읽힘)
        raw = node
          .contents()
          .filter((_, child) => child.type === "text" || (child.type === "tag" && !$(child).is(selector) && $(child).find(selector).length === 0))
          .map((_, child) => $(child).text())
          .get()
          .join(" ");
      } else {
        raw = node.text();
      }
      const text = clean(raw);
      if (!text) return;
      const tag = el.tagName.toLowerCase();
      const isHeading = /^h[1-6]$/.test(tag) || tag === "dt" || tag === "th" || /^\[.+\]$|^■|^□|^○|^\d+\.\s/.test(text);
      if (isHeading && text.length <= 40) {
        if (current.sentences.length > 0 || current.heading) blocks.push(current);
        current = { heading: text, sentences: [] };
      } else {
        current.sentences.push(...splitSentences(raw));
      }
    });
  if (current.sentences.length > 0 || current.heading) blocks.push(current);
  return blocks.filter((b) => b.sentences.length > 0);
}

function extractImages($: cheerio.CheerioAPI, baseUrl: string, startIndex: number): WebImage[] {
  const images: WebImage[] = [];
  $("body img").each((_, el) => {
    const raw = $(el).attr("src") ?? $(el).attr("data-src");
    if (!raw || raw.startsWith("data:")) return;
    try {
      const src = new URL(raw, baseUrl).toString();
      images.push({ index: startIndex + images.length + 1, src, alt: clean($(el).attr("alt") ?? "") });
    } catch {
      // 주소가 깨진 이미지는 건너뛴다
    }
  });
  return images;
}

// 공고 본문을 별도 주소에 담아 두는 사이트는 그 본문 주소를 바로 읽는다
function detailUrlFor(url: URL): URL | null {
  // 사람인: /zf_user/jobs/relay/view?rec_idx=… 의 본문은 /zf_user/jobs/relay/view-detail?rec_idx=… 에 있다
  if (url.hostname.endsWith("saramin.co.kr") && /\/zf_user\/jobs\/(relay\/)?view$/.test(url.pathname)) {
    const recIdx = url.searchParams.get("rec_idx");
    if (recIdx && /^\d+$/.test(recIdx)) {
      return new URL(`https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=${recIdx}&rec_seq=0`);
    }
  }
  return null;
}

async function readDetailPage(
  detailUrl: URL,
  title: string,
  originalUrl: string,
): Promise<{ ok: true; page: WebPage } | null> {
  const detail = await fetchHtml(detailUrl);
  if (!detail.ok) return null;
  const $ = cheerio.load(detail.html);
  const images = extractImages($, detail.finalUrl, 0);
  const blocks = extractBlocks($);
  const charCount = blocks.reduce((n, b) => n + b.heading.length + b.sentences.join("").length, 0);
  // 본문이 그림으로만 된 공고도 있다. 그림 속 글자는 이미지 글자 읽기(PLAN.md 15번)에서 읽는다.
  if (charCount < 20 && images.length === 0) return null;
  return { ok: true, page: { url: originalUrl, title, blocks, images: images.slice(0, MAX_IMAGES), charCount } };
}

export async function readWebPage(input: string): Promise<{ ok: true; page: WebPage } | { ok: false; error: WebReadError }> {
  const url = isPublicHttpUrl(input.trim());
  if (!url) return fail("invalid_url");

  const first = await fetchHtml(url);
  if (!first.ok) return first;

  const $ = cheerio.load(first.html);
  const title = clean($("meta[property='og:title']").attr("content") ?? $("title").first().text());

  // 본문 주소가 따로 있으면 그 본문만 쓴다 (사이트 안내문이 비교에 섞이지 않게)
  const detailUrl = detailUrlFor(new URL(first.finalUrl));
  if (detailUrl) {
    const detail = await readDetailPage(detailUrl, title, first.finalUrl);
    if (detail) return detail;
  }
  // 본문을 다른 창(iframe)에 넣어 두는 사이트(예: 채용 사이트)가 있어, 같은 사이트의 창은 함께 읽는다
  const frameUrls = $("iframe[src]")
    .map((_, el) => $(el).attr("src"))
    .get()
    .map((src) => {
      try {
        return new URL(src, first.finalUrl);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => u !== null && u.hostname.endsWith(new URL(first.finalUrl).hostname.replace(/^www\./, "")))
    .slice(0, MAX_FRAMES);

  let images = extractImages($, first.finalUrl, 0);
  const blocks = extractBlocks($);

  for (const frameUrl of frameUrls) {
    const safe = isPublicHttpUrl(frameUrl.toString());
    if (!safe) continue;
    const frame = await fetchHtml(safe);
    if (!frame.ok) continue;
    const $frame = cheerio.load(frame.html);
    images = images.concat(extractImages($frame, frame.finalUrl, images.length));
    blocks.push(...extractBlocks($frame));
  }

  const charCount = blocks.reduce((n, b) => n + b.heading.length + b.sentences.join("").length, 0);
  if (charCount < 20) return fail("empty");

  return {
    ok: true,
    page: { url: first.finalUrl, title, blocks, images: images.slice(0, MAX_IMAGES), charCount },
  };
}
