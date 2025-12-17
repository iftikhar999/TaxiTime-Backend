const Joi = require('joi');

const locationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  address: Joi.string().max(500).required(),
  contactName: Joi.string().max(100).optional(),
  contactPhone: Joi.string().max(20).optional(),
});

const stopSchema = Joi.object({
  type: Joi.string().valid('PICKUP', 'DROPOFF', 'RETURN').required(),
  address: Joi.string().max(500).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  contactName: Joi.string().max(100).optional(),
  contactPhone: Joi.string().max(20).optional(),
  proofRequired: Joi.boolean().default(false),
  proofType: Joi.string().valid('SIGNATURE', 'PHOTO', 'BOTH', 'PIN').optional(),
  pincode: Joi.string().max(10).optional(),
  instructions: Joi.string().max(500).optional(),
});

const itemSchema = Joi.object({
  name: Joi.string().max(200).required(),
  qty: Joi.number().integer().min(1).default(1),
  weightGrams: Joi.number().min(0).optional(),
  volumeCubicCm: Joi.number().min(0).optional(),
  price: Joi.number().min(0).optional(),
});

const jobQuoteSchema = Joi.object({
  companyId: Joi.string().required(),
  serviceType: Joi.string().valid('TAXI', 'DELIVERY', 'COURIER').required(),
  pickupLocation: locationSchema.required(),
  dropoffLocation: locationSchema.required(),
  stops: Joi.array().items(stopSchema).optional(),
  items: Joi.array().items(itemSchema).optional(),
  declaredValue: Joi.number().min(0).default(0),
  priority: Joi.string().valid('STANDARD', 'EXPRESS', 'URGENT', 'SCHEDULED').default('STANDARD'),
  vehicleType: Joi.string().optional(),
  scheduledAt: Joi.date().iso().optional(),
  routeOptimization: Joi.boolean().default(false),
});

const jobCreateSchema = Joi.object({
  companyId: Joi.string().required(),
  serviceType: Joi.string().valid('TAXI', 'DELIVERY', 'COURIER').required(),
  customerId: Joi.string().optional(),
  pickupLocation: locationSchema.required(),
  dropoffLocation: locationSchema.required(),
  stops: Joi.array().items(stopSchema).optional(),
  items: Joi.array().items(itemSchema).optional(),
  pricingProfileId: Joi.string().optional(),
  channel: Joi.string()
    .valid('DISPATCH', 'PASSENGER_APP', 'OWNER_API', 'WEB_WIDGET', 'PHONE')
    .default('DISPATCH'),
  deliveryType: Joi.string().optional(),
  tipAmount: Joi.number().min(0).default(0),
  proofRequired: Joi.boolean().default(false),
  tags: Joi.array().items(Joi.string()).optional(),
  scheduledAt: Joi.date().iso().optional(),
});

module.exports = {
  jobQuoteSchema,
  jobCreateSchema,
  locationSchema,
  stopSchema,
  itemSchema,
};
