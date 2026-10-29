// Plan SC: 한글파일↔웹페이지 오탈자를 오자·탈자·띄어쓰기로 나눠 알린다 (사용자 요청, 2026-10-29).
// AI가 아니라 코드가 두 문장의 글자를 한 글자씩 대조해 종류를 정한다 (숫자 대조와 같은 원칙).

export type TypoKind = "오자" | "탈자" | "띄어쓰기";

const SPACES = /[\s ​]+/g;
const collapse = (s: string) => s.replace(SPACES, " ").trim();
const strip = (s: string) => s.replace(SPACES, "");

// 오자는 글자 1개가 다른 글자로 바뀐 것, 탈자는 글자 1~2개가 빠지거나 더해진 것이다.
// 이보다 크게 다른 덩어리가 하나라도 있으면 오탈자가 아니라 문구가 다른 것이므로 종류를 붙이지 않는다.
const MAX_WRONG = 1;
const MAX_MISSING = 2;
// 너무 긴 문장은 글자 대조(제곱 계산)를 하지 않는다
const MAX_CHARS = 1500;

export function classifyTypos(hwp: string, web: string): TypoKind[] {
  const a = strip(hwp);
  const b = strip(web);
  // 글자는 같고 띄어쓰기만 다르다
  if (a === b) return collapse(hwp) === collapse(web) ? [] : ["띄어쓰기"];
  if (a.length > MAX_CHARS || b.length > MAX_CHARS) return [];

  // 글자 단위 편집 거리 표
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = 0; i <= n; i++) dp[i * w] = i;
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i * w + j] = Math.min(dp[(i - 1) * w + j - 1] + cost, dp[(i - 1) * w + j] + 1, dp[i * w + j - 1] + 1);
    }
  }

  // 뒤에서부터 거슬러 올라가며 다른 덩어리를 모은다 (덩어리 = 연이어 다른 글자들)
  const kinds = new Set<TypoKind>();
  let hwpOnly = 0; // 한글파일에만 있는 글자 수
  let webOnly = 0; // 웹페이지에만 있는 글자 수
  let subs = 0; // 서로 다른 글자로 바뀐 수
  let big = false;
  const flush = () => {
    if (hwpOnly + webOnly + subs === 0) return;
    const hwpLen = hwpOnly + subs;
    const webLen = webOnly + subs;
    if (hwpLen > 0 && webLen > 0 && Math.max(hwpLen, webLen) <= MAX_WRONG) kinds.add("오자");
    else if (hwpLen === 0 || webLen === 0) {
      if (Math.max(hwpLen, webLen) <= MAX_MISSING) kinds.add("탈자");
      else big = true;
    } else big = true;
    hwpOnly = webOnly = subs = 0;
  };
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const here = dp[i * w + j];
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && here === dp[(i - 1) * w + j - 1]) {
      flush();
      i--;
      j--;
    } else if (i > 0 && j > 0 && here === dp[(i - 1) * w + j - 1] + 1) {
      subs++;
      i--;
      j--;
    } else if (i > 0 && here === dp[(i - 1) * w + j] + 1) {
      hwpOnly++;
      i--;
    } else {
      webOnly++;
      j--;
    }
  }
  flush();
  return big ? [] : [...kinds];
}
