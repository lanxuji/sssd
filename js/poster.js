/* ============================================================
 *  狮山实达 · 海报绘制（纯 Canvas，不依赖 html2canvas）
 *  为什么不用 html2canvas：它不支持 CSS 变量 / 现代渐变 / 伪元素，
 *  经常整块背景丢失。这里改用原生 Canvas 逐块绘制，100% 可控。
 * ============================================================ */
(function (global) {
  'use strict';

  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';
  const NAVY = '#0B5F42', NAVY2 = '#0E8B60', GOLD = '#F2B705', GOLD_D = '#C89204';
  /* 文字色：模块级共享（局部定义容易在别的卡片里访问不到而报错） */
  const INK = '#0B3B2C', INK2 = '#3E6B5A', INK3 = '#6B8A7C';
  const TXT = '#0B3B2C', MUTED = '#6B8A7C', LINE = 'rgba(11,95,66,.14)', CARD = 'rgba(255,255,255,.72)', BG = '#F4F8F6';

  /* ---------- 绘图小工具 ---------- */
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
  function fillRR(ctx, x, y, w, h, r, color) {
    rr(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill();
  }
  function grad(ctx, x, y, w, h, c1, c2) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  }
  /* 按宽度截断文本，超长加省略号 */
  function ellipsis(ctx, text, maxW) {
    text = String(text == null ? '' : text);
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  /* 中文按字符换行 */
  function wrap(ctx, text, maxW, maxLines) {
    text = String(text == null ? '' : text);
    const lines = []; let cur = '';
    for (const ch of text) {
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      const t = lines.slice(0, maxLines);
      t[maxLines - 1] = ellipsis(ctx, t[maxLines - 1] + '…', maxW - 8);
      return t;
    }
    return lines;
  }
  function text(ctx, str, x, y, opt) {
    opt = opt || {};
    ctx.font = (opt.weight || '400') + ' ' + (opt.size || 13) + 'px ' + FONT;
    ctx.fillStyle = opt.color || TXT;
    ctx.textAlign = opt.align || 'left';
    ctx.textBaseline = opt.baseline || 'alphabetic';
    ctx.fillText(String(str == null ? '' : str), x, y);
  }
  function avatar(ctx, name, url, x, y, size, bg, fg) {
    /* 优先画图片，失败或没有则画首字 */
    let drawn = false;
    if (url) {
      try {
        const img = Poster.imgCache[url];
        if (img && img.complete && img.naturalWidth) {
          ctx.save(); rr(ctx, x, y, size, size, size / 2); ctx.clip();
          ctx.drawImage(img, x, y, size, size); ctx.restore(); drawn = true;
        }
      } catch (e) { }
    }
    if (!drawn) {
      ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = bg || NAVY; ctx.fill();
      text(ctx, String(name || '?').slice(0, 1), x + size / 2, y + size / 2 + 1,
        { size: Math.round(size * 0.46), weight: '800', color: fg || '#fff', align: 'center', baseline: 'middle' });
    }
  }

  const Poster = {
    imgCache: {},
    /* 预加载头像，避免绘制时还没到位 */
    preload(urls) {
      (urls || []).forEach(u => {
        if (!u || Poster.imgCache[u]) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { Poster.imgCache[u] = img; };
        img.onerror = () => { Poster.imgCache[u] = null; };
        Poster.imgCache[u] = img;
        img.src = u;
      });
      return Promise.resolve();
    },

    /**
     * 绘制海报
     * @param {Object} d 数据 { profile, players, matches, events, record }
     * @returns {HTMLCanvasElement}
     */
    draw(d) {
      const W = 750;                 // 逻辑宽度
      const PAD = 22;
      const CW = W - PAD * 2;        // 内容宽
      const SCALE = 2;               // 输出 2 倍图

      /* 先用离屏 canvas 量高度 */
      const probe = document.createElement('canvas').getContext('2d');
      const H = Poster.measure(probe, d, W, PAD, CW);

      const cv = document.createElement('canvas');
      cv.width = W * SCALE; cv.height = H * SCALE;
      const ctx = cv.getContext('2d');
      ctx.scale(SCALE, SCALE);
      ctx.textBaseline = 'alphabetic';

      /* ---- 背景（整张底，绝不会缺） ---- */
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      const bgG = ctx.createLinearGradient(0, 0, W, H);
      bgG.addColorStop(0, '#F7FBF9'); bgG.addColorStop(1, '#EEF4F1');
      ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

      Poster.paint(ctx, d, W, PAD, CW, H);
      return cv;
    },

    /* 量高度：与 paint 保持一致的排版 */
    measure(ctx, d, W, PAD, CW) {
      let y = 16;
      y += Poster.cardClubH(ctx, d, CW) + 14;
      y += Poster.cardFixtureH(ctx, d, CW) + 14;
      y += Poster.cardRankH(ctx, d, CW) + 14;
      y += 46 + 18;   // 页脚 + 底部留白
      return Math.round(y);
    },

    paint(ctx, d, W, PAD, CW, H) {
      let y = 16;
      y = Poster.cardClub(ctx, d, PAD, y, CW) + 14;
      y = Poster.cardFixture(ctx, d, PAD, y, CW) + 14;
      y = Poster.cardRank(ctx, d, PAD, y, CW) + 14;
      Poster.foot(ctx, d, PAD, y, CW);
    },

    /* ============ 俱乐部卡片 ============ */
    cardClubH(ctx, d, CW) {
      const p = d.profile || {};
      let h = 20;                                   // 上内边距
      h += 62;                                      // 队徽行
      h += 10;
      h += 20;                                      // 标签
      ctx.font = '400 12.5px ' + FONT;
      const intro = wrap(ctx, p.intro || '', CW - 40, 3);
      h += intro.length ? intro.length * 19 + 4 : 0;
      if (d.recent && d.recent.length) h += 30;     // 近况
      h += 18 + 52;                                 // 分隔线 + 数据栏
      h += 20;
      return h;
    },
    cardClub(ctx, d, x, y, CW) {
      const p = d.profile || {};
      const h = Poster.cardClubH(ctx, d, CW);

      /* 卡片：透明玻璃（与网页一致：半透明白底 + 深色文字） */
      const GLASS = 'rgba(255,255,255,.74)';
      const HAIR = 'rgba(11,95,66,.14)';
      const MAIN = '#0B5F42';

      fillRR(ctx, x, y, CW, h, 18, GLASS);
      rr(ctx, x, y, CW, h, 18);
      ctx.fillStyle = grad(ctx, x, y, CW, h, 'rgba(255,255,255,.80)', 'rgba(255,255,255,.62)'); ctx.fill();
      rr(ctx, x, y, CW, h, 18);
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.stroke();

      /* 右上角装饰圆（极淡，只做质感） */
      ctx.save(); rr(ctx, x, y, CW, h, 18); ctx.clip();
      ctx.beginPath(); ctx.arc(x + CW - 26, y - 26, 96, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(14,139,96,.10)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + CW + 16, y + h - 10, 64, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.30)'; ctx.fill();
      ctx.restore();

      let cy = y + 20;
      /* 队徽：主色实心，玻璃上的视觉锚点 */
      const logoUrl = p.logo_url;
      if (logoUrl && Poster.imgCache[logoUrl] && Poster.imgCache[logoUrl].complete && Poster.imgCache[logoUrl].naturalWidth) {
        ctx.save(); rr(ctx, x + 18, cy, 56, 56, 14); ctx.clip();
        ctx.drawImage(Poster.imgCache[logoUrl], x + 18, cy, 56, 56); ctx.restore();
      } else {
        fillRR(ctx, x + 18, cy, 56, 56, 14, MAIN);
        text(ctx, String(p.name || '狮').replace(/足球|俱乐部|队/g, '').slice(0, 2) || '狮',
          x + 18 + 28, cy + 28 + 1, { size: 23, weight: '800', color: '#fff', align: 'center', baseline: 'middle' });
      }
      /* 队名 + 口号 */
      const nx = x + 18 + 56 + 14;
      const maxW = CW - (nx - x) - 18;
      ctx.font = '800 21px ' + FONT;
      text(ctx, ellipsis(ctx, p.name || '狮山实达', maxW), nx, cy + 26, { size: 21, weight: '800', color: INK });
      if (p.slogan) text(ctx, ellipsis(ctx, p.slogan, maxW), nx, cy + 47, { size: 13, weight: '700', color: '#755000' });
      cy += 62 + 10;

      /* 标签：更透的玻璃 + 深字 */
      const tags = [p.founded ? '成立 ' + p.founded : '', p.home_venue || ''].filter(Boolean);
      let tx = x + 18;
      tags.forEach(t => {
        ctx.font = '600 11.5px ' + FONT;
        const w = ctx.measureText(t).width + 20;
        fillRR(ctx, tx, cy, w, 22, 11, 'rgba(255,255,255,.58)');
        rr(ctx, tx, cy, w, 22, 11); ctx.strokeStyle = HAIR; ctx.lineWidth = 1; ctx.stroke();
        text(ctx, t, tx + w / 2, cy + 11 + 1, { size: 11.5, weight: '600', color: INK, align: 'center', baseline: 'middle' });
        tx += w + 7;
      });
      cy += 22 + 8;

      /* 简介 */
      if (p.intro) {
        ctx.font = '400 12.5px ' + FONT;
        wrap(ctx, p.intro, CW - 36, 3).forEach(ln => {
          cy += 19; text(ctx, ln, x + 18, cy, { size: 12.5, color: INK2 });
        });
        cy += 4;
      }

      /* 近况小球 */
      if (d.recent && d.recent.length) {
        cy += 20;
        text(ctx, '近况', x + 18, cy, { size: 12, weight: '600', color: INK3 });
        let bx = x + 18 + 34;
        d.recent.slice(0, 6).forEach(r => {
          ctx.beginPath(); ctx.arc(bx + 9, cy - 4, 9, 0, Math.PI * 2);
          ctx.fillStyle = r.cls === 'w' ? '#0E9F6E' : r.cls === 'l' ? '#E02424' : '#6B7789'; ctx.fill();
          text(ctx, r.t, bx + 9, cy - 4 + 1, { size: 10, weight: '800', color: '#fff', align: 'center', baseline: 'middle' });
          bx += 22;
        });
        if (d.rate != null) text(ctx, '胜率 ' + d.rate + '%', x + CW - 18, cy, { size: 12, weight: '800', color: MAIN, align: 'right' });
        cy += 4;
      }

      /* 分隔线 */
      cy += 14;
      ctx.strokeStyle = HAIR; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 18, cy); ctx.lineTo(x + CW - 18, cy); ctx.stroke();

      /* 数据栏 */
      const stats = d.stats || [];
      const n = Math.max(stats.length, 1);
      const sw = (CW - 36) / n;
      stats.forEach((s, i) => {
        const cx = x + 18 + sw * i + sw / 2;
        text(ctx, s.v, cx, cy + 26, { size: 20, weight: '800', color: MAIN, align: 'center' });
        text(ctx, s.k, cx, cy + 44, { size: 11, color: INK3, align: 'center' });
        if (i > 0) {
          ctx.strokeStyle = HAIR;
          ctx.beginPath(); ctx.moveTo(x + 18 + sw * i, cy + 8); ctx.lineTo(x + 18 + sw * i, cy + 50); ctx.stroke();
        }
      });
      return y + h;
    },

    /* ============ 赛程卡片 ============ */
    cardFixtureH(ctx, d, CW) {
      const list = d.fixtures || [];
      return 46 + 10 + (list.length ? list.length * 52 : 34) + 14;
    },
    cardFixture(ctx, d, x, y, CW) {
      const h = Poster.cardFixtureH(ctx, d, CW);
      fillRR(ctx, x, y, CW, h, 14, 'rgba(255,255,255,.72)');
      rr(ctx, x, y, CW, h, 14); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.stroke();

      text(ctx, '赛程', x + 16, y + 28, { size: 15, weight: '700' });
      if (d.fixtureSub) text(ctx, d.fixtureSub, x + CW - 16, y + 28, { size: 11.5, color: MUTED, align: 'right' });

      let cy = y + 46 + 6;
      const list = d.fixtures || [];
      if (!list.length) {
        text(ctx, '暂无赛程', x + CW / 2, cy + 24, { size: 12.5, color: MUTED, align: 'center' });
        return y + h;
      }
      list.forEach(m => {
        /* 日期块 */
        fillRR(ctx, x + 14, cy, 40, 38, 9, '#F2F4F9');
        text(ctx, m.d, x + 14 + 20, cy + 17, { size: 15, weight: '800', color: NAVY, align: 'center' });
        text(ctx, m.m, x + 14 + 20, cy + 31, { size: 10, color: MUTED, align: 'center' });

        /* 第一行：编号 +（赛事标签）+ 我方 VS 对手
           与首页 homeFixtureRow 完全同源 */
        let tx = x + 64;
        if (m.seq) {
          const sTxt = '第' + m.seq + '场';
          ctx.font = '800 10.5px ' + FONT;
          const w = ctx.measureText(sTxt).width + 12;
          fillRR(ctx, tx, cy + 3, w, 16, 5, NAVY);
          text(ctx, sTxt, tx + w / 2, cy + 11 + 1, { size: 10.5, weight: '800', color: '#fff', align: 'center', baseline: 'middle' });
          tx += w + 6;
        }
        if (m.comp) {
          ctx.font = '700 10px ' + FONT;
          const w = ctx.measureText(m.comp).width + 12;
          fillRR(ctx, tx, cy + 3, w, 16, 4, m.compColor || '#1D4ED8');
          text(ctx, m.comp, tx + w / 2, cy + 11 + 1, { size: 10, weight: '700', color: '#fff', align: 'center', baseline: 'middle' });
          tx += w + 6;
        }
        /* 我方 VS 对手（只放下半部分空间内的宽度） */
        ctx.font = '700 13.5px ' + FONT;
        const rightLimit = CW - 16 - 62;              // 给右侧比分留位置
        const usName = ellipsis(ctx, m.us || '', rightLimit - tx - 40);
        text(ctx, usName, tx, cy + 24, { size: 13.5, weight: '700' });
        let vx = tx + ctx.measureText(usName).width + 6;
        /* VS 小标签 */
        ctx.font = '800 11.5px ' + FONT;
        const vw = ctx.measureText('VS').width + 10;
        fillRR(ctx, vx, cy + 15, vw, 15, 4, 'rgba(11,95,66,.10)');
        text(ctx, 'VS', vx + vw / 2, cy + 22.5 + 1, { size: 11.5, weight: '800', color: INK3, align: 'center', baseline: 'middle' });
        vx += vw + 6;
        const oppName = ellipsis(ctx, m.opp || '待定对手', Math.max(30, rightLimit - vx));
        text(ctx, oppName, vx, cy + 24, { size: 13.5, weight: '700' });

        /* 第二行：场地名（战绩在弹窗里，截图只显示场地名，与首页一致） */
        if (m.venueName) {
          text(ctx, '场地：' + m.venueName, x + 64, cy + 42, { size: 10.5, color: MUTED });
        } else {
          text(ctx, '场地待定', x + 64, cy + 42, { size: 10.5, color: MUTED });
        }

        /* 比分 / 状态 */
        ctx.font = '800 15px ' + FONT;
        text(ctx, m.score, x + CW - 16, cy + 17, { size: 15, weight: '800', color: m.scoreColor, align: 'right' });
        text(ctx, m.state, x + CW - 16, cy + 31, { size: 10.5, color: MUTED, align: 'right' });

        cy += 52;
      });
      return y + h;
    },

    /* ============ 榜单卡片（射手 + 助攻 两栏） ============ */
    cardRankH(ctx, d, CW) {
      const g = d.goals || [], a = d.assists || [];
      const rows = Math.max(g.length, a.length, 1);
      return 46 + 4 + (rows ? rows * 34 : 24) + 14;
    },
    cardRank(ctx, d, x, y, CW) {
      const h = Poster.cardRankH(ctx, d, CW);
      fillRR(ctx, x, y, CW, h, 14, 'rgba(255,255,255,.72)');
      rr(ctx, x, y, CW, h, 14); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.stroke();

      const half = CW / 2;
      text(ctx, '射手榜', x + 16, y + 28, { size: 15, weight: '700' });
      text(ctx, '助攻榜', x + half + 16, y + 28, { size: 15, weight: '700' });

      /* 中缝 */
      ctx.strokeStyle = LINE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + half, y + 14); ctx.lineTo(x + half, y + h - 14); ctx.stroke();

      let cy = y + 46;
      Poster.rankCol(ctx, d.goals || [], x + 16, cy, half - 32, GOLD);
      Poster.rankCol(ctx, d.assists || [], x + half + 16, cy, half - 32, '#3B6FD4');
      return y + h;
    },
    /* 榜单前三高亮配色（与网页 style.css 的 .rk.top1/2/3 一致）
       浅底深字，保证对比度 ≥ 4.5 */
    rankCol(ctx, rows, x, y0, W, accent) {
      let cy = y0;
      if (!rows.length) {
        text(ctx, '暂无数据', x + W / 2, cy + 22, { size: 12, color: MUTED, align: 'center' });
        return;
      }
      /* ★ 配色取自 APP_CONFIG.rankHighlight.colors（与网页 CSS 同一来源） */
      const CFG_R = (global.APP_CONFIG && global.APP_CONFIG.rankHighlight) || {};
      const TOP = (CFG_R.enabled === false) ? [] : (CFG_R.colors || []);
      rows.forEach((r, i) => {
        const t = (TOP && i < 3) ? TOP[i] : null;
        if (t) {
          /* 整行高亮底 + 左侧名次竖条 */
          fillRR(ctx, x - 6, cy + 1, W + 12, 31, 8, t.bg);
          fillRR(ctx, x - 6, cy + 1, 3, 31, 2, t.bar);
        }
        const color = t ? t.bar : MUTED;
        /* 前三用奖章 emoji，与网页一致 */
        if (i < 3) {
          const MEDALS = ['🥇', '🥈', '🥉'];
          text(ctx, MEDALS[i], x + 8, cy + 22, { size: 13, align: 'center', baseline: 'middle' });
        } else {
          text(ctx, i + 1, x + 8, cy + 22, { size: 12.5, weight: '800', color: color, align: 'center' });
        }
        avatar(ctx, r.name, r.avatar, x + 20, cy + 3, 22, t ? t.bar : NAVY, '#fff');
        text(ctx, ellipsis(ctx, r.name, W - 60), x + 48, cy + 16, { size: 13, weight: t ? '800' : '600', color: t ? t.nm : INK });
        text(ctx, '#' + (r.number || '-') + ' · ' + (r.position || '球员'), x + 48, cy + 28, { size: 10.5, color: MUTED });
        text(ctx, r.v, x + W, cy + 22, { size: 15, weight: '800', color: t ? t.v : accent, align: 'right' });
        cy += 34;
      });
    },

    /* ============ 页脚 ============ */
    foot(ctx, d, x, y, CW) {
      text(ctx, '狮山实达 · 数据统计', x + 2, y + 20, { size: 12, weight: '700', color: NAVY });
      text(ctx, d.date || '', x + CW - 2, y + 20, { size: 11.5, color: MUTED, align: 'right' });
    }
  };

  global.Poster = Poster;
})(window);
