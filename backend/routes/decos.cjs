// 贴图路由：元数据存 SQLite，图片文件通过 StorageService 独立存储。
// GET /api/decos/:id/image 直接从适配器读取二进制返回，不经过 JSON 序列化。
// 写操作（PUT/DELETE）通过 requireAuth 包装器保护，GET 保持公开。
const { send, sendError, json } = require('../enhance.cjs'); 
const { storage } = require('../storage/index.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { requireAuth } = require('../auth.cjs');

function registerDecoRoutes(GET, PUT, DELETE) {

    GET('/api/decos', async (req, res) => {
        console.log('[GET /api/decos] 开始查询贴图列表');
        try {
            const rows = dbModule.queryAll('SELECT id, name, position, style, image_path FROM decos');
            console.log('[GET /api/decos] 查询到', rows.length, '条记录');
            const result = rows.map(row => ({
                id: row.id,
                name: row.name,
                position: row.position ? JSON.parse(row.position) : null,
                style: row.style,
                dataUrl: `/api/decos/${row.id}/image`,
            }));
            console.log('[GET /api/decos] 返回数据:', result.length, '项');
            send(res, result);
        } catch (err) {
            console.error('[GET /api/decos] 错误:', err);
            sendError(res, 500, err.message);
        }
    });

    GET('/api/decos/:id/image', async (req, res) => {
        const id = req.params.id;
        console.log('[GET /api/decos/:id/image] 请求图片 ID:', id);

        try {
            const row = dbModule.query('SELECT image_path FROM decos WHERE id = ?', [id]);
            if (!row || !row.image_path) {
                console.log('[GET /api/decos/:id/image] ❌ 图片不存在, ID:', id);
                sendError(res, 404, 'Image not found');
                return;
            }

            // 提取文件名
            const filename = row.image_path.includes('/') 
                ? row.image_path.split('/').pop() 
                : row.image_path;

            let buffer = await storage.read(filename);
            
            // 如果 RustFS 没找到，尝试从本地读取（兼容旧数据）
            if (!buffer && !storage.isLocal()) {
                console.log('[GET /api/decos/:id/image] RustFS 未找到，尝试本地读取');
                const LocalAdapter = require('../storage/adapters/local.cjs');
                const local = new LocalAdapter();
                buffer = await local.read(filename);
            }

            if (buffer) {
                console.log('[GET /api/decos/:id/image] ✅ 图片读取成功，大小:', buffer.length);
                res.writeHead(200, {
                    'Content-Type': 'image/webp',
                    'Cache-Control': 'public, max-age=31536000',
                });
                res.end(buffer);
                return;
            }

            console.log('[GET /api/decos/:id/image] ❌ 图片不存在, ID:', id);
            sendError(res, 404, 'Image not found');
        } catch (err) {
            console.error('[GET /api/decos/:id/image] ❌ 获取图片错误:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Database error' }));
        }
    });

    PUT('/api/decos/:id', requireAuth(async (req, res) => {
        const id = req.params.id;
        console.log('[PUT /api/decos/:id] ===== 开始处理 =====');
        console.log('[PUT /api/decos/:id] 接收到的 id:', id, '类型:', typeof id);
        
        // 验证 id
        if (!id) {
            console.log('[PUT /api/decos/:id] ❌ id 为空');
            sendError(res, 400, 'Missing id');
            return;
        }

        try {
            // 1. 检查贴图是否存在
            console.log('[PUT /api/decos/:id] 检查贴图是否存在:', id);
            const existing = dbModule.query('SELECT id, image_path FROM decos WHERE id = ?', [id]);
            console.log('[PUT /api/decos/:id] 查询结果:', existing);
            
            if (!existing) {
                console.log('[PUT /api/decos/:id] ❌ 贴图不存在');
                sendError(res, 404, 'Deco not found');
                return;
            }

            // 2. 解析请求体
            console.log('[PUT /api/decos/:id] 解析请求体...');
            const updates = await json(req);
            console.log('[PUT /api/decos/:id] 更新数据:', JSON.stringify(updates, null, 2));

            // 3. 构建更新 SQL
            const fields = [];
            const values = [];
            
            if (updates.name !== undefined) {
                fields.push('name = ?');
                values.push(updates.name);
                console.log('[PUT /api/decos/:id] 更新 name:', updates.name);
            }
            
            if (updates.position !== undefined) {
                const positionStr = JSON.stringify(updates.position);
                fields.push('position = ?');
                values.push(positionStr);
                console.log('[PUT /api/decos/:id] 更新 position:', positionStr);
            }
            
            if (updates.style !== undefined) {
                fields.push('style = ?');
                values.push(updates.style);
                console.log('[PUT /api/decos/:id] 更新 style:', updates.style);
            }

            // 如果更新了 dataUrl，意味着要更新图片
            if (updates.dataUrl) {
                console.log('[PUT /api/decos/:id] 检测到 dataUrl 更新，处理图片...');
                try {
                    const base64Data = updates.dataUrl.replace(/^data:image\/\w+;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    console.log('[PUT /api/decos/:id] 图片 Buffer 大小:', buffer.length);
                    
                    // 获取原文件名
                    const oldFilename = existing.image_path ? existing.image_path.split('/').pop() : null;
                    console.log('[PUT /api/decos/:id] 旧文件名:', oldFilename);
                    
                    // 上传新图片
                    const result = await storage.upload(buffer, 'update.webp', 'image/webp');
                    console.log('[PUT /api/decos/:id] 上传成功，新 key:', result.key);
                    
                    // 删除旧文件
                    if (oldFilename) {
                        console.log('[PUT /api/decos/:id] 删除旧文件:', oldFilename);
                        await storage.delete(oldFilename);
                    }
                    
                    fields.push('image_path = ?');
                    values.push(result.key);
                    console.log('[PUT /api/decos/:id] image_path 更新为:', result.key);
                } catch (err) {
                    console.error('[PUT /api/decos/:id] ❌ 图片处理失败:', err);
                    sendError(res, 500, 'Image processing failed: ' + err.message);
                    return;
                }
            }

            // 4. 检查是否有字段需要更新
            if (fields.length === 0) {
                console.log('[PUT /api/decos/:id] ⚠️ 没有字段需要更新');
                sendError(res, 400, 'No fields to update');
                return;
            }

            // 5. 执行更新
            values.push(id);
            const sql = 'UPDATE decos SET ' + fields.join(', ') + ' WHERE id = ?';
            console.log('[PUT /api/decos/:id] 执行 SQL:', sql);
            console.log('[PUT /api/decos/:id] 参数:', values);
            
            const result = dbModule.exec(sql, values);
            console.log('[PUT /api/decos/:id] 更新结果:', result);
            
            if (result.changes === 0) {
                console.log('[PUT /api/decos/:id] ⚠️ 没有行被更新');
                sendError(res, 404, 'Deco not found or no changes');
                return;
            }

            // 6. 广播变更
            console.log('[PUT /api/decos/:id] 广播变更事件');
            broadcast({ 
                type: 'deco_updated', 
                payload: { id, ...updates } 
            });

            // 7. 返回成功响应
            console.log('[PUT /api/decos/:id] ✅ 更新成功');
            send(res, { 
                success: true, 
                message: 'Deco updated successfully',
                id: id,
                updated: updates
            });

        } catch (err) {
            console.error('[PUT /api/decos/:id] ❌ 处理失败:', err);
            console.error('[PUT /api/decos/:id] 错误堆栈:', err.stack);
            send(res, { 
                error: 'Internal server error: ' + err.message 
            }, 500);
        }
    }));

    DELETE('/api/decos/:id', requireAuth(async (req, res) => {
        const id = req.params.id;
        console.log('[DELETE /api/decos/:id] 删除贴图:', id);

        try {
            // 获取图片路径以便删除文件
            const row = dbModule.query('SELECT image_path FROM decos WHERE id = ?', [id]);
            if (row && row.image_path) {
                const filename = row.image_path.split('/').pop();
                console.log('[DELETE /api/decos/:id] 删除文件:', filename);
                await storage.delete(filename);
            }

            const result = dbModule.exec('DELETE FROM decos WHERE id = ?', [id]);
            console.log('[DELETE /api/decos/:id] 删除结果:', result);

            if (result.changes === 0) {
                sendError(res, 404, 'Deco not found');
                return;
            }

            broadcast({ type: 'deco_deleted', payload: { id } });
            send(res, { success: true });
        } catch (err) {
            console.error('[DELETE /api/decos/:id] 错误:', err);
            sendError(res, 500, err.message);
        }
    }));
}

module.exports = { registerDecoRoutes };