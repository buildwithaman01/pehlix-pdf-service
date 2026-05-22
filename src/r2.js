import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const s3Client = new S3Client({
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  },
});

export const R2Service = {
  /**
   * Uploads a buffer to R2 bucket.
   * Key format: labs/${labId}/reports/${reportCode}.pdf
   */
  async uploadBuffer(key, buffer, contentType = 'application/pdf') {
    try {
      const command = new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      await s3Client.send(command);
      return key;
    } catch (error) {
      console.error('R2 uploadBuffer failed:', error);
      throw error;
    }
  }
};

export default R2Service;
