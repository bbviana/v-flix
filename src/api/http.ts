export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string,
  ) {
    super(`HTTP ${status} em ${url}: ${body.slice(0, 200)}`);
  }
}

type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(status: number) {
  return status === 429 || status >= 500;
}

/**
 * fetch com retry e backoff exponencial (com jitter) para 429, 5xx e falhas de rede.
 * Respeita o header Retry-After quando presente.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { retries = 5, baseDelayMs = 500, maxDelayMs = 15_000, signal }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + Math.random() / 2);

    try {
      const res = await fetch(url, { ...init, signal });
      if (res.ok) return res;

      const body = await res.text().catch(() => '');
      if (!isRetryable(res.status) || attempt >= retries) {
        throw new HttpError(res.status, url, body);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      if (retryAfter > 0) delay = Math.min(maxDelayMs, retryAfter * 1000);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (signal?.aborted || attempt >= retries) throw err;
      // Falha de rede: tenta de novo com backoff.
    }

    await sleep(delay);
  }
}

/** Executa `worker` sobre `items` com no máximo `concurrency` chamadas simultâneas. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
