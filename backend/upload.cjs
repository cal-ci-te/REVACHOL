// ！贴图上传处理
// 接收 base64 JSON（前端已压成 WebP），解码后交 StorageService 落盘并写入 decos 表。
// 未走通用 JSON 解析是因为请求体可能很大（base64 常超 100KB），此处流式累积以避免阻塞。
// 安全约束：解码后按文件头签名校验，防止非图片内容绕过前端校验直接上传。
const { storage } = require('./storage/index.cjs');
const { broadcast } = require('./websocket.cjs');
const dbModule = require('./db.cjs');
const { validate } = require('./validate.cjs');

// 各格式的文件头签名
// WebP 需两段校验：偏移 0 为 RIFF、偏移 8 为 WEBP；只看前者会把任意 RIFF 文件误判为图片
const SIGNATURES = [
  { ext: 'PNG',  offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] },
  { ext: 'JPEG', offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  { ext: 'WebP', offset: 0, bytes: [0x52, 0x49, 0x46, 0x46],
    and: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
];

// 按文件头判断是否为受支持的图片格式
function validateImageFormat(buffer) {
  return SIGNATURES.some(sig => {
    const main = sig.bytes.every((b, i) => buffer[i + sig.offset] === b);
    if (!main) return false;
    if (sig.and) return sig.and.bytes.every((b, i) => buffer[i + sig.and.offset] === b);
    return true;
  });
}

function handleDecoUpload(req, res) {
    console.log('[Upload] 收到上传请求');

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
        console.log('[Upload] 请求体接收完毕，长度:', body.length);
        try {
            const data = JSON.parse(body);
            const { name, base64 } = data;
            console.log('[Upload] 接收到的 name:', name);
            console.log('[Upload] base64 长度:', base64 ? base64.length : '无');

            if (!base64) {
                console.warn('[Upload] base64 为空');
                res.writeHead(400);
                res.end('No image data');
                return;
            }

            // 前端可能带 data:image/...;base64, 前缀，解码前先剥离
            const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            console.log('[Upload] 图片 Buffer 长度:', imageBuffer.length);

            if (imageBuffer.length === 0) {
                console.warn('[Upload] 图片 Buffer 为空');
                res.writeHead(400);
                res.end('Invalid image data');
                return;
            }

            // 文件头校验先于落盘：不合规内容不应进入存储层
            if (!validateImageFormat(imageBuffer)) {
                console.warn('[Upload] 文件头校验失败，非图片格式');
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid image format', message: '仅支持 PNG、JPEG、WebP 格式' }));
                return;
            }

            // 名称缺省给默认值，长度校验统一交给 validate
            const savedName = name || '未命名贴纸';

            const nameErr = validate({ name: savedName });
            if (nameErr) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: nameErr.error }));
                return;
            }

            // 统一以 .webp 存盘：前端上传前已转为 WebP
            const filename = savedName + '.webp';

            console.log('[Upload] 准备调用 storage.upload，文件名:', filename);

            // 先落存储再写库：存储失败即中断，避免留下指向不存在文件的数据库记录
            const result = await storage.upload(imageBuffer, filename, 'image/webp');
            console.log('[Upload] storage.upload 返回结果:', result);

            dbModule.run(
                'INSERT INTO decos (id, name, style, image_path) VALUES (?, ?, ?, ?)',
                [result.id, savedName, 'fixed', result.key]
            );

            // 广播新贴图：payload 里的 dataUrl 与响应体保持一致，前端可直接渲染
            broadcast({
                type: 'deco_created',
                payload: {
                    id: result.id,
                    name: savedName,
                    position: null,
                    style: 'fixed',
                    dataUrl: `/api/decos/${result.id}/image`,
                },
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: result.id,
                dataUrl: `/api/decos/${result.id}/image`,
                name: savedName,
            }));
        } catch (err) {
            console.error('[Upload] 处理失败:', err);
            console.error('[Upload] 错误堆栈:', err.stack);
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    });

    req.on('error', (err) => {
        console.error('[Upload] 请求错误:', err);
        res.writeHead(500);
        res.end('Internal Server Error');
    });
}

module.exports = { handleDecoUpload };