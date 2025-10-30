import api from './api';

export interface DispatchPaymentConfig {
  enabled: boolean;
  publishableKey: string | null;
}

export async function getDispatchPaymentConfig(): Promise<DispatchPaymentConfig> {
  const response = await api.get('/api/dispatch/payments/config');
  const payload = (response as any)?.data ?? response;
  return {
    enabled: Boolean(payload?.enabled),
    publishableKey: payload?.publishableKey ?? null,
  };
}

export interface CreatePaymentIntentPayload {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  publishableKey?: string;
}

export async function createPaymentIntent(
  payload: CreatePaymentIntentPayload
): Promise<CreatePaymentIntentResponse> {
  const response = await api.post('/api/dispatch/payments/intent', payload);
  const data = (response as any)?.data ?? response;
  return {
    clientSecret: data?.clientSecret,
    paymentIntentId: data?.paymentIntentId,
    publishableKey: data?.publishableKey,
  };
}
