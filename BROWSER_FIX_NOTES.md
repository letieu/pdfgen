# PDF Generator - Browser Instance Management Fix

## Problem
The service was experiencing `Target.createTarget` timeout errors due to keeping a single browser instance running indefinitely. This approach led to:
- Resource leaks and memory issues over time
- Stale browser connections
- Timeout errors when creating new pages
- Browser instability after long periods of inactivity

## Solution
Switched from a **persistent browser instance** to a **fresh browser per request** approach.

### Key Changes

#### 1. Removed Global Browser Instance
- **Before**: Single browser instance shared across all requests
- **After**: Fresh browser instance created for each request and properly disposed

#### 2. Simplified Request Flow
```javascript
// Old approach - shared browser with retry logic
browserInstance = await puppeteer.launch()  // Once at startup
page = await browserInstance.newPage()     // For each request (could fail)

// New approach - fresh browser per request
browser = await createBrowserInstance()     // For each request
page = await browser.newPage()              // Always works
await browser.close()                       // Clean disposal
```

#### 3. Better Resource Management
- Each request gets a clean browser instance
- Browser is always closed in the `finally` block
- No stale connections or zombie processes
- Reduced concurrency limit from 5 to 3 (since each task uses more resources)

#### 4. Enhanced Configuration
- Updated to use `headless: 'new'` (latest Puppeteer headless mode)
- Increased `protocolTimeout` to 120 seconds (2 minutes)
- Kept all essential Chrome args for stability

### Benefits

✅ **No more timeout errors** - Fresh browser always responds
✅ **Better resource cleanup** - No memory leaks from long-running browsers
✅ **Improved reliability** - Each request is isolated
✅ **Simpler code** - Removed complex retry logic
✅ **Easier debugging** - Each request has its own browser lifecycle

### Trade-offs

⚠️ **Slightly higher resource usage** - Browser startup overhead per request
⚠️ **Reduced concurrency** - Limited to 3 concurrent tasks (vs 5 pages before)

However, these trade-offs are worth it for the improved reliability and stability.

### Configuration

The concurrency limit can be adjusted based on your server capacity:

```javascript
const MAX_CONCURRENT_TASKS = 3; // Adjust based on server resources
```

### Monitoring

The service logs provide visibility into operations:
- `Processing PDF (active: X, queued: Y)` - Shows current load
- `Launching new browser instance...` - Browser creation
- `PDF generated successfully` - Successful completion
- `Browser instance closed` - Proper cleanup

## Testing

Tested with:
1. Single request - ✅ Works correctly
2. Concurrent requests (5 simultaneous) - ✅ Queue management works
3. Resource cleanup - ✅ All browsers properly closed

## Deployment

No changes needed for deployment. The service works the same way from the outside, just more reliably internally.
