// 診断の入力を結果ページのURLに入れたり、URLから読み出したりする。
// 例：/result?v=1&b=hacker,jirai,rokunin,santai,sugaku&f=santai&l=santai:0,jirai:1

import type { DiagnosisInput } from './diagnose';

type Params = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] => {
  const s = Array.isArray(v) ? v.join(',') : v ?? '';
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
};

export function inputFromParams(params: Params): DiagnosisInput {
  const f = Array.isArray(params.f) ? params.f[0] : params.f;
  return {
    books: list(params.b),
    favorite: f || undefined,
    likes: list(params.l),
    disliked: list(params.x),
  };
}

export function resultPath(input: DiagnosisInput): string {
  const q = new URLSearchParams({ v: '1', b: [...input.books].sort().join(',') });
  if (input.favorite) q.set('f', input.favorite);
  if (input.likes?.length) q.set('l', [...input.likes].sort().join(','));
  if (input.disliked?.length) q.set('x', [...input.disliked].sort().join(','));
  // カンマとコロンはそのまま見せたほうがURLが読みやすい
  return `/result?${q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`;
}
