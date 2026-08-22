// tests/unit/admin/panel/render.test.js
// 测试管理面板渲染：面板 HTML 渲染、折叠按钮绑定、解绑包装
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 通用字符串代理：任何 UI.xxx 访问返回可字符串化的占位值，避免枚举 ui-strings.js 全部键
function makeStrings() {
  const p = new Proxy(
    function () {},
    {
      get(target, prop) {
        if (
          prop === Symbol.toPrimitive ||
          prop === 'toString' ||
          prop === 'valueOf'
        ) {
          return () => 'STR';
        }
        return p;
      },
      apply() {
        return 'STR';
      },
    }
  );
  return p;
}

vi.mock('../../../../js/admin/panel/index.js', () => ({
  AdminPanel: {
    _rendered: false,
    renderContent: null,
    _bindToggleIconDirect: null,
    unbindEvents: null,
    renderPalettes: vi.fn(),
    bindEvents: vi.fn(),
    _uploadClickHandler: null,
    _assetFileHandler: null,
  },
}));
vi.mock('../../../../js/admin/avatar.js', () => ({
  AdminAvatar: { getAvatarForUser: vi.fn(() => null) },
}));
vi.mock('../../../../js/admin/position.js', () => ({
  AdminPosition: { toggleCollapse: vi.fn() },
}));
vi.mock('../../../../js/core/dom-refs.js', () => ({
  DOMRefs: {
    get: vi.fn((sel) => document.querySelector(sel)),
    admin: { content: '#panelContent' },
  },
}));
vi.mock('../../../../js/utils.js', () => ({
  Utils: { storage: { get: vi.fn(() => null) }, showToast: vi.fn(), escapeHtml: (s) => s },
}));
vi.mock('../../../../js/services/texture.js', () => ({
  Texture: {
    bgMode: 'solid',
    gradientColors: ['#1a1612', '#2a231c'],
    gradientDirection: 'to bottom',
    gradientFeather: 50,
  },
}));
vi.mock('../../../../js/services/hero-background.js', () => ({
  HeroBackground: { maxOpacity: 1 },
}));
vi.mock('../../../../js/ui/components/deco-ui.js', () => ({
  DecoShelfUI: { init: vi.fn(), render: vi.fn() },
}));
vi.mock('../../../../js/core/event-bus.js', () => ({
  EventBus: { emit: vi.fn(), on: vi.fn() },
}));
vi.mock('../../../../js/core/app-state.js', () => ({ AppState: { get: vi.fn() } }));
vi.mock('../../../../js/core/state-mutations.js', () => ({ MUTATIONS: {} }));
vi.mock('../../../../js/services/article-service.js', () => ({ ArticleService: {} }));
vi.mock('../../../../js/utils/ui-strings.js', () => ({ UI: makeStrings() }));
vi.mock('../../../../js/services/deco.js', () => ({ DecoShelf: { upload: vi.fn() } }));
vi.mock('../../../../js/admin/puzzle/PuzzleEntry.js', () => ({
  renderPuzzleEntry: vi.fn(() => ''),
}));
vi.mock('../../../../js/admin/puzzle/PuzzleCustomizer.js', () => ({
  bindPuzzleFileUpload: vi.fn(),
}));

import { AdminPanel } from '../../../../js/admin/panel/index.js';
import '../../../../js/admin/panel/render.js';

describe('AdminPanel.renderContent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    AdminPanel._rendered = false;
    vi.clearAllMocks();
  });

  it('should return early when panel content missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => AdminPanel.renderContent()).not.toThrow();
    warn.mockRestore();
  });

  it('should render HTML into panel', () => {
    document.body.innerHTML = '<div id="panelContent"></div>';
    AdminPanel.renderContent();
    const html = document.getElementById('panelContent').innerHTML;
    expect(html.length).toBeGreaterThan(0);
    expect(AdminPanel._rendered).toBe(true);
  });

  it('should only refresh dynamic content when already rendered', () => {
    document.body.innerHTML =
      '<div id="panelContent"></div><div id="assetListContainer"></div>';
    AdminPanel._rendered = true;
    AdminPanel.renderContent();
    expect(document.getElementById('panelContent').innerHTML).toBe('');
  });
});

describe('AdminPanel._bindToggleIconDirect', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should no-op when toggle icon missing', () => {
    expect(() => AdminPanel._bindToggleIconDirect()).not.toThrow();
  });
});
