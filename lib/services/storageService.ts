import { ServiceError } from '../errors';
import { supabase } from '../supabase';

export async function uploadPublicFile(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    throw new ServiceError('storage_upload_failed', error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = data?.publicUrl ?? '';
  if (!publicUrl) {
    throw new ServiceError('storage_public_url_missing', 'Failed to resolve public file URL');
  }

  return publicUrl;
}
