# Driver Vehicle Management Scripts

This folder contains utility scripts to manage driver vehicle assignments in the backend.

## Scripts

### 1. Clear Single Driver Vehicle Assignment

Clears the vehicle assignment for a specific driver.

**Usage:**

```bash
node clear-driver-vehicle.js <driver-email>
```

**Example:**

```bash
node clear-driver-vehicle.js driver1@elitecab.com
```

**What it does:**

- Finds the driver by email
- Ends any active shifts (sets status to OFFLINE)
- Removes all vehicle assignments
- Driver will see the vehicle selection screen on next login

---

### 2. Clear ALL Driver Vehicle Assignments

Clears vehicle assignments for ALL drivers in the system.

**Usage:**

```bash
node clear-all-driver-vehicles.js
```

**What it does:**

- Finds all drivers in the system
- Ends all active shifts (sets status to OFFLINE)
- Removes all vehicle assignments
- All drivers will see the vehicle selection screen on next login

**⚠️ Warning:** This affects ALL drivers. Use carefully in production!

---

## When to Use These Scripts

### Testing the Vehicle Selection Screen

When you want to test the vehicle selection flow, run:

```bash
node clear-all-driver-vehicles.js
```

Then login as any driver, and you'll see the vehicle selection screen.

### Reset a Specific Driver

If a driver is stuck or needs to select a different vehicle:

```bash
node clear-driver-vehicle.js driver@example.com
```

### After System Updates

If you've added new vehicles or changed vehicle assignments, you can reset all drivers:

```bash
node clear-all-driver-vehicles.js
```

---

## Database Changes Made

These scripts modify the following:

1. **Shifts Table**

   - Sets `status` to `OFFLINE` for active shifts
   - Sets `endTime` to current timestamp

2. **Assignments Table**
   - Deletes vehicle assignment records

---

## Example Output

```
🚗 Clearing ALL driver vehicle assignments...

📋 Found 12 driver(s):

   1. Michael Brown (driver1@elitecab.com)
   2. Emily Davis (driver2@elitecab.com)
   ...

✅ Ended 1 active shift(s)

ℹ️  No vehicle assignments found

✨ SUCCESS! All driver vehicle assignments cleared.

📱 All drivers will now see the vehicle selection screen on next login.
```

---

## Troubleshooting

### "Driver not found"

- Check that the email is correct
- Ensure the user has role `DRIVER` (not PASSENGER or other role)
- Run `node check-drivers.js` to see all drivers

### "No drivers found"

- Your database might not have any drivers yet
- Run the seed script to create test drivers

### Database Connection Error

- Make sure your `.env` file has correct `DATABASE_URL`
- Check that PostgreSQL is running
- Verify you're in the `/backend` directory

---

## Related Scripts

- `check-drivers.js` - View all drivers in the system
- `check-users.js` - View all users
- `update-vehicles.js` - Manage vehicles

---

## Quick Reference

```bash
# View all drivers
node check-drivers.js

# Clear one driver's vehicle
node clear-driver-vehicle.js driver@example.com

# Clear all drivers' vehicles (for testing)
node clear-all-driver-vehicles.js
```
