function flag(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return String(raw).toLowerCase() === 'true' || raw === '1';
}

function isEnabled(name, defaultValue = true) {
  return flag(name, defaultValue);
}

module.exports = {
  FEATURE_V2_SERVICES: flag('FEATURE_V2_SERVICES', true),
  FEATURE_POD: flag('FEATURE_POD', true),
  FEATURE_COURIER_OPTIMIZE: flag('FEATURE_COURIER_OPTIMIZE', true),
  FEATURE_MERCHANT_PORTAL: flag('FEATURE_MERCHANT_PORTAL', true),
  FEATURE_SURGE_PRICING: flag('FEATURE_SURGE_PRICING', true),
  FEATURE_RATE_LIMITS_V2: flag('FEATURE_RATE_LIMITS_V2', true),
  FEATURE_BACKGROUND_LOCATION_ENFORCE: flag('FEATURE_BACKGROUND_LOCATION_ENFORCE', true),
  isEnabled,
};
