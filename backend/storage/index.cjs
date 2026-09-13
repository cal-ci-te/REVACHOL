// ！存储模块出口
// 汇总存储门面与存储配置，调用方只需引用本目录即可同时取到两者。
const storage = require('./storage-service.cjs');
const config = require('./config.cjs');

module.exports = {
    storage,
    config,
};