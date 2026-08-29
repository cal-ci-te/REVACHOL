import { describe, it, expect, vi } from 'vitest';
import { parseMarkers, parseMarkerFields, normalizeMarkerFields, parseMarkersFromDom } from '../../../js/business/sticker/parser/sticker-parser.js';
import { serializeOne, serializeAll, escapeAttrValue } from '../../../js/business/sticker/parser/sticker-serializer.js';
import { generateId } from '../../../js/business/sticker/model/id-generator.js';
import { StickerModel } from '../../../js/business/sticker/model/sticker-model.js';
import { renderSticker, clampX, reClamp } from '../../../js/business/sticker/renderer/sticker-renderer.js';
import { StickerFacade, createStickerFacadeWithMocks } from '../../../js/business/sticker/sticker-facade.js';

describe('sticker parser', () => {
  it('解析字段顺序无关的标记', () => {
    const raw = 'deco_abc align=right w=120 h=80 x=10 y=20 margin=30';
    expect(parseMarkerFields(raw)).toMatchObject({
      id: 'deco_abc',
      align: 'right',
      w: '120',
      x: '10',
    });
  });

  it('从内容解析多个标记', () => {
    const content =
      'para<!-- sticker:a x=1 y=2 w=100 h=100 align=left -->more<!-- sticker:b x=3 y=4 w=80 h=80 align=right -->';
    const stickers = parseMarkers(content);
    expect(stickers).toHaveLength(2);
    expect(stickers[0].id).toBe('a');
    expect(stickers[1].align).toBe('right');
  });

  it('parseMarkersFromDom 剥离 sticker: 前缀', () => {
    const container = document.createElement('div');
    container.innerHTML = 'a<!-- sticker:deco_abc x=1 y=2 w=100 h=100 align=left -->b';
    const stickers = parseMarkersFromDom(container);
    expect(stickers).toHaveLength(1);
    expect(stickers[0].id).toBe('deco_abc');
  });
});

describe('sticker serializer', () => {
  it('serializeOne 生成合法标记', () => {
    const marker = serializeOne({ id: 'a', x: 1, y: 2, width: 100, height: 80, align: 'right', margin: 30 });
    expect(marker).toContain('<!-- sticker:a x=1 y=2 w=100 h=80 align=right margin=30 -->');
  });

  it('缺 id 抛 StickerSerializeError', () => {
    expect(() => serializeOne({})).toThrow(/StickerSerializeError/);
  });

  it('escapeAttrValue 防止注释边界破坏', () => {
    expect(escapeAttrValue('a--b')).toBe('a&#45;&#45;b');
  });
});

describe('generateId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('生成带前缀的唯一 id', () => {
    const id = generateId([], { prefix: 'stk_' });
    expect(id.startsWith('stk_')).toBe(true);
  });

  it('冲突时重试，超出上限抛错', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((arr) => {
      arr.fill(0);
      return arr;
    });
    const existing = ['stk_AAAAAAAAAAAAAAAAAAAAAA'];
    expect(() => generateId(existing, { prefix: 'stk_', maxAttempts: 2 })).toThrow(/无法生成唯一 id/);
  });
});

describe('StickerModel', () => {
  it('CRUD 与 id 集合', () => {
    const model = new StickerModel();
    model.add({ id: 'a', x: 1 });
    model.add({ id: 'b', x: 2 });
    expect(model.size).toBe(2);
    model.update('a', { x: 9 });
    expect(model.get('a').x).toBe(9);
    model.remove('b');
    expect(model.size).toBe(1);
    model.clear();
    expect(model.size).toBe(0);
  });

  it('backfillContent 归一化旧数据并补齐 id', () => {
    const model = new StickerModel();
    const result = model.backfillContent([{ decoId: 'old', w: 90, h: 90 }]);
    expect(result[0].id).toBe('old');
    expect(result[0].width).toBe(90);
    expect(result[0].margin).toBe(20);
  });

  it('releaseIds 按谓词清理', () => {
    const model = new StickerModel();
    model.add({ id: 'a' });
    model.add({ id: 'b' });
    model.releaseIds((id) => id === 'a');
    expect(model.get('a')).toBeUndefined();
    expect(model.get('b')).toBeDefined();
  });
});

describe('renderer', () => {
  it('containerWidth 为 0 时降级，不进行无效 clamp', () => {
    const sticker = { id: 'a', src: 'https://a.com/a.png', width: 120, height: 120, align: 'right', x: 999 };
    expect(clampX(sticker, { containerWidth: 0 })).toBe(0);
    const el = renderSticker(sticker, { containerWidth: 0 });
    expect(el.className).toBe('article-sticker');
  });

  it('渲染时对 src 做 CSS URL 转义', () => {
    const el = renderSticker({ id: 'a', src: 'https://a.com/a"b)c.png' }, { containerWidth: 800 });
    expect(el.style.cssText).toContain('a%22b%29c.png');
  });

  it('右对齐 x clamp 到容器百分比范围内', () => {
    const sticker = { id: 'a', width: 120, align: 'right', x: 999 };
    // containerWidth=800, maxXPercent = (800-120)/800*100 = 85
    expect(clampX(sticker, { containerWidth: 800 })).toBe(85);
  });

  it('absolute 模式渲染编辑器覆盖层', () => {
    const el = renderSticker(
      { id: 'a', src: 'https://a.com/a.png', x: 30, y: 40, width: 120, height: 80 },
      { mode: 'absolute' }
    );
    expect(el.style.position).toBe('absolute');
    expect(el.style.left).toBe('30px');
    expect(el.style.top).toBe('40px');
    expect(el.style.cursor).toBe('grab');
  });

  it('reClamp 更新贴纸边距', () => {
    const sticker = { id: 'a', x: 10, width: 100, height: 100 };
    const el = renderSticker({ ...sticker, src: 'https://a.com/a.png' }, { containerWidth: 800 });
    reClamp(el, sticker, { containerWidth: 400 });
    // maxXPercent = (400-100)/400*100 = 75；x=10 未越界
    expect(el.style.marginLeft).toBe('10%');
    reClamp(el, { ...sticker, x: 999 }, { containerWidth: 400 });
    expect(el.style.marginLeft).toBe('75%');
  });

  it('serializeOne → parseMarkers round-trip 保真', () => {
    const sticker = { id: 'deco_abc', x: 10, y: 20, width: 120, height: 80, align: 'right', margin: 30 };
    const marker = serializeOne(sticker);
    const parsed = parseMarkers(marker);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'deco_abc',
      x: 10,
      y: 20,
      width: 120,
      height: 80,
      align: 'right',
      margin: 30,
    });
  });
});

describe('StickerFacade', () => {
  it('默认装配真实依赖，提供完整 API', () => {
    const facade = new StickerFacade();
    const stickers = facade.parseMarkers('x<!-- sticker:a x=1 y=2 w=100 h=100 align=left -->y');
    expect(stickers).toHaveLength(1);
    expect(facade.serializeOne({ id: 'a', x: 1, y: 2, width: 100, height: 100 })).toContain('<!-- sticker:a');
  });

  it('createStickerFacadeWithMocks 注入 mock 依赖', () => {
    const parser = { parseMarkers: vi.fn(() => [{ id: 'mock' }]), parseMarkersFromDom: vi.fn() };
    const security = { assertSafeStickerData: vi.fn() };
    const facade = createStickerFacadeWithMocks({ parser, security });
    expect(facade.parseMarkers('x')).toEqual([{ id: 'mock' }]);
    facade.renderSticker({ id: 'a', src: 'https://a.com/a.png' }, {});
    expect(security.assertSafeStickerData).toHaveBeenCalled();
  });
});

describe('P1 fixes', () => {
  it('P1-2 normalizeMarkerFields 缺失 x/y 回退默认值', () => {
    const result = normalizeMarkerFields({ id: 'a' });
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });

  it('P1-8 serializeOne NaN x/y 回退默认值', () => {
    const marker = serializeOne({ id: 'a', x: NaN, y: undefined, width: 100, height: 100 });
    expect(marker).toContain('x=50');
    expect(marker).toContain('y=50');
  });

  it('P1-8 StickerModel releaseIds 校验参数类型', () => {
    const model = new StickerModel();
    expect(() => model.releaseIds('abc')).toThrow(TypeError);
    expect(() => model.releaseIds({})).toThrow(TypeError);
  });

  it('P1-1 renderSticker 左对齐使用百分比', () => {
    const el = renderSticker({ id: 'a', src: 'https://a.com/a.png', x: 10, width: 100, height: 100 }, { containerWidth: 800 });
    expect(el.style.marginLeft).toBe('10%');
  });

  it('P1-5 StickerFacade serializer 依赖注入生效', () => {
    const serializer = { serializeOne: vi.fn(() => '<!-- sticker:mock -->'), serializeAll: vi.fn() };
    const facade = createStickerFacadeWithMocks({ serializer });
    expect(facade.serializeOne({ id: 'mock' })).toBe('<!-- sticker:mock -->');
    expect(serializer.serializeOne).toHaveBeenCalled();
  });
});
