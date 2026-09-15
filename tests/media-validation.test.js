import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, truncate, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  formatMediaUploadProgress,
  validateMediaAttachments,
  validateMediaFiles,
} from '../dist/utils/media.js';

describe('x-reader media attachment validation', () => {
  it('classifies one MP4 as a video attachment', () => {
    assert.deepEqual(validateMediaAttachments(['clip.mp4']), {
      kind: 'video',
      items: [{ path: 'clip.mp4', mimeType: 'video/mp4' }],
    });
  });

  it('rejects mixed media and multiple videos', () => {
    assert.throws(
      () => validateMediaAttachments(['clip.mp4', 'cover.png']),
      /A video cannot be combined with other media/,
    );
    assert.throws(
      () => validateMediaAttachments(['first.mp4', 'second.mov']),
      /Only one video can be attached/,
    );
  });

  it('classifies up to four supported image attachments', () => {
    assert.deepEqual(
      validateMediaAttachments(['one.jpg', 'two.png', 'three.webp', 'four.jpeg']),
      {
        kind: 'images',
        items: [
          { path: 'one.jpg', mimeType: 'image/jpeg' },
          { path: 'two.png', mimeType: 'image/png' },
          { path: 'three.webp', mimeType: 'image/webp' },
          { path: 'four.jpeg', mimeType: 'image/jpeg' },
        ],
      },
    );
  });

  it('rejects more than four images', () => {
    assert.throws(
      () => validateMediaAttachments(['1.png', '2.png', '3.png', '4.png', '5.png']),
      /At most 4 images can be attached/,
    );
  });

  it('rejects a GIF mixed with other media or another GIF', () => {
    assert.throws(
      () => validateMediaAttachments(['animation.gif', 'cover.png']),
      /A GIF cannot be combined with other media/,
    );
    assert.throws(
      () => validateMediaAttachments(['first.gif', 'second.gif']),
      /Only one GIF can be attached/,
    );
  });

  it('rejects unsupported media extensions', () => {
    assert.throws(
      () => validateMediaAttachments(['clip.avi']),
      /Unsupported media extension: \.avi/,
    );
  });

  it('checks every file before upload and rejects oversized photos', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'x-reader-media-validation-'));
    const validImage = join(tempDir, 'valid.png');
    const missingImage = join(tempDir, 'missing.png');
    const oversizedImage = join(tempDir, 'oversized.jpg');
    await writeFile(validImage, Buffer.from([1]));
    await writeFile(oversizedImage, Buffer.from([1]));
    await truncate(oversizedImage, 5 * 1024 * 1024 + 1);

    try {
      await assert.rejects(validateMediaFiles([validImage, missingImage]), /missing\.png/);
      await assert.rejects(validateMediaFiles([oversizedImage]), /exceeds 5 MiB/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('formats video upload progress for the CLI', () => {
    assert.equal(
      formatMediaUploadProgress({
        phase: 'uploading',
        uploadedBytes: 5 * 1024 * 1024,
        totalBytes: 10 * 1024 * 1024,
      }),
      'Uploaded 5.0/10.0 MiB (50%)',
    );
    assert.equal(
      formatMediaUploadProgress({ phase: 'processing', state: 'pending' }),
      'Video processing: pending',
    );
  });
});
