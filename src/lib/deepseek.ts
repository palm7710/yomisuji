// DeepSeek API（OpenAI互換）でJSONを返してもらう。サーバー側だけで使う。
// https://api-docs.deepseek.com/guides/json_mode/

import 'server-only';

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-flash';
const TIMEOUT_MS = 60_000;

export class AiUnavailableError extends Error {}

export function aiModelName(): string {
  return isMock() ? 'mock' : MODEL;
}

export function isMock(): boolean {
  return process.env.DEEPSEEK_MOCK === '1';
}

export function isConfigured(): boolean {
  return isMock() || !!process.env.DEEPSEEK_API_KEY;
}

/**
 * system と user の指示を送り、JSONとして読めた返り値を返す。
 * 返り値が空・JSONとして読めない・通信エラーのときは1回だけやり直す。
 */
export async function chatJson(system: string, user: string, opts: { temperature?: number; maxTokens?: number } = {}): Promise<unknown> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new AiUnavailableError('DEEPSEEK_API_KEY が設定されていません');

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 4000,
          stream: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 402) {
        throw new AiUnavailableError(`DeepSeek API ${res.status}: キーまたは残高を確認してください`);
      }
      if (!res.ok) throw new Error(`DeepSeek API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      // JSONとして認められないと、中身が空白で返ることがある（公式の注意書き）
      if (!content) throw new Error('DeepSeek の返り値が空でした');
      return JSON.parse(content);
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e;
      lastError = e;
      console.warn(`[deepseek] attempt ${attempt + 1} failed: ${(e as Error).message}`);
    }
  }
  throw new AiUnavailableError(`DeepSeek から結果を得られませんでした: ${(lastError as Error)?.message}`);
}
