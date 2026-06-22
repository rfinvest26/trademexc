import {
  createSupportMessage,
  createSupportMessages,
  ensureSupportThread,
  listSupportMessages,
  removeSupportChannel,
  subscribeToSupportMessages,
  touchSupportThread,
  type SupportMessageRecord,
} from '../support';
import { uploadPublicFile } from './storageService';

const SUPPORT_ATTACHMENTS_BUCKET = 'support-attachments';

function supportAttachmentExt(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'video/webm') return 'webm';
  if (file.type === 'video/quicktime') return 'mov';
  if (file.type === 'video/mp4') return 'mp4';
  return 'jpg';
}

export async function uploadSupportAttachment(threadId: string, file: File): Promise<string> {
  const ext = supportAttachmentExt(file);
  const path = `${threadId}/${crypto.randomUUID()}.${ext}`;
  return uploadPublicFile(SUPPORT_ATTACHMENTS_BUCKET, path, file);
}

export {
  createSupportMessage,
  createSupportMessages,
  ensureSupportThread,
  listSupportMessages,
  removeSupportChannel,
  subscribeToSupportMessages,
  touchSupportThread,
};
export type { SupportMessageRecord };
