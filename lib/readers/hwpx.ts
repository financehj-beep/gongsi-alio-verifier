import "server-only";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { HwpLocation } from "@/lib/types";
import { hwpFail, type HwpImage, type HwpParagraph, type HwpReadResult } from "@/lib/readers/hwp-types";

// Design Ref: DESIGN.md §3 1단계 읽기 3번 — .hwpx에서 글자를 쪽·문단·표 위치와 함께 뽑는다.
// .hwpx는 압축 파일이고, 본문은 Contents/section0.xml, section1.xml … 에 들어 있다 (공개 형식 OWPML).

// 순서를 지키며 읽는 XML 조각: { 태그이름: [자식들], ":@": { 속성 } } 또는 { "#text": 글자 }
type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

function tagOf(node: XmlNode): string | null {
  for (const key of Object.keys(node)) if (key !== ":@") return key;
  return null;
}

function childrenOf(node: XmlNode): XmlNode[] {
  const tag = tagOf(node);
  const value = tag ? node[tag] : null;
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function attr(node: XmlNode, name: string): string | undefined {
  const attrs = node[":@"] as Record<string, string> | undefined;
  return attrs?.[name];
}

function find(nodes: XmlNode[], tag: string): XmlNode[] {
  return nodes.filter((n) => tagOf(n) === tag);
}

function clean(text: string): string {
  return text
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

// <hp:t> 안의 글자. 탭은 띄어쓰기, 줄바꿈은 줄바꿈으로 바꾼다.
function textOfT(t: XmlNode): string {
  let out = "";
  for (const child of childrenOf(t)) {
    const tag = tagOf(child);
    if (tag === "#text") out += String(child["#text"]);
    else if (tag === "tab") out += " ";
    else if (tag === "lineBreak") out += "\n";
  }
  return out;
}

type ManifestItem = { id: string; href: string; mime: string };

async function readManifest(zip: JSZip): Promise<ManifestItem[]> {
  const hpf = zip.file("Contents/content.hpf");
  if (!hpf) return [];
  const root = parser.parse(await hpf.async("string")) as XmlNode[];
  const pkg = root.find((n) => tagOf(n) === "package");
  const manifest = pkg ? find(childrenOf(pkg), "manifest")[0] : undefined;
  if (!manifest) return [];
  return find(childrenOf(manifest), "item").map((item) => ({
    id: attr(item, "id") ?? "",
    href: attr(item, "href") ?? "",
    mime: attr(item, "media-type") ?? "",
  }));
}

function sectionPaths(zip: JSZip, manifest: ManifestItem[]): string[] {
  const fromManifest = manifest.map((m) => m.href).filter((h) => /^Contents\/section\d+\.xml$/.test(h));
  const found = fromManifest.length > 0 ? fromManifest : Object.keys(zip.files).filter((f) => /^Contents\/section\d+\.xml$/.test(f));
  const num = (p: string) => Number(/section(\d+)\.xml$/.exec(p)?.[1] ?? 0);
  return [...new Set(found)].sort((a, b) => num(a) - num(b));
}

export async function readHwpx(bytes: Uint8Array): Promise<HwpReadResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return hwpFail("damaged");
  }

  // 암호가 걸린 문서는 META-INF/manifest.xml에 암호 정보가 들어 있다
  const encManifest = zip.file("META-INF/manifest.xml");
  if (encManifest && /encryption-data|EncryptionMethod/i.test(await encManifest.async("string"))) {
    return hwpFail("encrypted");
  }

  const manifest = await readManifest(zip);
  const sections = sectionPaths(zip, manifest);
  if (sections.length === 0) return hwpFail("damaged");

  const imagesById = new Map(manifest.filter((m) => m.href.startsWith("BinData/")).map((m) => [m.id, m]));
  const paragraphs: HwpParagraph[] = [];
  const images: HwpImage[] = [];

  let page = 1;
  let pageKnown = false;
  // 문단 번호는 쪽마다 1부터 다시 센다 (쪽을 모르면 아래에서 문서 전체 순서로 다시 센다)
  let paraInPage = 0;
  let tableIndex = 0;
  let lastVertpos = -1;
  let first = true;

  for (const [s, path] of sections.entries()) {
    let root: XmlNode[];
    try {
      root = parser.parse(await zip.file(path)!.async("string")) as XmlNode[];
    } catch {
      return hwpFail("damaged");
    }
    const sec = root.find((n) => tagOf(n) === "sec");
    if (!sec) return hwpFail("damaged");

    // 새 구역은 새 쪽에서 시작한다
    if (s > 0) {
      page += 1;
      paraInPage = 0;
      lastVertpos = -1;
    }

    for (const p of find(childrenOf(sec), "p")) {
      // 쪽이 바뀌었는지: 쪽 나눔 표시가 있거나, 쪽 안 세로 위치(vertpos)가 다시 작아졌을 때
      const linesegs = find(childrenOf(p), "linesegarray").flatMap((a) => find(childrenOf(a), "lineseg"));
      const vertposes = linesegs.map((l) => Number(attr(l, "vertpos") ?? NaN)).filter((v) => !Number.isNaN(v));
      if (vertposes.length > 0) pageKnown = true;
      const newPage = !first && (attr(p, "pageBreak") === "1" || (vertposes.length > 0 && lastVertpos >= 0 && vertposes[0] < lastVertpos));
      if (newPage) {
        page += 1;
        paraInPage = 0;
      }
      if (vertposes.length > 0) lastVertpos = Math.max(...vertposes);
      first = false;

      paraInPage += 1;
      const here = (): Omit<HwpLocation, "table"> => ({ page, paragraph: paraInPage });

      let text = "";
      for (const run of find(childrenOf(p), "run")) {
        for (const item of childrenOf(run)) {
          const tag = tagOf(item);
          if (tag === "t") {
            text += textOfT(item);
          } else if (tag === "tbl") {
            tableIndex += 1;
            for (const tr of find(childrenOf(item), "tr")) {
              for (const tc of find(childrenOf(tr), "tc")) {
                const addr = find(childrenOf(tc), "cellAddr")[0];
                const row = Number(addr ? attr(addr, "rowAddr") : 0) + 1;
                const col = Number(addr ? attr(addr, "colAddr") : 0) + 1;
                const cellText = find(childrenOf(tc), "subList")
                  .flatMap((sub) => find(childrenOf(sub), "p"))
                  .map((cp) => find(childrenOf(cp), "run").flatMap((r) => find(childrenOf(r), "t")).map(textOfT).join(""))
                  .join("\n");
                const cleaned = clean(cellText);
                if (cleaned) paragraphs.push({ text: cleaned, location: { ...here(), table: { index: tableIndex, row, col } } });
              }
            }
          } else if (tag === "pic") {
            const img = childrenOf(item).find((n) => tagOf(n) === "img");
            const ref = img ? attr(img, "binaryItemIDRef") : undefined;
            const entry = ref ? imagesById.get(ref) : undefined;
            const file = entry ? zip.file(entry.href) : null;
            if (entry && file) {
              const data = await file.async("uint8array");
              images.push({ index: images.length + 1, path: entry.href, mime: entry.mime, size: data.byteLength });
            }
          }
        }
      }
      const cleaned = clean(text);
      if (cleaned) paragraphs.push({ text: cleaned, location: here() });
    }
  }

  const charCount = paragraphs.reduce((n, p) => n + p.text.length, 0);
  if (charCount === 0 && images.length === 0) return hwpFail("empty");

  // 쪽 정보가 없으면 쪽 번호를 버리고 전체 문단 순서만 남긴다 (PRD.md 4번)
  if (!pageKnown) {
    let n = 0;
    let lastKey = "";
    for (const para of paragraphs) {
      const key = `${para.location.page}-${para.location.paragraph}`;
      if (key !== lastKey) n += 1;
      lastKey = key;
      para.location = { paragraph: n, ...(para.location.table ? { table: para.location.table } : {}) };
    }
  }

  return {
    ok: true,
    doc: { format: "hwpx", paragraphs, images, pageKnown, pageCount: pageKnown ? page : undefined, charCount },
  };
}

// 그림 파일 내용을 꺼낸다 (이미지 글자 읽기에서 쓴다)
export async function readHwpxImageBytes(bytes: Uint8Array, path: string): Promise<Uint8Array | null> {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file(path);
  return file ? file.async("uint8array") : null;
}
