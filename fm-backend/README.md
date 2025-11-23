# Finance Manager Backend

Lambda functions for the Finance Manager application.

## Structure

- `handlers/` - Individual Lambda handler files
  - `health.js` - Health check endpoint
  - `expenses.js` - Expenses management endpoint

## Deployment

These Lambda functions are deployed via OpenTofu infrastructure in the `infra/` directory.

## Adding New Handlers

1. Create a new handler file in `handlers/` directory
2. Export a `handler` function that accepts an `event` parameter
3. Return a response with `statusCode`, `headers`, and `body`
4. Add corresponding resources in `infra/deploy.tf`:
   - Archive file data source
   - Lambda function resource
   - API Gateway integration
   - API Gateway route(s)
   - Lambda permission

