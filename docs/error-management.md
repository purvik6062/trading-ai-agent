# Error Management System

The Trading AI Agent now includes a sophisticated error management system that prevents console flooding and provides better visibility into error patterns.

## Problem Solved

Previously, CoinGecko API errors and other frequent errors would flood the console, making it difficult to see important logs and debug issues.

## Solution

### 1. Smart Error Rate Limiting

- **First occurrence**: Always logged normally
- **Subsequent errors**: Rate-limited to 3 similar errors per minute
- **Suppression**: After rate limit exceeded, errors are suppressed with periodic summaries
- **Recovery**: After suppression window (1 minute), normal logging resumes

### 2. Error Categorization

Errors are grouped by unique keys to identify patterns:

- `coingecko-getTokenPrice-ethereum` - CoinGecko price fetch errors for specific tokens
- `coingecko-getMultipleTokenPrices` - Bulk price fetch errors
- `coingecko-searchToken-ETH` - Token search errors

### 3. Automatic Cleanup

- Old error counts are automatically cleaned every 10 minutes
- Errors older than 30 minutes are removed from memory

## Usage

### Command Line Tools

1. **Interactive Error Manager**

   ```bash
   npm run errors
   ```

2. **Quick Commands**

   ```bash
   npm run errors:summary    # View error summary
   npm run errors:stats      # View detailed statistics
   npm run errors:cleanup    # Cleanup errors older than 60 minutes
   npm run errors:cleanup:30 # Cleanup errors older than 30 minutes
   ```

3. **Direct Commands**

   ```bash
   # Summary only
   node scripts/view-errors.js summary

   # Detailed stats
   node scripts/view-errors.js stats

   # Cleanup with custom time
   node scripts/view-errors.js cleanup 45
   ```

### API Endpoints

1. **Error Summary**

   ```
   GET /admin/errors/summary
   ```

2. **Detailed Statistics**

   ```
   GET /admin/errors/stats
   ```

3. **Cleanup Old Errors**
   ```
   POST /admin/errors/cleanup
   Body: { "olderThanMinutes": 60 }
   ```

### Health Check Integration

The health check endpoint now includes error statistics:

```
GET /health
```

Returns:

```json
{
  "status": "healthy",
  "errorStats": {
    "totalUniqueErrors": 5,
    "totalSuppressed": 147,
    "recentErrors": [
      {
        "key": "coingecko-getTokenPrice-ethereum",
        "count": 45,
        "suppressed": 89
      }
    ]
  }
}
```

## Configuration

The error manager can be configured in `src/utils/errorManager.ts`:

```typescript
export const errorManager = new ErrorManager({
  maxErrorsPerMinute: 3, // Allow 3 similar errors per minute
  maxSuppressedErrors: 50, // Show summary every 50 suppressed errors
  suppressionDuration: 60000, // 1 minute suppression window
});
```

## Log Format

### Normal Errors

```
[FIRST] coingecko-getTokenPrice-ethereum: Request failed with status code 429
[2x] coingecko-getTokenPrice-ethereum: Request failed with status code 429
[3x] coingecko-getTokenPrice-ethereum: Request failed with status code 429
```

### Suppressed Errors

```
[SUPPRESSED] coingecko-getTokenPrice-ethereum: Error repeated too frequently - suppressing similar errors
Total: 153 errors, Suppressed: 150, First: 2024-01-15 10:30:00, Last: 2024-01-15 10:45:00
```

### Recovery

```
[RESUMED] coingecko-getTokenPrice-ethereum: Error suppression window ended - resuming normal logging
```

## Benefits

1. **Cleaner Console**: No more error flooding
2. **Pattern Recognition**: Easily identify problematic services
3. **Performance**: Reduced log volume improves performance
4. **Debugging**: Important logs are no longer buried in error spam
5. **Monitoring**: Error statistics help track system health

## Integration with Services

The following services now use smart error logging:

- CoinGecko Service (all API errors)
- Position Persistence Service
- Multi-User Signal Service
- Rate Limit Service
- MongoDB Services

To add error management to other services:

```typescript
import { errorManager } from "../utils/errorManager";

// Instead of:
logger.error("API call failed", error);

// Use:
errorManager.logError("api-service-endpoint", error, {
  context: "additional info",
});
```

## Best Practices

1. **Error Keys**: Use descriptive, consistent error keys
2. **Context**: Include relevant context information
3. **Monitoring**: Check error stats regularly
4. **Cleanup**: Run cleanup periodically in production
5. **Thresholds**: Adjust rate limits based on your needs
