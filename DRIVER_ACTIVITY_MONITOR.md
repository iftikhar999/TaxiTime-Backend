# Driver Activity Monitor - Cron Job System

## Overview

Automatic monitoring system that detects inactive drivers and manages their status, shifts, and job assignments.

## Features

### Automatic Driver Offline Detection
- **Runs**: Every minute
- **Threshold**: 10 minutes of no location updates
- **Actions**:
  1. Sets driver status to `OFFLINE`
  2. Ends active shift
  3. Unassigns all active jobs
  4. Emits real-time socket events

### What Jobs Are Unassigned?
Jobs in these statuses are automatically unassigned:
- `ASSIGNED` - Job assigned but driver hasn't accepted
- `OFFERED` - Job offered to driver
- `ACCEPTED` - Driver accepted the job
- `STARTED` - Driver started the job
- `IN_PROGRESS` - Job in progress

### Socket Events Emitted

#### To Driver (inactive driver)
```javascript
'driver:forced_offline'
{
  reason: 'No location update for 10 minutes',
  timestamp: '2025-10-27T12:00:00.000Z',
  unassignedJobs: ['job-id-1', 'job-id-2']
}
```

#### To Dispatch Room
```javascript
'driver:status:changed'
{
  driverId: 'driver-id',
  status: 'OFFLINE',
  reason: 'Inactivity detected',
  timestamp: '2025-10-27T12:00:00.000Z'
}

'job:data:updated'
{
  jobId: 'job-id',
  status: 'UNASSIGNED',
  reason: 'Driver became inactive',
  timestamp: '2025-10-27T12:00:00.000Z'
}
```

## API Endpoints

### Get Cron Jobs Status
```http
GET /api/cron/status
Authorization: Bearer <token>
```

**Required Roles**: `SUPER_ADMIN`, `OWNER`, `DISPATCHER`

**Response**:
```json
{
  "success": true,
  "data": {
    "cronJobs": {
      "driverActivityMonitor": {
        "active": true,
        "schedule": "Every minute (* * * * *)",
        "description": "Monitors driver location updates and sets inactive drivers offline"
      }
    },
    "driverMonitoring": {
      "timestamp": "2025-10-27T12:00:00.000Z",
      "thresholdMinutes": 10,
      "statusCounts": {
        "AVAILABLE": 5,
        "BUSY": 2,
        "OFFLINE": 10
      },
      "driversAtRisk": [
        {
          "id": "driver-id",
          "name": "John Doe",
          "status": "AVAILABLE",
          "lastUpdate": "2025-10-27T11:52:00.000Z"
        }
      ]
    }
  }
}
```

### Manually Trigger Driver Activity Check
```http
POST /api/cron/check-driver-activity
Authorization: Bearer <token>
```

**Required Roles**: `SUPER_ADMIN`, `OWNER`, `DISPATCHER`

**Response**:
```json
{
  "success": true,
  "data": {
    "checked": "2025-10-27T12:00:00.000Z",
    "inactiveCount": 2,
    "processed": [
      {
        "driverId": "driver-id-1",
        "name": "John Doe",
        "previousStatus": "AVAILABLE",
        "lastUpdate": "2025-10-27T11:45:00.000Z",
        "unassignedJobs": [
          {
            "id": "job-id",
            "reference": "JOB-12345",
            "previousStatus": "ASSIGNED"
          }
        ],
        "shiftEnded": true
      }
    ]
  },
  "message": "Checked driver activity. 2 inactive drivers processed."
}
```

## Configuration

### Change Inactivity Threshold
Edit `/backend/services/driverActivityMonitor.js`:
```javascript
const INACTIVITY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
// Change to 5 minutes:
const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;
```

### Change Cron Schedule
Edit `/backend/services/cronManager.js`:
```javascript
// Current: Every minute
cron.schedule('* * * * *', async () => { ... });

// Every 5 minutes:
cron.schedule('*/5 * * * *', async () => { ... });

// Every 15 minutes:
cron.schedule('*/15 * * * *', async () => { ... });
```

### Change Timezone
Edit `/backend/services/cronManager.js`:
```javascript
{
  scheduled: true,
  timezone: "America/New_York" // Change to your timezone
}
```

Common timezones:
- `America/New_York` (EST/EDT)
- `America/Los_Angeles` (PST/PDT)
- `America/Chicago` (CST/CDT)
- `Europe/London` (GMT/BST)
- `Asia/Dubai` (GST)

## Testing

### 1. Start the Server
```bash
cd /Applications/A_B_TAXI/backend
npm start
```

Look for these logs:
```
⏰ Initializing cron jobs...
[Cron Manager] Initializing cron jobs...
[Cron Manager] ✓ Driver Activity Monitor started (runs every minute)
[Cron Manager] Drivers will be set OFFLINE after 10 minutes of inactivity
✓ Cron jobs initialized successfully
```

### 2. Check Monitoring Status
```bash
curl -X GET http://localhost:3000/api/cron/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Simulate Inactive Driver
1. Have a driver go online
2. Stop sending location updates
3. Wait 10 minutes
4. Check driver status - should be OFFLINE
5. Check any assigned jobs - should be UNASSIGNED

### 4. Manually Trigger Check (for testing)
```bash
curl -X POST http://localhost:3000/api/cron/check-driver-activity \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Logs to Monitor

### Successful Check (No Inactive Drivers)
```
[Driver Activity Monitor] Checking driver activity at 2025-10-27T12:00:00.000Z
[Driver Activity Monitor] Threshold: 2025-10-27T11:50:00.000Z
[Driver Activity Monitor] No inactive drivers found
```

### Inactive Drivers Found
```
[Driver Activity Monitor] Checking driver activity at 2025-10-27T12:00:00.000Z
[Driver Activity Monitor] Found 2 inactive drivers
[Driver Activity Monitor] Processing driver driver-id-1 (John Doe)
  - Current status: AVAILABLE
  - Last location update: 2025-10-27T11:45:00.000Z
  - Active jobs: 1
  - Active shifts: 1
  ✓ Set driver driver-id-1 to OFFLINE
  ✓ Ended shift shift-id
  ✓ Unassigned job JOB-12345 (was ASSIGNED)
  ✓ Emitted job:data:updated for job job-id
  ✓ Emitted driver:status:changed for driver driver-id-1
[Driver Activity Monitor] Processed 2 inactive drivers
```

## Files Created/Modified

### New Files
- `/backend/services/driverActivityMonitor.js` - Main monitoring logic
- `/backend/services/cronManager.js` - Cron job orchestration
- `/backend/routes/cron.js` - API endpoints for monitoring
- `/backend/DRIVER_ACTIVITY_MONITOR.md` - This documentation

### Modified Files
- `/backend/server.js` - Added cron initialization on startup

## Dependencies Added
- `node-cron` - For scheduling cron jobs

## Troubleshooting

### Cron not running
**Check**: Are you seeing "✓ Cron jobs initialized successfully" in logs?
**Fix**: Make sure server started with `require.main === module`

### Drivers not being set offline
**Check**: Are location updates being saved with correct timestamps?
**Debug**: Use `/api/cron/status` to see drivers at risk

### Jobs not being unassigned
**Check**: Logs should show "✓ Unassigned job JOB-XXXXX"
**Debug**: Check job status in database, verify socket events emitted

### Socket events not received
**Check**: Is Socket.IO properly initialized?
**Debug**: Check if dispatch room joined, verify driver rooms

## Future Enhancements

Possible additions:
1. **Notification System**: SMS/email to inactive drivers
2. **Grace Period**: Warning notification before forcing offline
3. **Auto-reassign**: Automatically reassign jobs to other drivers
4. **Analytics**: Track driver activity patterns
5. **Configurable Thresholds**: Different thresholds per company
6. **Driver Ratings**: Impact on driver performance metrics

## Support

For issues or questions:
1. Check logs in console
2. Use `/api/cron/status` endpoint
3. Manually trigger check with `/api/cron/check-driver-activity`
4. Review socket events in dispatch panel
