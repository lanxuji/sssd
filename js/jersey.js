/* ============================================================
 *  狮山实达 · 全身照生成器（Canvas 合成）
 *  输入：头像 + 球衣款式 → 输出一张全身球员形象图
 *  不依赖任何 AI / 网络，纯本地绘制，可离线使用
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 球衣款式预设 ---------- */
  const KITS = [
    { id: 'home', name: '主场', main: '#14265A', accent: '#F2B705', shorts: '#14265A', socks: '#14265A', num: '#F2B705' },
    { id: 'away', name: '客场', main: '#F5F7FC', accent: '#14265A', shorts: '#F5F7FC', socks: '#14265A', num: '#14265A' },
    { id: 'gk', name: '门将', main: '#F2B705', accent: '#14265A', shorts: '#1B2338', socks: '#F2B705', num: '#14265A' },
    { id: 'train', name: '训练', main: '#5A6B8C', accent: '#E8EBF2', shorts: '#14265A', socks: '#5A6B8C', num: '#FFFFFF' }
  ];

  const SKIN = '#F0C9A8';
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif';

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRR(ctx, x, y, w, h, r, c) { rr(ctx, x, y, w, h, r); ctx.fillStyle = c; ctx.fill(); }

  const Jersey = {
    KITS: KITS,
    kit(id) { return KITS.find(k => k.id === id) || KITS[0]; },

    /**
     * 绘制全身形象
     * @param {Object} o { name, number, position, avatar, kit }
     * @param {number} scale 输出倍率
     * @returns {HTMLCanvasElement}
     */
    draw(o, scale) {
      scale = scale || 2;
      const W = 260, H = 430;
      const cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = H * scale;
      const ctx = cv.getContext('2d');
      ctx.scale(scale, scale);
      ctx.textBaseline = 'alphabetic';

      const kit = Jersey.kit(o.kit);
      const CX = W / 2;

      /* ---------- 地面投影 ---------- */
      ctx.beginPath();
      ctx.ellipse(CX, 412, 62, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,38,90,.10)'; ctx.fill();

      /* ---------- 腿 + 袜子 + 球鞋 ---------- */
      /* 左腿 */
      ctx.fillStyle = SKIN;
      fillRR(ctx, CX - 40, 286, 32, 74, 13, SKIN);
      /* 右腿 */
      fillRR(ctx, CX + 8, 286, 32, 74, 13, SKIN);
      /* 袜子 */
      fillRR(ctx, CX - 41, 344, 34, 40, 10, kit.socks);
      fillRR(ctx, CX + 7, 344, 34, 40, 10, kit.socks);
      /* 袜子上的撞色边 */
      fillRR(ctx, CX - 41, 344, 34, 8, 4, kit.accent);
      fillRR(ctx, CX + 7, 344, 34, 8, 4, kit.accent);
      /* 球鞋 */
      fillRR(ctx, CX - 46, 380, 42, 22, 9, '#1B2338');
      fillRR(ctx, CX + 4, 380, 42, 22, 9, '#1B2338');
      /* 鞋底 */
      fillRR(ctx, CX - 46, 396, 42, 7, 4, '#F2B705');
      fillRR(ctx, CX + 4, 396, 42, 7, 4, '#F2B705');

      /* ---------- 球裤 ---------- */
      ctx.beginPath();
      ctx.moveTo(CX - 44, 240);
      ctx.lineTo(CX + 44, 240);
      ctx.lineTo(CX + 40, 300);
      ctx.lineTo(CX + 4, 300);
      ctx.lineTo(CX, 276);
      ctx.lineTo(CX - 4, 300);
      ctx.lineTo(CX - 40, 300);
      ctx.closePath();
      ctx.fillStyle = kit.shorts; ctx.fill();
      /* 裤边撞色 */
      fillRR(ctx, CX - 44, 240, 88, 9, 4, kit.accent);

      /* ---------- 手臂 ---------- */
      /* 左臂（画面左） */
      ctx.save(); ctx.translate(CX - 62, 168); ctx.rotate(-0.14);
      fillRR(ctx, -13, 0, 26, 96, 12, SKIN);
      ctx.restore();
      /* 右臂 */
      ctx.save(); ctx.translate(CX + 62, 168); ctx.rotate(0.14);
      fillRR(ctx, -13, 0, 26, 96, 12, SKIN);
      ctx.restore();

      /* ---------- 球衣主体 ---------- */
      ctx.beginPath();
      ctx.moveTo(CX - 56, 150);          // 左肩
      ctx.quadraticCurveTo(CX - 62, 156, CX - 60, 172);
      ctx.lineTo(CX - 50, 244);
      ctx.lineTo(CX + 50, 244);
      ctx.lineTo(CX + 60, 172);
      ctx.quadraticCurveTo(CX + 62, 156, CX + 56, 150);
      ctx.quadraticCurveTo(CX, 138, CX - 56, 150);
      ctx.closePath();
      ctx.fillStyle = kit.main; ctx.fill();

      /* 球衣斜纹装饰 */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(CX - 56, 150); ctx.quadraticCurveTo(CX, 138, CX + 56, 150);
      ctx.lineTo(CX + 50, 244); ctx.lineTo(CX - 50, 244); ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = kit.accent;
      for (let i = -3; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(CX - 70 + i * 22, 140);
        ctx.lineTo(CX - 70 + i * 22 + 11, 140);
        ctx.lineTo(CX - 58 + i * 22 + 11, 250);
        ctx.lineTo(CX - 58 + i * 22, 250);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      /* 领口 */
      ctx.beginPath();
      ctx.moveTo(CX - 18, 141);
      ctx.quadraticCurveTo(CX, 156, CX + 18, 141);
      ctx.quadraticCurveTo(CX, 147, CX - 18, 141);
      ctx.closePath();
      ctx.fillStyle = kit.accent; ctx.fill();

      /* 袖子撞色边 */
      ctx.save(); ctx.translate(CX - 62, 168); ctx.rotate(-0.14);
      fillRR(ctx, -13, 0, 26, 10, 5, kit.accent);
      ctx.restore();
      ctx.save(); ctx.translate(CX + 62, 168); ctx.rotate(0.14);
      fillRR(ctx, -13, 0, 26, 10, 5, kit.accent);
      ctx.restore();

      /* 胸前号码 */
      if (o.number != null && o.number !== '') {
        ctx.font = '800 46px ' + FONT;
        ctx.fillStyle = kit.num;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(o.number), CX, 196);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }

      /* 队徽小标（左胸） */
      fillRR(ctx, CX - 46, 160, 16, 16, 4, kit.accent);
      ctx.font = '800 10px ' + FONT;
      ctx.fillStyle = kit.main; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('狮', CX - 38, 168);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      /* ---------- 脖子 ---------- */
      fillRR(ctx, CX - 12, 124, 24, 22, 6, SKIN);

      /* ---------- 头 ---------- */
      /* 颈部阴影 */
      ctx.beginPath(); ctx.arc(CX, 108, 34, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fill();
      /* 头部底 */
      ctx.beginPath(); ctx.arc(CX, 104, 32, 0, Math.PI * 2);
      ctx.fillStyle = SKIN; ctx.fill();

      /* 头像贴图（裁剪进圆形） */
      let drew = false;
      const img = o.avatar && Jersey._img ? Jersey._img[o.avatar] : null;
      if (img && img.complete && img.naturalWidth) {
        try {
          ctx.save();
          ctx.beginPath(); ctx.arc(CX, 104, 32, 0, Math.PI * 2); ctx.clip();
          /* 按短边填充 */
          const s = Math.max(64 / img.naturalWidth, 64 / img.naturalHeight);
          const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
          ctx.drawImage(img, CX - dw / 2, 104 - dh / 2, dw, dh);
          ctx.restore();
          drew = true;
        } catch (e) { }
      }
      if (!drew) {
        ctx.font = '800 30px ' + FONT;
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(o.name || '?').slice(0, 1), CX, 104);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      /* 头部描边，让贴图有边界感 */
      ctx.beginPath(); ctx.arc(CX, 104, 32, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(20,38,90,.18)'; ctx.lineWidth = 2; ctx.stroke();

      return cv;
    },

    _img: {},
    /* 预加载头像 */
    load(url) {
      if (!url || Jersey._img[url]) return Promise.resolve(Jersey._img[url] || null);
      return new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { Jersey._img[url] = img; res(img); };
        img.onerror = () => { Jersey._img[url] = null; res(null); };
        img.src = url;
        setTimeout(() => { if (!img.complete) { Jersey._img[url] = null; res(null); } }, 3000);
      });
    }
  };

  global.Jersey = Jersey;
})(window);
