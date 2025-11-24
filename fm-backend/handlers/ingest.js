/**
 * Ingest Lambda handler
 * Receives CSV file and field mapping, stores CSV in S3, pushes each row to SQS
 */
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const Busboy = require('busboy');
const { parse } = require('csv-parse/sync');

const sqs = new SQSClient({});
const s3 = new S3Client({});
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Extract Cognito user ID from API Gateway event
 * Returns userId or null if not found
 */
function getUserId(event) {
  // JWT authorizer provides claims in requestContext.authorizer.claims
  const claims = event.requestContext?.authorizer?.claims;
  if (claims && claims.sub) {
    return claims.sub;
  }
  
  // Fallback: try to extract from JWT token directly if available
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.sub) {
        return payload.sub;
      }
    } catch (error) {
      // Ignore parsing errors
    }
  }
  
  return null;
}

/**
 * Apply field mapping to transform CSV row
 */
function applyMapping(row, fieldMapping) {
  return {
    summary: row[fieldMapping.summary] || '',
    amount: row[fieldMapping.amount] || '',
    timestamp: row[fieldMapping.timestamp] || '',
  };
}

/**
 * Parse multipart/form-data from Lambda event
 */
function parseMultipartFormData(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return reject(new Error('Content-Type must be multipart/form-data'));
    }

    const body = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf8');

    // Normalize headers for busboy (lowercase keys)
    const headers = {};
    for (const [key, value] of Object.entries(event.headers)) {
      headers[key.toLowerCase()] = value;
    }

    const busboy = Busboy({ headers });
    const fields = {};
    const files = {};
    const filePromises = [];
    let isFinished = false;

    busboy.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];
      
      const filePromise = new Promise((resolveFile) => {
        file.on('data', (data) => {
          chunks.push(data);
        });

        file.on('end', () => {
          files[name] = {
            filename,
            encoding,
            mimeType,
            buffer: Buffer.concat(chunks),
          };
          resolveFile();
        });
      });
      
      filePromises.push(filePromise);
    });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('finish', async () => {
      isFinished = true;
      // Wait for all files to be fully read
      await Promise.all(filePromises);
      resolve({ fields, files });
    });

    busboy.on('error', (error) => {
      reject(error);
    });

    busboy.write(body);
    busboy.end();
  });
}

exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Ingest handler invoked', {
    requestId: event.requestContext?.requestId,
    timestamp: new Date().toISOString(),
  });

  // Extract user ID from event
  const userId = getUserId(event);
  if (!userId) {
    console.warn('Unauthorized: No user ID found in request');
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        message: 'Unauthorized: User authentication required',
      }),
    };
  }

  try {
    // Parse multipart/form-data
    let parsedData;
    try {
      parsedData = await parseMultipartFormData(event);
    } catch (parseError) {
      console.error('Error parsing multipart/form-data', {
        error: parseError.message,
        contentType: event.headers['content-type'] || event.headers['Content-Type'],
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Invalid request format. Expected multipart/form-data.',
          error: parseError.message,
        }),
      };
    }

    const { fields, files } = parsedData;
    
    // Extract form fields
    const csvFile = files.csvFile;
    const fieldMappingJson = fields.fieldMapping;

    if (!csvFile) {
      console.warn('Validation failed: missing CSV file');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Missing CSV file',
        }),
      };
    }

    let fieldMapping;
    try {
      fieldMapping = JSON.parse(fieldMappingJson);
    } catch (parseError) {
      console.error('Error parsing JSON fields', { error: parseError.message });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Invalid JSON in form fields',
          error: parseError.message,
        }),
      };
    }

    // Parse CSV file
    let rows;
    try {
      const csvContent = csvFile.buffer.toString('utf8');
      rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (parseError) {
      console.error('Error parsing CSV file', { error: parseError.message });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Error parsing CSV file',
          error: parseError.message,
        }),
      };
    }

    console.log('Parsed request data', {
      hasRows: !!rows,
      rowCount: rows?.length || 0,
      hasFieldMapping: !!fieldMapping,
      hasCsvFile: !!csvFile,
      csvFileName: csvFile.filename,
      csvFileSize: csvFile.buffer.length,
      userId: userId,
    });
    
    // Validate required fields
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      console.warn('Validation failed: missing or empty rows array');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Missing or empty rows array',
        }),
      };
    }
    
    if (!fieldMapping || !fieldMapping.summary || !fieldMapping.amount || !fieldMapping.timestamp) {
      console.warn('Validation failed: missing required field mapping', {
        hasFieldMapping: !!fieldMapping,
        mappingKeys: fieldMapping ? Object.keys(fieldMapping) : [],
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Missing required field mapping: summary, amount, and timestamp are required',
        }),
      };
    }
    
    if (!QUEUE_URL) {
      console.error('SQS queue URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'SQS queue URL not configured',
        }),
      };
    }
    
    if (!BUCKET_NAME) {
      console.error('S3 bucket name not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'S3 bucket name not configured',
        }),
      };
    }
    
    // Store CSV file in S3
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = crypto.createHash('md5').update(csvFile.buffer).digest('hex').substring(0, 8);
    const fileName = csvFile.filename || 'upload.csv';
    const baseFileName = fileName.replace(/\.[^/.]+$/, '');
    const s3Key = `csv-uploads/${timestamp}-${hash}-${baseFileName}.csv`;
    
    console.log('Uploading CSV file to S3', {
      bucket: BUCKET_NAME,
      key: s3Key,
      fileSize: csvFile.buffer.length,
      fileName: csvFile.filename,
    });
    
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: csvFile.buffer,
      ContentType: csvFile.mimeType || 'text/csv',
    }));
    
    console.log('CSV file uploaded to S3 successfully', { s3Key: s3Key });
    
    // Send each row to SQS
    console.log('Sending rows to SQS', {
      queueUrl: QUEUE_URL,
      rowCount: rows.length,
      queueUrlSet: !!QUEUE_URL,
    });
    
    const sendPromises = rows.map((row, index) => {
      // Apply field mapping to get only the mapped fields
      const mapped = applyMapping(row, fieldMapping);
      
      const messageBody = JSON.stringify({
        userId: userId,
        summary: mapped.summary,
        amount: mapped.amount,
        timestamp: mapped.timestamp,
        s3Key: s3Key, // Optional reference to stored CSV file
      });
      
      const messageSize = Buffer.byteLength(messageBody, 'utf8');
      const maxMessageSize = 256 * 1024; // SQS limit is 256KB
      
      // Validate message size before sending
      if (messageSize > maxMessageSize) {
        console.error(`Message too large for row ${index + 1}`, {
          rowIndex: index,
          messageSize: messageSize,
          maxSize: maxMessageSize,
          mappedPreview: JSON.stringify(mapped).substring(0, 200),
        });
        return Promise.reject(new Error(`Message for row ${index + 1} exceeds SQS size limit: ${messageSize} bytes (max: ${maxMessageSize} bytes)`));
      }
      
      return sqs.send(new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: messageBody,
      })).then((result) => {
        // Successful send returns AWS SDK response
        return { success: true, index, result };
      }).catch((error) => {
        // Failed send returns error details
        return { 
          success: false, 
          index, 
          error: error.message || error.toString() || 'Unknown error',
          errorCode: error.Code || error.$metadata?.httpStatusCode || error.code,
          errorName: error.name || error.constructor?.name
        };
      });
    });
    
    // Wait for all messages to be sent (using allSettled to handle partial failures)
    const results = await Promise.allSettled(sendPromises);
    
    // Analyze results - since we catch errors, all promises should fulfill
    const processedResults = results.map((r, idx) => {
      if (r.status === 'rejected') {
        return { 
          success: false, 
          index: idx, 
          error: r.reason?.message || r.reason?.toString() || 'Unknown error',
          errorCode: r.reason?.Code || r.reason?.$metadata?.httpStatusCode || r.reason?.code
        };
      }
      return r.value;
    });
    
    const successful = processedResults.filter(r => r?.success === true).length;
    const failed = processedResults.filter(r => r?.success === false).length;
    
    if (failed > 0) {
      const failures = processedResults
        .filter(r => r?.success === false)
        .map(r => ({ index: r.index, error: r.error || 'Unknown error', errorCode: r.errorCode }));
      
      console.error('Some SQS messages failed to send', {
        totalRows: rows.length,
        successful: successful,
        failed: failed,
        failures: failures,
      });
      
      // If all messages failed, throw error
      if (successful === 0) {
        throw new Error(`All ${rows.length} SQS messages failed to send. First error: ${failures[0]?.error}`);
      }
      
      // If some failed, log warning but continue
      console.warn(`Partial failure: ${failed} out of ${rows.length} messages failed to send`);
    }
    
    const duration = Date.now() - startTime;
    const allSuccessful = successful === rows.length;
    
    console.log(allSuccessful ? 'Ingest completed successfully' : 'Ingest completed with partial failures', {
      totalRows: rows.length,
      rowsEnqueued: successful,
      rowsFailed: failed,
      s3Key: s3Key,
      userId: userId,
      duration: `${duration}ms`,
    });
    
    return {
      statusCode: allSuccessful ? 200 : 207, // 207 Multi-Status for partial success
      headers,
      body: JSON.stringify({
        message: allSuccessful 
          ? 'CSV rows enqueued successfully' 
          : `Partially successful: ${successful} of ${rows.length} rows enqueued`,
        rowsEnqueued: successful,
        rowsFailed: failed,
        totalRows: rows.length,
        s3Key: s3Key,
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error processing ingest request', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message,
      }),
    };
  }
};


