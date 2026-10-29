import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Design Ref: DESIGN.md §8 보안 — 서버가 내부망 주소를 대신 열지 않도록 막는다.
// 주소의 글자 모양만이 아니라, 이름이 실제로 연결되는 IP와 다른 주소로 넘겨받는(리다이렉트) 경우까지 매번 확인한다.

const MAX_REDIRECTS = 5;

// 사설·루프백·링크로컬 등 인터넷에 공개되지 않은 IPv4인지
function isPrivateV4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // 통신사 공유 대역 100.64.0.0/10
    a === 127 ||
    (a === 169 && b === 254) || // 링크로컬·클라우드 메타데이터
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // 멀티캐스트·예약
  );
}

// IPv6를 8칸(16비트씩)으로 펼친다. 끝에 IPv4가 붙은 모양(::ffff:1.2.3.4)도 처리한다.
function expandV6(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0];
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const n = v4.slice(1).map(Number);
    text = text.replace(v4[0], `${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array(fill).fill("0"), ...tail].map((h) => parseInt(h, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? all : null;
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip.split(".").map(Number));
  if (kind === 6) {
    const h = expandV6(ip);
    if (!h) return true;
    if (h.every((n) => n === 0)) return true; // ::
    if (h.slice(0, 7).every((n) => n === 0) && h[7] === 1) return true; // ::1
    // IPv4가 IPv6 안에 담긴 주소(::ffff:127.0.0.1 등)는 안쪽 IPv4로 판단한다
    if (h.slice(0, 5).every((n) => n === 0) && (h[5] === 0xffff || h[5] === 0)) {
      return isPrivateV4([h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255]);
    }
    if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 사설
    if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 링크로컬
    if ((h[0] & 0xff00) === 0xff00) return true; // 멀티캐스트
    return false;
  }
  return true;
}

// 공개 인터넷 주소인지. 호스트 이름이면 실제 연결되는 IP를 모두 확인한다.
export async function isPublicUrl(url: URL): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !isBlockedIp(host);
  // 점이 없는 이름(사내 단일 이름)은 공개 주소가 아니다
  if (!host.includes(".")) return false;
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isBlockedIp(a.address));
  } catch {
    return false;
  }
}

export class UnsafeUrlError extends Error {
  constructor() {
    super("공개되지 않은 주소입니다.");
    this.name = "UnsafeUrlError";
  }
}

// fetch와 같지만, 처음 주소와 넘겨받는 주소 모두 공개 주소인지 확인한다 (최대 5번까지만 따라간다)
export async function safeFetch(start: URL, init: RequestInit): Promise<Response> {
  let url = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!(await isPublicUrl(url))) throw new UnsafeUrlError();
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    // 최종 주소를 알 수 있게 해 둔다
    Object.defineProperty(res, "finalUrl", { value: url.toString() });
    return res;
  }
  throw new UnsafeUrlError();
}

export const finalUrlOf = (res: Response, fallback: string): string => (res as Response & { finalUrl?: string }).finalUrl ?? fallback;

// 응답을 조금씩 읽다가 한도를 넘으면 멈춘다 (끝없이 내려오는 응답으로 서버 메모리가 차는 것을 막는다)
export async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
