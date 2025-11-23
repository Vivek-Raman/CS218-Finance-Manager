/**
 * Ingest Lambda handler
 * Receives CSV rows and field mapping, stores CSV in S3, pushes each row to SQS
 */
const AWS = require('aws-sdk');
const crypto = require('crypto');

const sqs = new AWS.SQS();
const s3 = new AWS.S3();
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    
    // Validate required fields
    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Missing or empty rows array',
        }),
      };
    }
    
    if (!body.fieldMapping || !body.fieldMapping.summary || !body.fieldMapping.amount || !body.fieldMapping.timestamp) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Missing required field mapping: summary, amount, and timestamp are required',
        }),
      };
    }
    
    if (!QUEUE_URL) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'SQS queue URL not configured',
        }),
      };
    }
    
    if (!BUCKET_NAME) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'S3 bucket name not configured',
        }),
      };
    }
    
    // Store CSV file in S3
    let s3Key = null;
    if (body.csvContent) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const hash = crypto.createHash('md5').update(body.csvContent).digest('hex').substring(0, 8);
      const fileName = body.csvFileName || 'upload.csv';
      const baseFileName = fileName.replace(/\.[^/.]+$/, '');
      s3Key = `csv-uploads/${timestamp}-${hash}-${baseFileName}.csv`;
      
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: body.csvContent,
        ContentType: 'text/csv',
      }).promise();
    }
    
    // Send each row to SQS
    const sendPromises = body.rows.map((row) => {
      const messageBody = JSON.stringify({
        row: row,
        fieldMapping: body.fieldMapping,
        s3Key: s3Key, // Optional reference to stored CSV file
      });
      
      return sqs.sendMessage({
        QueueUrl: QUEUE_URL,
        MessageBody: messageBody,
      }).promise();
    });
    
    // Wait for all messages to be sent
    await Promise.all(sendPromises);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'CSV rows enqueued successfully',
        rowsEnqueued: body.rows.length,
        s3Key: s3Key,
      }),
    };
  } catch (error) {
    console.error('Error processing ingest request:', error);
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


