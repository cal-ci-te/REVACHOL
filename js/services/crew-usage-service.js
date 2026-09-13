// ！CrewAI 用量仪表盘
// 封装 /api/crew/usage/* 只读接口，并提供轻量缓存（overview 5s、filters 会话级）。

import { ApiClient } from './api-client.js';

const OVERVIEW_CACHE_TTL = 5000;

export const CrewUsageService = {
  // overview 带 _timestamp 供过期判断，filters 会话内一直有效
  _cache: {},

  // 获取总览数据
  async getOverview() {
    const cached = this._cache.overview;
    // 命中 5s 缓存即返回：仪表盘轮询间隔大于 TTL，避免打爆后端
    if (cached && Date.now() - cached._timestamp < OVERVIEW_CACHE_TTL) {
      return cached;
    }
    const data = await ApiClient.get('/api/crew/usage/overview');
    this._cache.overview = data;
    this._cache.overview._timestamp = Date.now();
    return data;
  },

  // 获取时间序列数据
  async getTimeline(params) {
    const query = new URLSearchParams(params || {}).toString();
    return await ApiClient.get(`/api/crew/usage/timeline?${query}`);
  },

  // 获取 Agent 排行
  async getAgentRanking() {
    return await ApiClient.get('/api/crew/usage/agents');
  },

  // 获取 Model 排行
  async getModelRanking() {
    return await ApiClient.get('/api/crew/usage/models');
  },

  // 获取筛选选项
  async getFilterOptions() {
    // 筛选选项会话内不变，命中即返回
    if (this._cache.filters) {
      return this._cache.filters;
    }
    const data = await ApiClient.get('/api/crew/usage/filters');
    this._cache.filters = data;
    return data;
  },

  // 清除缓存
  clearCache() {
    this._cache = {};
  },
};

export default CrewUsageService;
