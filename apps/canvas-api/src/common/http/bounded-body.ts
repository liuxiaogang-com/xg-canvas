export class ResponseBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`response body exceeded ${maxBytes} bytes`);
    this.name = 'ResponseBodyTooLargeError';
  }
}

export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ResponseBodyTooLargeError(maxBytes);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new ResponseBodyTooLargeError(maxBytes);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function readBoundedJson<T>(response: Response, maxBytes: number): Promise<T> {
  const text = await readBoundedText(response, maxBytes);
  return JSON.parse(text) as T;
}
