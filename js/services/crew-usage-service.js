// CrewAI Token 消耗仪表盘服务层。
// 封装 /api/crew/usage/* 只读接口，并提供轻量缓存（overview 5s / filters 会话级）。
import { ApiClient } from './api-client.js';

const OVERVIEW_CACHE_TTL = 5000;

export const CrewUsageService = {
  _cache: {},

  // 获取总览数据
  async getOverview() {
    const cached = this._cache.overview;
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
