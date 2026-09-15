import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { XReaderClient } from '../dist/api/client.js';

const originalFetch = globalThis.fetch;
const VIDEO_CHUNK_SIZE = 5 * 1024 * 1024;
let requests;
let responses;

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  requests = [];
  responses = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    const response = responses.shift();
    assert.ok(response, `Unexpected request to ${url}`);
    return response;
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createClient() {
  return new XReaderClient({
    cookies: { authToken: 'test-auth-token', ct0: 'test-csrf-token' },
    enableWrites: true,
  });
}

describe('x-reader chunked video upload', () => {
  it('rejects unsupported media before filesystem or network access', async () => {
    const result = await createClient().uploadMedia('/not-present/clip.avi');

    assert.equal(result.success, false);
    assert.match(result.error, /Unsupported media extension: \.avi/);
    assert.equal(requests.length, 0);
  });

  it('preserves direct image upload with an explicit MIME type', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'x-reader-image-'));
    const imagePath = join(tempDir, 'cover.png');
    await writeFile(imagePath, Buffer.from([1, 2, 3, 4]));
    responses.push(jsonResponse({ media_id_string: 'image-media-1' }));

    try {
      const result = await createClient().uploadMedia(imagePath);

      assert.deepEqual(result, { success: true, mediaId: 'image-media-1' });
      assert.equal(requests.length, 1);
      const body = requests[0].init.body;
      assert.ok(body instanceof FormData);
      assert.equal(body.get('media_category'), 'tweet_image');
      assert.equal(body.get('media').type, 'image/png');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns the processing error when X rejects a video', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'x-reader-video-failure-'));
    const videoPath = join(tempDir, 'clip.mp4');
    await writeFile(videoPath, Buffer.from([1]));
    responses.push(
      jsonResponse({ media_id_string: 'video-media-failed' }),
      new Response(null, { status: 204 }),
      jsonResponse({
        processing_info: {
          state: 'failed',
          error: { message: 'Unsupported codec' },
        },
      }),
    );

    try {
      const result = await createClient().uploadMedia(videoPath);

      assert.equal(result.success, false);
      assert.equal(result.error, 'Unsupported codec');
      assert.equal(requests.length, 3);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('fails closed when STATUS omits processing information', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'x-reader-video-incomplete-status-'));
    const videoPath = join(tempDir, 'clip.mp4');
    await writeFile(videoPath, Buffer.from([1]));
    responses.push(
      jsonResponse({ media_id_string: 'video-media-incomplete' }),
      new Response(null, { status: 204 }),
      jsonResponse({ processing_info: { state: 'pending', check_after_secs: 0 } }),
      jsonResponse({}),
    );

    try {
      const result = await createClient().uploadMedia(videoPath);

      assert.equal(result.success, false);
      assert.match(result.error, /STATUS returned no processing_info/);
      assert.equal(requests.length, 4);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('uploads an MP4 in chunks and waits for processing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'x-reader-video-'));
    const videoPath = join(tempDir, 'clip.mp4');
    await writeFile(videoPath, Buffer.alloc(VIDEO_CHUNK_SIZE + 3, 7));

    responses.push(
      jsonResponse({ media_id_string: 'video-media-1' }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
      jsonResponse({ processing_info: { state: 'pending', check_after_secs: 0 } }),
      jsonResponse({ processing_info: { state: 'succeeded' } }),
    );

    try {
      const progress = [];
      const result = await createClient().uploadMedia(videoPath, {
        onProgress: (event) => progress.push(event),
      });

      assert.deepEqual(result, { success: true, mediaId: 'video-media-1' });
      assert.equal(requests.length, 5);

      for (const request of requests) {
        const url = new URL(request.url);
        assert.equal(url.origin, 'https://upload.x.com');
        assert.equal(request.init.headers['x-csrf-token'], 'test-csrf-token');
        assert.match(request.init.headers.cookie, /auth_token=test-auth-token/);
        assert.match(request.init.headers.authorization, /^Bearer /);
      }

      const initBody = requests[0].init.body;
      assert.ok(initBody instanceof URLSearchParams);
      assert.equal(initBody.get('command'), 'INIT');
      assert.equal(initBody.get('total_bytes'), String(VIDEO_CHUNK_SIZE + 3));
      assert.equal(initBody.get('media_type'), 'video/mp4');
      assert.equal(initBody.get('media_category'), 'tweet_video');

      const firstAppend = requests[1].init.body;
      const secondAppend = requests[2].init.body;
      assert.ok(firstAppend instanceof FormData);
      assert.ok(secondAppend instanceof FormData);
      assert.equal(firstAppend.get('command'), 'APPEND');
      assert.equal(firstAppend.get('segment_index'), '0');
      assert.equal(firstAppend.get('media_id'), 'video-media-1');
      assert.equal(firstAppend.get('media').size, VIDEO_CHUNK_SIZE);
      assert.equal(secondAppend.get('segment_index'), '1');
      assert.equal(secondAppend.get('media').size, 3);

      const finalizeBody = requests[3].init.body;
      assert.ok(finalizeBody instanceof URLSearchParams);
      assert.equal(finalizeBody.get('command'), 'FINALIZE');
      assert.equal(finalizeBody.get('media_id'), 'video-media-1');

      const statusUrl = new URL(requests[4].url);
      assert.equal(requests[4].init.method, 'GET');
      assert.equal(statusUrl.searchParams.get('command'), 'STATUS');
      assert.equal(statusUrl.searchParams.get('media_id'), 'video-media-1');
      assert.deepEqual(
        progress.map((event) => event.phase),
        ['initializing', 'uploading', 'uploading', 'processing', 'processing', 'complete'],
      );
      assert.equal(progress[1].uploadedBytes, VIDEO_CHUNK_SIZE);
      assert.equal(progress[2].uploadedBytes, VIDEO_CHUNK_SIZE + 3);
      assert.equal(progress[2].totalBytes, VIDEO_CHUNK_SIZE + 3);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
