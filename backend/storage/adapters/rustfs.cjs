// S3 兼容存储适配器（基于 @aws-sdk/client-s3）。
// 支持 MinIO、Ceph RGW、AWS S3 等任何兼容 S3 协议的服务。
// 构造函数中自动检测并创建 bucket（HeadBucket → CreateBucket）。
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
} = require('@aws-sdk/client-s3');
const { RUSTFS_CONFIG } = require('../config.cjs');

class RustFSAdapter {
    constructor(options = {}) {
        this.keyPrefix = options.keyPrefix || 'deco_';
        this.client = new S3Client({
            endpoint: RUSTFS_CONFIG.endpoint,
            region: RUSTFS_CONFIG.region,
            credentials: {
                accessKeyId: RUSTFS_CONFIG.accessKey,
                secretAccessKey: RUSTFS_CONFIG.secretKey,
            },
            forcePathStyle: RUSTFS_CONFIG.forcePathStyle,
            tls: RUSTFS_CONFIG.useSSL,
        });
        this.bucket = RUSTFS_CONFIG.bucket;
        this.endpoint = RUSTFS_CONFIG.endpoint;
        this.useSSL = RUSTFS_CONFIG.useSSL;
        this._ensureBucket();
    }

    async _ensureBucket() {
        try {
            await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
            console.log('[RustFS] Bucket 已存在:', this.bucket);
        } catch (err) {
            if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
                await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
                console.log('[RustFS] Bucket 已创建:', this.bucket);
            } else {
                console.warn('[RustFS] Bucket 检查失败:', err.message);
            }
        }
    }

    /**
     * 上传文件
     */
    async upload(buffer, originalName, contentType) {
    try {
        const id = 'deco_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const ext = originalName.includes('.') ? originalName.split('.').pop() : 'webp';
        const key = this.keyPrefix + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;

        console.log('[RustFS] 准备上传:', {
            bucket: this.bucket,
            key: key,
            size: buffer.length,
            endpoint: this.endpoint,
            useSSL: this.useSSL,
        });

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType || 'image/webp',
        });

        const response = await this.client.send(command);
        console.log('[RustFS] 上传响应成功:', {
            ETag: response.ETag,
            VersionId: response.VersionId,
        });

        const url = `${this.useSSL ? 'https' : 'http'}://${this.endpoint.replace(/^https?:\/\//, '')}/${this.bucket}/${key}`;
        return { id, url, key, filename: key };
    } catch (err) {
        console.error('[RustFS] 上传失败:', err);
        throw err; // 重新抛出
    }
}

    /**
     * 获取文件URL
     */
    getUrl(_id, filename) {
        const key = filename || _id + '.webp';
        return `${this.useSSL ? 'https' : 'http'}://${this.endpoint.replace(/^https?:\/\//, '')}/${this.bucket}/${key}`;
    }

    /**
     * 删除文件
     */
    async delete(filename) {
        try {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: filename,
            }));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 检查文件是否存在
     */
    async exists(filename) {
        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: filename,
            }));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 读取文件
     */
    async read(filename) {
        try {
            const response = await this.client.send(new GetObjectCommand({
                Bucket: this.bucket,
                Key: filename,
            }));
            if (!response.Body) return null;
            return Buffer.from(await response.Body.transformToByteArray());
        } catch {
            return null;
        }
    }
}

module.exports = RustFSAdapter;