/**
 * Health check Lambda handler
 * Returns a simple hello world response
 */
exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      message: 'Hello from Lambda!',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }),
  };
};

