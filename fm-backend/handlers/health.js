/**
 * Health check Lambda handler
 * Returns a simple hello world response
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Health check handler invoked', {
    requestId: event.requestContext?.requestId,
    timestamp: new Date().toISOString(),
  });

  try {
    const response = {
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

    const duration = Date.now() - startTime;
    console.log('Health check completed successfully', {
      statusCode: response.statusCode,
      duration: `${duration}ms`,
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Health check handler error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    throw error;
  }
};

