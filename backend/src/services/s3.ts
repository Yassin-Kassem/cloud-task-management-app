import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, S3_BUCKETS } from '../config/aws';

export class S3Service {
  /**
   * Upload a file to the originals bucket.
   * Key format: tasks/{taskId}/{filename}
   */
  static async upload(
    taskId: string,
    filename: string,
    body: Buffer,
    contentType: string
  ): Promise<{ key: string; versionId?: string }> {
    const key = `tasks/${taskId}/${filename}`;

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKETS.ORIGINALS,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return { key, versionId: result.VersionId };
  }

  /**
   * Delete an object from the originals bucket by key.
   */
  static async delete(key: string): Promise<void> {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKETS.ORIGINALS,
        Key: key,
      })
    );
  }

  /**
   * Get a presigned URL for viewing an image from the originals bucket.
   */
  static async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKETS.ORIGINALS,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Get a presigned URL for a thumbnail from the resized bucket.
   */
  static async getThumbnailUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKETS.RESIZED,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * List all versions of an object (for image history).
   */
  static async listVersions(
    key: string
  ): Promise<Array<{ versionId: string; lastModified: Date; isLatest: boolean }>> {
    const result = await s3Client.send(
      new ListObjectVersionsCommand({
        Bucket: S3_BUCKETS.ORIGINALS,
        Prefix: key,
      })
    );

    if (!result.Versions) return [];

    return result.Versions.filter((v) => v.Key === key).map((v) => ({
      versionId: v.VersionId || '',
      lastModified: v.LastModified || new Date(),
      isLatest: v.IsLatest || false,
    }));
  }
}
