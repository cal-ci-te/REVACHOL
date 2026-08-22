// 图标包（Icon Pack）后端路由
// 提供：上传（含安全性校验）、列表、状态、图标二进制、主题绑定修改、删除。
// 存储走 StorageService 独立实例：本地目录 uploads/icon-packs；rustfs key 前缀 'icon-packs/'。
const fs = require('fs');
const { send, sendError, json } = require('../enhance.cjs');
const { StorageService } = require('../storage/storage-service.cjs');
const { ICON_PACK_LOCAL_CONFIG } = require('../storage/config.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { requireAuth } = require('../auth.cjs');
const JSZip = require('jszip');

const THEME_IDS = ['dark', 'light', 'lofi'];
const ACTIVE_KEY = (themeId) => `icon_pack_active_${themeId}`;

// 与 js/services/icon-pack-keys.js 保持同步（33 个键，顺序一致）
const ICON_PACK_KEYS = [
  'site',
  'directory-folder-collapsed',
  'directory-folder-expanded',
  'directory-header',
  'toolbar-collapsed',
  'toolbar-expanded',
  'arrow',
  'avatar-upload',
  'custom-texture',
  'theme-dark',
  'theme-light',
  'theme-lofi',
  'directory-visibility-visible',
  'directory-visibility-hidden',
  'search',
  'position-mode',
  'article',
  'deco-style',
  'deco-duplicate',
  'deco-rename',
  'deco-edit-pos',
  'deco-download',
  'deco-delete',
  'box-lid',
  'box-body',
  'box-item-feather',
  'box-item-coin',
  'box-item-key',
  'box-item-note',
  'box-item-sand',
  'box-item-thread',
  'box-item-mirror',
  'box-item-void',
];
const ICON_PACK_KEY_SET = new Set(ICON_PACK_KEYS);

const LIMITS = {
  maxEntries: 200,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxBodyChars: 40 * 1024 * 1024,
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG_DANGEROUS = /<script|on\w+\s*=|javascript:|<foreignObject|<!ENTITY|<iframe|<object/i;
const IMAGE_EXT_RE = /\.(png|svg)$/i;

// iconPackStorage：独立存储实例，向后兼容默认 decos 存储
const iconPackStorage = new StorageService({
  uploadDir: ICON_PACK_LOCAL_CONFIG.uploadDir,
  baseUrl: ICON_PACK_LOCAL_CONFIG.baseUrl,
  idPrefix: ICON_PACK_LOCAL_CONFIG.idPrefix,
  keyPrefix: 'icon-packs/',
});

// 确保本地目录存在（rustfs 无本地目录概念）
if (iconPackStorage.isLocal()) {
  fs.mkdirSync(ICON_PACK_LOCAL_CONFIG.uploadDir, { recursive: true });
}

/** 读取请求体，超过 maxChars 抛错 */
function readBody(req, maxChars) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxChars) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** 校验 themeIds：必须是数组、至少一个、且每个 ∈ THEME_IDS */
function isValidThemeIds(themeIds) {
  return Array.isArray(themeIds) &&
    themeIds.length > 0 &&
    themeIds.every((t) => THEME_IDS.includes(t));
}

/** 从 zip entry 名提取图标键（basename 去扩展名，支持子目录） */
function extractKey(entryName) {
  const base = entryName.split('/').pop();
  return base.replace(/\.(png|svg)$/i, '');
}

function registerIconPackRoutes(GET, POST, PUT, DELETE) {
  // ===================== 状态（公开） =====================
  GET('/api/icon-packs/status', async (req, res) => {
    const themes = {};
    for (const themeId of THEME_IDS) {
      const activeRow = dbModule.query('SELECT value FROM settings WHERE key = ?', [ACTIVE_KEY(themeId)]);
      let activePackId = null;
      let activePackName = null;
      let icons = {};

      if (activeRow) {
        try { activePackId = JSON.parse(activeRow.value); } catch (e) { activePackId = activeRow.value; }
      }

      // 全量注册键：未生效包的键 custom=false
      ICON_PACK_KEYS.forEach((key) => {
        icons[key] = { custom: false, url: null, mime: null };
      });

      if (activePackId) {
        const packRow = dbModule.query('SELECT id, name FROM icon_packs WHERE id = ?', [activePackId]);
        if (packRow) {
          activePackName = packRow.name;
          const iconRows = dbModule.queryAll(
            'SELECT icon_key, file_key, mime FROM icon_pack_icons WHERE pack_id = ?',
            [activePackId]
          );
          iconRows.forEach((row) => {
            if (ICON_PACK_KEY_SET.has(row.icon_key)) {
              icons[row.icon_key] = {
                custom: true,
                url: `/api/icon-packs/${encodeURIComponent(activePackId)}/icons/${encodeURIComponent(row.icon_key)}`,
                mime: row.mime,
              };
            }
          });
        } else {
          // 生效引用指向已不存在的包：视为无生效包
          activePackId = null;
        }
      }

      themes[themeId] = { activePackId, activePackName, icons };
    }
    send(res, { themes });
  });

  // ===================== 包列表（公开） =====================
  GET('/api/icon-packs', async (req, res) => {
    const packRows = dbModule.queryAll('SELECT * FROM icon_packs ORDER BY created_at DESC');
    const packs = packRows.map((pack) => {
      let themes = [];
      try { themes = JSON.parse(pack.themes || '[]'); } catch (e) { themes = []; }
      const iconRows = dbModule.queryAll('SELECT icon_key FROM icon_pack_icons WHERE pack_id = ?', [pack.id]);
      return {
        id: pack.id,
        name: pack.name,
        themes,
        createdAt: pack.created_at,
        iconKeys: iconRows.map((r) => r.icon_key),
      };
    });
    send(res, packs);
  });

  // ===================== 图标二进制（公开） =====================
  GET('/api/icon-packs/:id/icons/:key', async (req, res) => {
    const { id, key } = req.params;
    const row = dbModule.query('SELECT file_key, mime FROM icon_pack_icons WHERE pack_id = ? AND icon_key = ?', [id, key]);
    if (!row) {
      sendError(res, 404, '图标不存在');
      return;
    }
    const data = await iconPackStorage.read(row.file_key);
    if (!data) {
      sendError(res, 404, '图标文件不存在');
      return;
    }
    res.writeHead(200, {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(Buffer.isBuffer(data) ? data : Buffer.from(data));
  });

  // ===================== 上传（鉴权） =====================
  POST('/api/icon-packs', requireAuth(async (req, res) => {
    let body;
    try {
      body = await readBody(req, LIMITS.maxBodyChars);
      body = JSON.parse(body || '{}');
    } catch (e) {
      sendError(res, 400, e.message === 'BODY_TOO_LARGE' ? '请求体过大' : '无效的 JSON');
      return;
    }

    const { name, themeIds, zipBase64 } = body;

    if (typeof name !== 'string' || !name.trim()) {
      sendError(res, 400, '图标包名称不能为空');
      return;
    }
    if (name.length > 100) {
      sendError(res, 400, '图标包名称不能超过 100 个字符');
      return;
    }
    if (!isValidThemeIds(themeIds)) {
      sendError(res, 400, 'themeIds 必须为非空数组且仅包含 dark/light/lofi');
      return;
    }
    if (typeof zipBase64 !== 'string' || !zipBase64) {
      sendError(res, 400, 'zipBase64 不能为空');
      return;
    }

    // 去除 data URL 前缀（如 data:application/zip;base64,）
    const b64 = zipBase64.replace(/^data:[^,]*,/, '');
    let buffer;
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch (e) {
      sendError(res, 400, 'zipBase64 无法解码');
      return;
    }
    if (!buffer || buffer.length === 0) {
      sendError(res, 400, 'zip 内容为空');
      return;
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (e) {
      sendError(res, 400, '无法解析 zip 文件');
      return;
    }

    const entries = Object.values(zip.files);
    if (entries.length > LIMITS.maxEntries) {
      sendError(res, 400, `zip 条目数超过上限（${LIMITS.maxEntries}）`);
      return;
    }

    const packId = 'iconpack_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const uploadedIcons = [];
    let totalBytes = 0;

    for (const entry of entries) {
      if (entry.dir) continue;
      if (!IMAGE_EXT_RE.test(entry.name)) continue; // 忽略非图片文件

      let buf;
      try {
        buf = await entry.async('nodebuffer');
      } catch (e) {
        sendError(res, 400, `读取 zip 条目失败: ${entry.name}`);
        return;
      }

      if (buf.length > LIMITS.maxFileBytes) {
        sendError(res, 400, `文件超过单文件上限（5MB）: ${entry.name}`);
        return;
      }
      totalBytes += buf.length;
      if (totalBytes > LIMITS.maxTotalBytes) {
        sendError(res, 400, 'zip 内图片总大小超过上限（50MB）');
        return;
      }

      const ext = IMAGE_EXT_RE.exec(entry.name)[1].toLowerCase();
      const key = extractKey(entry.name);

      if (ext === 'png') {
        const sig = buf.subarray(0, 8);
        if (sig.length !== PNG_SIGNATURE.length || !sig.equals(PNG_SIGNATURE)) {
          sendError(res, 400, `PNG 签名校验失败: ${entry.name}`);
          return;
        }
      } else {
        const text = buf.toString('utf8');
        if (SVG_DANGEROUS.test(text)) {
          sendError(res, 400, `SVG 包含危险内容: ${entry.name}`);
          return;
        }
      }

      const mime = ext === 'svg' ? 'image/svg+xml' : 'image/png';
      let stored;
      try {
        stored = await iconPackStorage.upload(buf, `${key}.${ext}`, mime);
      } catch (e) {
        console.error('[IconPacks] 文件写入失败:', e);
        sendError(res, 500, `图标文件写入失败: ${entry.name}`);
        return;
      }

      const fileKey = stored.key || stored.filename;
      uploadedIcons.push({ key, fileKey, mime, ext });
    }

    if (uploadedIcons.length === 0) {
      sendError(res, 400, 'zip 中未找到任何 .png/.svg 图标文件');
      return;
    }

    dbModule.run('INSERT INTO icon_packs (id, name, themes) VALUES (?, ?, ?)', [
      packId,
      name.trim(),
      JSON.stringify(themeIds),
    ]);
    uploadedIcons.forEach((icon) => {
      dbModule.run(
        'INSERT OR REPLACE INTO icon_pack_icons (pack_id, icon_key, file_key, mime) VALUES (?, ?, ?, ?)',
        [packId, icon.key, icon.fileKey, icon.mime]
      );
    });
    themeIds.forEach((themeId) => {
      dbModule.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        ACTIVE_KEY(themeId),
        JSON.stringify(packId),
      ]);
    });

    broadcast({ type: 'icon_packs_changed' });
    send(res, { id: packId, name: name.trim(), themes: themeIds });
  }));

  // ===================== 修改主题绑定（鉴权） =====================
  PUT('/api/icon-packs/:id/themes', requireAuth(async (req, res) => {
    const packId = req.params.id;
    let themeIds;
    try {
      const body = await json(req);
      themeIds = body.themeIds;
    } catch (e) {
      sendError(res, 400, '无效的 JSON');
      return;
    }

    if (!isValidThemeIds(themeIds)) {
      sendError(res, 400, 'themeIds 必须为非空数组且仅包含 dark/light/lofi');
      return;
    }

    const pack = dbModule.query('SELECT * FROM icon_packs WHERE id = ?', [packId]);
    if (!pack) {
      sendError(res, 404, '图标包不存在');
      return;
    }

    let oldThemes = [];
    try { oldThemes = JSON.parse(pack.themes || '[]'); } catch (e) { oldThemes = []; }

    dbModule.run('UPDATE icon_packs SET themes = ? WHERE id = ?', [JSON.stringify(themeIds), packId]);

    themeIds.forEach((themeId) => {
      dbModule.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        ACTIVE_KEY(themeId),
        JSON.stringify(packId),
      ]);
    });

    oldThemes.forEach((themeId) => {
      if (themeIds.includes(themeId)) return;
      const activeRow = dbModule.query('SELECT value FROM settings WHERE key = ?', [ACTIVE_KEY(themeId)]);
      if (activeRow) {
        let current = null;
        try { current = JSON.parse(activeRow.value); } catch (e) { current = activeRow.value; }
        if (current === packId) {
          dbModule.run('DELETE FROM settings WHERE key = ?', [ACTIVE_KEY(themeId)]);
        }
      }
    });

    broadcast({ type: 'icon_packs_changed' });
    send(res, { success: true });
  }));

  // ===================== 删除包（鉴权） =====================
  DELETE('/api/icon-packs/:id', requireAuth(async (req, res) => {
    const packId = req.params.id;
    const pack = dbModule.query('SELECT * FROM icon_packs WHERE id = ?', [packId]);
    if (!pack) {
      sendError(res, 404, '图标包不存在');
      return;
    }

    const iconRows = dbModule.queryAll('SELECT file_key FROM icon_pack_icons WHERE pack_id = ?', [packId]);
    for (const row of iconRows) {
      try { await iconPackStorage.delete(row.file_key); } catch (e) { /* 尽力删除 */ }
    }

    dbModule.run('DELETE FROM icon_pack_icons WHERE pack_id = ?', [packId]);
    dbModule.run('DELETE FROM icon_packs WHERE id = ?', [packId]);

    THEME_IDS.forEach((themeId) => {
      const activeRow = dbModule.query('SELECT value FROM settings WHERE key = ?', [ACTIVE_KEY(themeId)]);
      if (activeRow) {
        let current = null;
        try { current = JSON.parse(activeRow.value); } catch (e) { current = activeRow.value; }
        if (current === packId) {
          dbModule.run('DELETE FROM settings WHERE key = ?', [ACTIVE_KEY(themeId)]);
        }
      }
    });

    broadcast({ type: 'icon_packs_changed' });
    send(res, { success: true });
  }));
}

module.exports = { registerIconPackRoutes, ICON_PACK_KEYS, THEME_IDS };
