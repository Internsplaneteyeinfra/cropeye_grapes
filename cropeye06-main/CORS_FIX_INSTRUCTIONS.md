# CORS Fix Instructions

## Issue
The `dev-plot.cropeye.ai` API is returning CORS errors because it doesn't send proper CORS headers.

## Solution Implemented
A Vite proxy has been configured to route API requests through the dev server in development mode, avoiding CORS issues.

## Steps to Fix

### 1. Restart Development Server
**IMPORTANT:** You MUST restart your development server for the proxy configuration to take effect.

```bash
# Stop the current dev server (Ctrl+C)
# Then restart it:
npm run dev
```

### 2. Verify Proxy is Working
After restarting, check the browser console. You should see requests going to:
- ✅ `/api/dev-plot/analyze_Growth?...` (proxy URL - should work)
- ❌ NOT `https://cropeye-grapes-admin-production.up.railway.app/analyze_Growth?...` (direct URL - will fail)

### 3. Check Network Tab
In the Network tab, successful requests should show:
- **Request URL:** `http://localhost:5173/api/dev-plot/analyze_Growth?...`
- **Status:** 200 (not CORS error)

## How It Works

### Development Mode (`npm run dev`)
- Requests go to: `/api/dev-plot/analyze_Growth?...`
- Vite proxy forwards to: `https://cropeye-grapes-admin-production.up.railway.app/analyze_Growth?...`
- **No CORS issues** (browser sees same-origin request)

### Production Mode (`npm run build`)
- Requests go directly to: `https://cropeye-grapes-admin-production.up.railway.app/analyze_Growth?...`
- **Will fail with CORS** unless server adds CORS headers
- For production, backend team needs to add:
  ```
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, OPTIONS
  Access-Control-Allow-Headers: Accept, Content-Type
  ```

## Testing

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Open browser and check console:**
   - Look for "Request URL:" logs
   - Should show `/api/dev-plot/...` not `https://cropeye-grapes-admin-production.up.railway.app/...`

3. **Check Network tab:**
   - Requests should show status 200
   - No CORS errors

## Troubleshooting

If you still see CORS errors after restarting:

1. **Verify you're in dev mode:**
   - URL should be `http://localhost:5173` (or similar)
   - Not a production build

2. **Check vite.config.ts:**
   - Proxy configuration should be present (lines 131-155)

3. **Clear browser cache:**
   - Hard refresh (Ctrl+Shift+R)
   - Or clear cache and reload

4. **Check console logs:**
   - Look for "Request URL:" - should show proxy path

## Current Status
✅ Proxy configuration added to `vite.config.ts`
✅ All fetch functions updated to use conditional URLs
⏳ **Waiting for dev server restart to activate proxy**
