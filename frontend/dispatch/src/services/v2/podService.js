import v2Client, { checkV2Availability } from './apiClient';

export const PROOF_TYPES = {
  SIGNATURE: 'SIGNATURE',
  PHOTO: 'PHOTO',
  PIN: 'PIN',
  BARCODE: 'BARCODE',
};

export const getProofRequirements = async (jobId, stopId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for POD management');
  const res = await v2Client.get(`/jobs/${jobId}/stops/${stopId}/pod`);
  return res.data.requirements;
};

export const getProofsByStop = async (jobId, stopId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for POD management');
  const res = await v2Client.get(`/jobs/${jobId}/stops/${stopId}/pod`);
  return res.data.proofs;
};

export const captureSignature = async (jobId, stopId, signatureData, recipientName) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for POD management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/pod/signature`, {
    signatureData,
    recipientName,
  });
  return res.data;
};

export const capturePhoto = async (jobId, stopId, photoUrl, notes) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for POD management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/pod/photo`, { photoUrl, notes });
  return res.data;
};

export const verifyPin = async (jobId, stopId, pincode) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for POD management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/pod/pin`, { pincode });
  return res.data;
};

export const captureProof = async (jobId, stopId, proofData) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for POD management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/pod`, proofData);
  return res.data;
};

export const uploadPhotoProof = async (jobId, stopId, file, notes) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for POD management');
  const formData = new FormData();
  formData.append('photo', file);
  const uploadRes = await v2Client.post('/uploads/pod', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return capturePhoto(jobId, stopId, uploadRes.data.url, notes);
};

export default {
  PROOF_TYPES,
  getProofRequirements,
  getProofsByStop,
  captureSignature,
  capturePhoto,
  verifyPin,
  captureProof,
  uploadPhotoProof,
};
