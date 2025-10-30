# Driver Management API Documentation

## Overview

The Driver Management API provides comprehensive endpoints for managing drivers within active taxi companies. This API allows authorized users (SUPER_ADMIN, OWNER, DISPATCHER) to:

- Fetch active companies eligible for driver registration
- Create new drivers for specific companies
- List and filter existing drivers
- Retrieve detailed driver information

## Base URL

```
http://localhost:8000/api/drivers
```

## Authentication

All endpoints require JWT authentication with appropriate role permissions:
- **SUPER_ADMIN**: Full access to all companies and drivers
- **OWNER**: Access to their own company's drivers
- **DISPATCHER**: Access to assigned company's drivers

Include the JWT token in the Authorization header:
```http
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Get Active Companies

Retrieve a list of active companies that can have drivers created for them.

**Endpoint:** `GET /api/drivers/companies/active`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "comp123",
      "name": "Metro Taxi Company",
      "displayName": "Metro Taxi Company (MTC001)",
      "companyCode": "MTC001",
      "email": "contact@metrotaxi.com",
      "phone": "+1234567890",
      "logo": "https://example.com/logo.png",
      "website": "https://metrotaxi.com",
      "kycStatus": "APPROVED",
      "serviceModes": { "taxi": true, "delivery": false },
      "fleet": {
        "total": 50,
        "active": 45
      },
      "drivers": {
        "active": 30
      },
      "vehicles": {
        "active": 45
      },
      "owner": {
        "id": "owner123",
        "firstName": "John",
        "lastName": "Smith",
        "email": "john@metrotaxi.com",
        "phone": "+1234567890"
      }
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Create New Driver

Create a new driver for a specific active company.

**Endpoint:** `POST /api/drivers`

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "phone": "+1555123456",
  "password": "SecurePass123!",
  "companyId": "comp123",
  "licenseNumber": "DL123456789",
  "licenseExpiryDate": "2025-12-31",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "emergencyContact": {
    "name": "John Doe",
    "phone": "+1555654321",
    "relationship": "Spouse"
  },
  "documents": [
    {
      "type": "DRIVERS_LICENSE",
      "url": "https://example.com/documents/license.pdf"
    },
    {
      "type": "BACKGROUND_CHECK",
      "url": "https://example.com/documents/background.pdf"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Driver created successfully",
  "data": {
    "id": "driver123",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com",
    "phone": "+1555123456",
    "role": "DRIVER",
    "isActive": true,
    "isVerified": false,
    "companyId": "comp123",
    "company": {
      "id": "comp123",
      "legalName": "Metro Taxi Company",
      "companyCode": "MTC001"
    },
    "hireDate": "2024-01-15T10:30:00.000Z",
    "employmentType": "FULL_TIME",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Required Fields:**
- `firstName` (string)
- `lastName` (string) 
- `email` (string, unique)
- `phone` (string, unique)
- `password` (string)
- `companyId` (string, must be active company)

**Optional Fields:**
- `licenseNumber` (string)
- `licenseExpiryDate` (ISO date string)
- `address` (object)
- `emergencyContact` (object)
- `documents` (array of document objects)

### 3. List Drivers

Retrieve a paginated list of drivers with filtering options.

**Endpoint:** `GET /api/drivers`

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10) - Items per page
- `search` (string) - Search in name, email, phone
- `companyId` (string) - Filter by company ID
- `isActive` (boolean) - Filter by active status
- `isVerified` (boolean) - Filter by verification status

**Example:** `GET /api/drivers?page=1&limit=5&search=john&isActive=true`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "driver123",
      "firstName": "Jane",
      "lastName": "Doe",
      "fullName": "Jane Doe",
      "email": "jane.doe@example.com",
      "phone": "+1555123456",
      "avatar": null,
      "isActive": true,
      "isVerified": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "company": {
        "id": "comp123",
        "name": "Metro Taxi Company",
        "companyCode": "MTC001"
      },
      "profile": {
        "employmentType": "FULL_TIME",
        "hireDate": "2024-01-15T10:30:00.000Z",
        "licenseNumber": "DL123456789",
        "licenseExpiry": "2025-12-31T00:00:00.000Z",
        "status": "ACTIVE",
        "backgroundCheckStatus": "PENDING",
        "panicContact": {
          "name": "John Doe",
          "phone": "+1555654321"
        }
      },
      "documents": [
        {
          "id": "doc123",
          "type": "DRIVERS_LICENSE",
          "status": "PENDING",
          "uploadedAt": "2024-01-15T10:30:00.000Z"
        }
      ],
      "stats": {
        "completedRides": 0,
        "totalShifts": 0
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalCount": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

### 4. Get Driver Details

Retrieve detailed information about a specific driver.

**Endpoint:** `GET /api/drivers/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "driver123",
    "firstName": "Jane",
    "lastName": "Doe",
    "fullName": "Jane Doe",
    "email": "jane.doe@example.com",
    "phone": "+1555123456",
    "avatar": null,
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    },
    "preferences": {
      "notifications": {
        "jobOffers": true,
        "statusUpdates": true,
        "earnings": true
      },
      "workPreferences": {
        "maxRadius": 10,
        "acceptanceRate": 85,
        "autoAccept": false
      }
    },
    "rating": null,
    "isActive": true,
    "isVerified": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "company": {
      "id": "comp123",
      "legalName": "Metro Taxi Company",
      "companyCode": "MTC001",
      "email": "contact@metrotaxi.com",
      "phone": "+1234567890"
    },
    "profile": {
      "employmentType": "FULL_TIME",
      "hireDate": "2024-01-15T10:30:00.000Z",
      "licenseNumber": "DL123456789",
      "licenseExpiry": "2025-12-31T00:00:00.000Z",
      "status": "ACTIVE",
      "backgroundCheckStatus": "PENDING",
      "panicContactName": "John Doe",
      "panicContactPhone": "+1555654321"
    },
    "documents": [
      {
        "id": "doc123",
        "type": "DRIVERS_LICENSE",
        "url": "https://example.com/documents/license.pdf",
        "status": "PENDING",
        "uploadedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "recentShifts": [],
    "recentRides": []
  }
}
```

## Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created (for POST requests)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (duplicate email/phone)
- `500` - Internal Server Error

## Usage Examples

### Test the API with curl

1. **Get active companies:**
```bash
curl -X GET "http://localhost:8000/api/drivers/companies/active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

2. **Create a new driver:**
```bash
curl -X POST "http://localhost:8000/api/drivers" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Driver",
    "email": "john.driver@example.com",
    "phone": "+1555987654",
    "password": "SecurePass123!",
    "companyId": "your-company-id"
  }'
```

3. **List drivers:**
```bash
curl -X GET "http://localhost:8000/api/drivers?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Test with Node.js script

Run the included test script:

```bash
# Set your JWT token
export JWT_TOKEN="your-jwt-token-here"

# Run full test suite
node test-driver-api.js

# Run specific tests
node test-driver-api.js companies
node test-driver-api.js create
node test-driver-api.js list
node test-driver-api.js details driver-id
```

## Data Models

### Driver User Model
- Basic user information (name, email, phone, password)
- Role set to 'DRIVER'
- Associated with a company via `companyId`
- Default preferences for notifications and work settings

### Company Driver Profile
- Employment details (type, hire date)
- License information and expiry
- Background check status
- Emergency/panic contact information
- Current status (ACTIVE, INACTIVE, SUSPENDED, TERMINATED)

### Documents
- Support for various document types (DRIVERS_LICENSE, BACKGROUND_CHECK, etc.)
- Upload URLs and verification status
- Timestamp tracking

## Security Considerations

1. **Authentication Required**: All endpoints require valid JWT tokens
2. **Role-Based Access**: Only authorized roles can access driver management
3. **Company Validation**: Drivers can only be created for active, verified companies
4. **Unique Constraints**: Email and phone numbers must be unique across all users
5. **Password Security**: Passwords are hashed using bcrypt
6. **Input Validation**: All inputs are validated and sanitized

## Database Relations

The API maintains proper relationships between:
- Users (drivers) and Companies
- Users and CompanyDriver profiles
- Users and Documents
- Drivers and Rides/Shifts for statistics

## Future Enhancements

Potential improvements for future versions:
- File upload endpoints for documents
- Driver onboarding workflow management
- Performance metrics and ratings
- Shift scheduling and management
- Real-time driver status updates
- Bulk driver operations (import/export)