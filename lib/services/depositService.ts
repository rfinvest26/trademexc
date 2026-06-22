import {
  cancelPendingP2PDeal,
  createCryptoDepositRequest,
  getP2PDeal,
  markP2PDealPaid,
  openP2PDeal,
  removeDepositChannel,
  subscribeToP2PDealUpdates,
  type CreateP2PDealInput,
  type OpenP2PDealResult,
  type P2PDealRow,
} from '../deposits';
import { uploadPublicFile } from './storageService';

const P2P_ATTACHMENTS_BUCKET = 'support-attachments';

function p2pProofExt(file: File): string {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

export async function uploadP2PProof(dealId: string, file: File): Promise<string> {
  const ext = p2pProofExt(file);
  const path = `p2p/${dealId}/${crypto.randomUUID()}.${ext}`;
  return uploadPublicFile(P2P_ATTACHMENTS_BUCKET, path, file);
}

export type { CreateP2PDealInput, OpenP2PDealResult, P2PDealRow };
export {
  cancelPendingP2PDeal,
  createCryptoDepositRequest,
  getP2PDeal,
  markP2PDealPaid,
  openP2PDeal,
  removeDepositChannel,
  subscribeToP2PDealUpdates,
};
