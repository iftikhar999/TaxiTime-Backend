import React from 'react';
import { SERVICE_TYPES } from '../../services/v2/jobService';

const SERVICE_TYPE_CONFIG = {
  TAXI: { label: 'Taxi', icon: '🚕', color: '#FFD700', description: 'Passenger transport' },
  DELIVERY: { label: 'Delivery', icon: '📦', color: '#4CAF50', description: 'Food & packages' },
  COURIER: { label: 'Courier', icon: '🏃', color: '#2196F3', description: 'Multi-stop delivery' },
};

export const ServiceTypeSelector = ({
  value,
  onChange,
  disabled = false,
  showAll = true,
  allowedTypes = Object.keys(SERVICE_TYPES),
  variant = 'buttons',
}) => {
  const types = showAll ? ['ALL', ...allowedTypes] : allowedTypes;

  if (variant === 'dropdown') {
    return (
      <select
        value={value || 'ALL'}
        onChange={(e) => onChange(e.target.value === 'ALL' ? null : e.target.value)}
        disabled={disabled}
        className="service-type-dropdown"
        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}
      >
        {showAll && <option value="ALL">All Services</option>}
        {allowedTypes.map((type) => (
          <option key={type} value={type}>
            {SERVICE_TYPE_CONFIG[type]?.icon} {SERVICE_TYPE_CONFIG[type]?.label || type}
          </option>
        ))}
      </select>
    );
  }

  if (variant === 'tabs') {
    return (
      <div className="service-type-tabs" style={{ display: 'flex', borderBottom: '2px solid #eee' }}>
        {types.map((type) => {
          const config = SERVICE_TYPE_CONFIG[type] || {};
          const isSelected = (type === 'ALL' && !value) || value === type;
          return (
            <button
              key={type}
              onClick={() => onChange(type === 'ALL' ? null : type)}
              disabled={disabled}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                borderBottom: isSelected ? `2px solid ${config.color || '#333'}` : '2px solid transparent',
                marginBottom: '-2px',
                fontWeight: isSelected ? 'bold' : 'normal',
                color: isSelected ? config.color || '#333' : '#666',
              }}
            >
              {config.icon || '📋'} {config.label || type}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="service-type-selector" style={{ display: 'flex', gap: '8px' }}>
      {types.map((type) => {
        const config = SERVICE_TYPE_CONFIG[type] || {};
        const isSelected = (type === 'ALL' && !value) || value === type;
        return (
          <button
            key={type}
            onClick={() => onChange(type === 'ALL' ? null : type)}
            disabled={disabled}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: isSelected ? `2px solid ${config.color || '#333'}` : '1px solid #ddd',
              background: isSelected ? `${config.color || '#333'}20` : '#fff',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '80px',
            }}
          >
            <span style={{ fontSize: '24px' }}>{config.icon || '📋'}</span>
            <span style={{ fontSize: '12px', marginTop: '4px' }}>{config.label || type}</span>
          </button>
        );
      })}
    </div>
  );
};

export const ServiceTypeBadge = ({ serviceType, size = 'medium' }) => {
  const config = SERVICE_TYPE_CONFIG[serviceType] || { label: serviceType, icon: '📋', color: '#999' };
  const sizes = {
    small: { fontSize: '10px', padding: '2px 6px' },
    medium: { fontSize: '12px', padding: '4px 8px' },
    large: { fontSize: '14px', padding: '6px 12px' },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: `${config.color}20`,
        color: config.color,
        borderRadius: '4px',
        fontWeight: 'bold',
        ...sizes[size],
      }}
    >
      {config.icon} {config.label}
    </span>
  );
};

export default ServiceTypeSelector;
