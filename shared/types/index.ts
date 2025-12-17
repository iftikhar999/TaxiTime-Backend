export type ServiceType = 'TAXI' | 'DELIVERY' | 'COURIER';
export type CourierStopType = 'PICKUP' | 'DROPOFF' | 'RETURN';
export type CourierStopStatus =
  | 'PENDING'
  | 'READY'
  | 'ARRIVED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';
export type ProofType = 'PHOTO' | 'SIGNATURE' | 'PIN' | 'CODE' | 'NOTE';

export interface JobStop {
  id: string;
  jobId: string;
  sequence: number;
  type: CourierStopType;
  status: CourierStopStatus;
  address: string;
  latitude: number;
  longitude: number;
  contactName?: string;
  contactPhone?: string;
  proofRequired: boolean;
  proofType?: ProofType;
  pincode?: string;
  eta?: string;
  arrivedAt?: string;
  completedAt?: string;
}

export interface DeliveryItem {
  name: string;
  qty: number;
  weightGrams?: number;
  price?: number;
}

export interface PricingBreakdown {
  base: number;
  distance: number;
  time: number;
  stopFees?: number;
  surge?: number;
  tax?: number;
}
