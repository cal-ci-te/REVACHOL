// 自研状态管理（类 Vuex）：集中式 state + mutation 变更 + subscriber 通知。
// 选择自研而非引入 Vuex/Pinia 的原因：项目仅 ~15 个状态键，引入状态库的产物体积 (≈30KB gzip) 
// 远超自研实现 (<1KB)。若未来状态键增长至 50+ 或需要时间旅行调试，可迁移至 Pinia。
import { MUTATIONS } from './state-mutations.js';

const mutationHandlers = {
  [MUTATIONS.SET_LOGGED_IN]: (state, payload) => { state.isLoggedIn = payload; },
  [MUTATIONS.SET_PANEL_POSITION]: (state, payload) => {
    if (payload.right !== undefined) state.panelRight = payload.right;
    if (payload.bottom !== undefined) state.panelBottom = payload.bottom;
  },
  [MUTATIONS.SET_PANEL_COLLAPSED]: (state, payload) => { state.panelCollapsed = payload; },
  [MUTATIONS.SET_SIDEBAR_COLLAPSED]: (state, payload) => { state.sidebarCollapsed = payload; },
  [MUTATIONS.SET_SIDEBAR_POSITION]: (state, payload) => {
    if (payload.left !== undefined) state.sidebarLeft = payload.left;
    if (payload.top !== undefined) state.sidebarTop = payload.top;
  },
  [MUTATIONS.SET_DECO_EDITING]: (state, payload) => { state.decoEditing = payload; },
  [MUTATIONS.SET_WATERMARK_TEXT]: (state, payload) => { state.watermarkText = payload; },
  [MUTATIONS.SET_WATERMARK_OPACITY]: (state, payload) => { state.watermarkOpacity = payload; },
  [MUTATIONS.SET_TEXTURE_URL]: (state, payload) => { state.textureDataUrl = payload; },
  [MUTATIONS.SET_TEXTURE_OPACITY]: (state, payload) => { state.textureOpacity = payload; },
  [MUTATIONS.SET_BG_COLOR]: (state, payload) => { state.bgColor = payload; },
  [MUTATIONS.SET_ARTICLES]: (state, payload) => { state.articles = payload; },
  [MUTATIONS.SET_VISIBLE_ARTICLES]: (state, payload) => { state.visibleArticles = payload; },
  [MUTATIONS.SET_ARTICLE_VISIBILITY]: (state, payload) => { state.articleVisibility = payload; },
  [MUTATIONS.SET_ADMIN]: (state, payload) => { state.admin = payload; },
  [MUTATIONS.SET_UI]: (state, payload) => { state.ui = payload; },
  [MUTATIONS.SET_KEY]: (state, payload) => {
    if (payload && payload.key !== undefined) state[payload.key] = payload.value;
  },
  [MUTATIONS.SET_PUZZLE_IMAGE]: (state, payload) => { state.puzzleImage = payload; },
  [MUTATIONS.SET_PUZZLE_COMPLETED]: (state, payload) => { state.puzzleCompleted = payload; },
  [MUTATIONS.SET_CREW_STATE]: (state, payload) => { state.crew = payload; },
};

const mutationKeyMap = {
  [MUTATIONS.SET_LOGGED_IN]: 'isLoggedIn',
  [MUTATIONS.SET_PANEL_POSITION]: ['panelRight', 'panelBottom'],
  [MUTATIONS.SET_PANEL_COLLAPSED]: 'panelCollapsed',
  [MUTATIONS.SET_SIDEBAR_COLLAPSED]: 'sidebarCollapsed',
  [MUTATIONS.SET_SIDEBAR_POSITION]: ['sidebarLeft', 'sidebarTop'],
  [MUTATIONS.SET_DECO_EDITING]: 'decoEditing',
  [MUTATIONS.SET_WATERMARK_TEXT]: 'watermarkText',
  [MUTATIONS.SET_WATERMARK_OPACITY]: 'watermarkOpacity',
  [MUTATIONS.SET_TEXTURE_URL]: 'textureDataUrl',
  [MUTATIONS.SET_TEXTURE_OPACITY]: 'textureOpacity',
  [MUTATIONS.SET_BG_COLOR]: 'bgColor',
  [MUTATIONS.SET_ARTICLES]: 'articles',
  [MUTATIONS.SET_VISIBLE_ARTICLES]: 'visibleArticles',
  [MUTATIONS.SET_ARTICLE_VISIBILITY]: 'articleVisibility',
  [MUTATIONS.SET_ADMIN]: 'admin',
  [MUTATIONS.SET_UI]: 'ui',
  [MUTATIONS.SET_KEY]: null,
  [MUTATIONS.SET_PUZZLE_IMAGE]: 'puzzleImage',
  [MUTATIONS.SET_PUZZLE_COMPLETED]: 'puzzleCompleted',
  [MUTATIONS.SET_CREW_STATE]: 'crew',
};

function defaultCrewState() {
  return {
    running: false,
    runId: null,
    requirement: '',
    process: 'sequential',
    memory: false,
    planning: false,
    startedAt: null,
    finishedAt: null,
    agents: [],
    logs: [],
    outputs: [],
    stats: {},
    lastError: null,
  };
}

export const AppState = {
  _state: {
    isLoggedIn: false, adminUsername: 'admin',
    panelCollapsed: true, panelRight: 20, panelBottom: 20,
    sidebarCollapsed: true, sidebarLeft: 20, sidebarTop: 80,
    decoEditing: false,
    articles: [], visibleArticles: [], articleVisibility: {},
    watermarkText: 'REVACHOL', watermarkOpacity: 0.08,
    textureDataUrl: null, textureOpacity: 0.12,
    bgColor: '#1a1612', // → var(--color-bg-primary); admin: null, ui: null,
    puzzleImage: null, puzzleCompleted: false, crew: defaultCrewState(),
  },

  _subscribers: {},

  get(key) { return this._state[key]; },

  commit(type, payload) {
    const handler = mutationHandlers[type];
    if (!handler) { console.warn(`[AppState] 未知 mutation: ${type}`); return; }
    handler(this._state, payload);

    const keys = mutationKeyMap[type];
    if (keys === null) {
      if (payload && payload.key !== undefined) this._notify(payload.key, payload.value);
    } else if (Array.isArray(keys)) {
      keys.forEach((key) => this._notify(key, this._state[key]));
    } else if (keys) {
      this._notify(keys, this._state[keys]);
    }
  },

  subscribe(key, callback) {
    if (!this._subscribers[key]) this._subscribers[key] = [];
    this._subscribers[key].push(callback);
    if (this._state[key] !== undefined) callback(this._state[key]);
    return this;
  },

  unsubscribe(key, callback) {
    if (!this._subscribers[key]) return this;
    if (callback) {
      this._subscribers[key] = this._subscribers[key].filter(cb => cb !== callback);
    } else {
      delete this._subscribers[key];
    }
    return this;
  },

  _notify(key, newValue) {
    if (!this._subscribers[key]) return;
    this._subscribers[key].forEach(cb => { try { cb(newValue); } catch (e) { console.error('[AppState] 通知错误:', key, e); } });
  },

  reset() {
    this._state = {
      isLoggedIn: false, adminUsername: 'admin',
      panelCollapsed: true, panelRight: 20, panelBottom: 20,
      sidebarCollapsed: true, sidebarLeft: 20, sidebarTop: 80,
      decoEditing: false,
      articles: [], visibleArticles: [], articleVisibility: {},
      watermarkText: 'REVACHOL', watermarkOpacity: 0.08,
      textureDataUrl: null, textureOpacity: 0.12,
      bgColor: '#1a1612', // → var(--color-bg-primary); admin: null, ui: null,
      puzzleImage: null, puzzleCompleted: false, crew: defaultCrewState(),
    };
    this._subscribers = {};
    return this;
  },

  snapshot() { return JSON.parse(JSON.stringify(this._state)); },
};
