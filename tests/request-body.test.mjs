import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BodyTooLarge,
  readJsonBody,
  MAX_BODY_BYTES,
} from "../supabase/functions/operations/request-body.js";

const request = (body, headers = {}) =>
  new Request("https://example.test", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  });

test("Edge body reader accepts JSON and exact byte boundary", async () => {
  assert.deepEqual(await readJsonBody(request('{"args":{}}')), { args: {} });
  const json = '"' + "a".repeat(MAX_BODY_BYTES - 2) + '"';
  assert.equal((await readJsonBody(request(json))).length, MAX_BODY_BYTES - 2);
});

test("Edge body reader rejects oversized declared and undeclared payloads", async () => {
  await assert.rejects(
    readJsonBody(
      request("{}", { "content-length": String(MAX_BODY_BYTES + 1) }),
    ),
    BodyTooLarge,
  );
  await assert.rejects(
    readJsonBody(request("a".repeat(MAX_BODY_BYTES + 1))),
    BodyTooLarge,
  );
  // Unicode must be measured in bytes, not JavaScript character count.
  await assert.rejects(
    readJsonBody(request('"' + "é".repeat(8192) + '"')),
    BodyTooLarge,
  );
});

test("Edge body reader cancels oversized streams before reading the rest", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readJsonBody(request(body)), BodyTooLarge);
  assert.equal(cancelled, true);
});

test("Edge body reader rejects absent, malformed JSON and invalid UTF-8", async () => {
  await assert.rejects(readJsonBody(request(null)), /Missing request body/);
  await assert.rejects(readJsonBody(request("{")), SyntaxError);
  await assert.rejects(readJsonBody(request(new Uint8Array([255]))), TypeError);
});
