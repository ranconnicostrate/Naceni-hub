let memoryIdToken: string | null = null;

export function setInMemoryIdToken(token: string | null) {
  memoryIdToken = token;
}

export function getInMemoryIdToken(): string | null {
  return memoryIdToken;
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryIdToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryIdToken}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {
      // Ignore parse error
    }
    throw new Error(errMsg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export function formatRwf(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return `Rwf ${num.toLocaleString('en-US')}`;
}
