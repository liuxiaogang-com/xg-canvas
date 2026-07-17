import { readBoundedJson, readBoundedText, ResponseBodyTooLargeError } from './bounded-body';

describe('bounded response bodies', () => {
  it('reads JSON below the byte limit', async () => {
    const response = new Response(JSON.stringify({ ok: true }));
    await expect(readBoundedJson(response, 64)).resolves.toEqual({ ok: true });
  });

  it('rejects a declared oversized response before buffering it', async () => {
    const response = new Response('small', { headers: { 'content-length': '65' } });
    await expect(readBoundedText(response, 64)).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
  });

  it('rejects an oversized chunked response without Content-Length', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(40));
          controller.enqueue(new Uint8Array(40));
          controller.close();
        },
      }),
    );
    await expect(readBoundedText(response, 64)).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
  });
});
