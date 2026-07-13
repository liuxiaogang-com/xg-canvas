import { LocalMediaSession } from './local-media';

describe('LocalMediaSession', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('rejects local paths and sensitive literal hosts before fetch', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const session = await LocalMediaSession.create();
    try {
      await expect(session.fetch('C:\\Windows\\win.ini')).rejects.toThrow('HTTP(S) asset URL');
      await expect(session.fetch('http://127.0.0.1/private')).rejects.toThrow('host is not allowed');
      await expect(session.fetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow('host is not allowed');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await session.dispose();
    }
  });

  it('rejects a cross-origin redirect', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }),
    );
    const session = await LocalMediaSession.create();
    try {
      await expect(session.fetch('https://assets.example.test/signed')).rejects.toThrow(
        'redirected to a different origin',
      );
    } finally {
      await session.dispose();
    }
  });

  it('stops a chunked response as soon as the byte limit is exceeded', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
        controller.enqueue(new Uint8Array(5));
        controller.close();
      },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const session = await LocalMediaSession.create({ maxBytes: 8 });
    try {
      await expect(session.fetch('https://assets.example.test/signed')).rejects.toThrow(
        'exceeds 8 bytes',
      );
    } finally {
      await session.dispose();
    }
  });

  it('aborts a stalled fetch at the total timeout', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    );
    const session = await LocalMediaSession.create({ timeoutMs: 25 });
    try {
      const result = session.fetch('https://assets.example.test/signed');
      const assertion = expect(result).rejects.toThrow('aborted');
      await jest.advanceTimersByTimeAsync(25);
      await assertion;
    } finally {
      await session.dispose();
    }
  });

  it('preserves a WAV extension instead of treating every audio MIME as MP3', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      }),
    );
    const session = await LocalMediaSession.create();
    try {
      await expect(session.fetch('https://assets.example.test/signed')).resolves.toMatch(/\.wav$/);
    } finally {
      await session.dispose();
    }
  });
});
