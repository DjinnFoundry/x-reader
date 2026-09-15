import { extname } from 'path';
import { stat } from 'fs/promises';
import type { MediaUploadProgress } from '../api/types.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_GIF_BYTES = 15 * 1024 * 1024;

const VIDEO_MIME_BY_EXTENSION = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
]);

const IMAGE_MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

function extensionOf(filePath: string): string {
  return extname(filePath).toLowerCase();
}

export interface MediaAttachment {
  path: string;
  mimeType: string;
}

export interface MediaAttachmentSet {
  kind: 'images' | 'video';
  items: MediaAttachment[];
}

export function validateMediaAttachments(paths: string[]): MediaAttachmentSet {
  const videos = paths.filter((filePath) => VIDEO_MIME_BY_EXTENSION.has(extensionOf(filePath)));

  if (videos.length > 1) {
    throw new Error('Only one video can be attached');
  }
  if (videos.length === 1 && paths.length > 1) {
    throw new Error('A video cannot be combined with other media');
  }

  if (videos.length === 0) {
    const gifCount = paths.filter((filePath) => extensionOf(filePath) === '.gif').length;
    if (gifCount > 1) {
      throw new Error('Only one GIF can be attached');
    }
    if (gifCount === 1 && paths.length > 1) {
      throw new Error('A GIF cannot be combined with other media');
    }
    if (paths.length > 4) {
      throw new Error('At most 4 images can be attached');
    }
    const items = paths.map((filePath) => {
      const extension = extensionOf(filePath);
      const mimeType = IMAGE_MIME_BY_EXTENSION.get(extension);
      if (!mimeType) throw new Error(`Unsupported media extension: ${extension || '(none)'}`);
      return { path: filePath, mimeType };
    });
    return { kind: 'images', items };
  }

  const [filePath] = videos;
  const mimeType = filePath
    ? VIDEO_MIME_BY_EXTENSION.get(extensionOf(filePath))
    : undefined;
  if (!filePath || !mimeType) {
    throw new Error('Expected one MP4 video');
  }
  return {
    kind: 'video',
    items: [{ path: filePath, mimeType }],
  };
}

/** Validate every local file before the first remote media upload begins. */
export async function validateMediaFiles(paths: string[]): Promise<MediaAttachmentSet> {
  const attachments = validateMediaAttachments(paths);

  await Promise.all(
    attachments.items.map(async (attachment) => {
      let fileInfo;
      try {
        fileInfo = await stat(attachment.path);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot access media file ${attachment.path}: ${detail}`);
      }

      if (!fileInfo.isFile() || fileInfo.size === 0) {
        throw new Error(`Media file must be a non-empty regular file: ${attachment.path}`);
      }

      if (attachment.mimeType.startsWith('image/')) {
        const limit = attachment.mimeType === 'image/gif' ? MAX_GIF_BYTES : MAX_PHOTO_BYTES;
        if (fileInfo.size > limit) {
          throw new Error(
            `${attachment.mimeType === 'image/gif' ? 'GIF' : 'Image'} exceeds ${limit / (1024 * 1024)} MiB: ${attachment.path}`,
          );
        }
      }
    }),
  );

  return attachments;
}

export function formatMediaUploadProgress(progress: MediaUploadProgress): string {
  if (progress.phase === 'initializing') {
    return 'Preparing video upload';
  }
  if (progress.phase === 'uploading') {
    const uploaded = progress.uploadedBytes ?? 0;
    const total = progress.totalBytes ?? 0;
    const mib = 1024 * 1024;
    const percent = total > 0 ? Math.round((uploaded / total) * 100) : 0;
    return `Uploaded ${(uploaded / mib).toFixed(1)}/${(total / mib).toFixed(1)} MiB (${percent}%)`;
  }
  if (progress.phase === 'processing') {
    return `Video processing: ${progress.state ?? 'in progress'}`;
  }
  return 'Video upload complete';
}
