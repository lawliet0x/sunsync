export const MAX_BODY_BYTES = 16384;

export class BodyTooLarge extends Error {}

// Enforce a byte limit while streaming, before buffering or parsing the body.
export async function readJsonBody(request) {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    await request.body?.cancel();
    throw new BodyTooLarge("Request too large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BodyTooLarge("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
