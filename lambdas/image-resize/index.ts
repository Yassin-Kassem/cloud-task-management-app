import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Jimp } from 'jimp';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
const RESIZED_BUCKET = process.env.RESIZED_BUCKET!;

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing: ${bucket}/${key}`);

    try {
      const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const buffer = Buffer.from(await original.Body!.transformToByteArray());

      const image = await Jimp.fromBuffer(buffer);
      image.scaleToFit({ w: 300, h: 300 });
      const resized = await image.getBuffer("image/jpeg", { quality: 80 });

      await s3.send(new PutObjectCommand({
        Bucket: RESIZED_BUCKET,
        Key: key,
        Body: resized,
        ContentType: 'image/jpeg',
      }));

      console.log(`Resized ${key}: ${buffer.length} → ${resized.length} bytes`);
    } catch (error) {
      console.error(`Failed to resize ${key}:`, error);
      throw error;
    }
  }
};
