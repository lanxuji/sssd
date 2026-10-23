/* ============================================================
 *  狮山实达数据统计 —— 主程序
 * ============================================================ */
(function () {
  'use strict';

  /* ★ 必须先定义：本文件后续大量使用 global（= window）。
     缺少这一行会导致脚本在首次使用 global 处直接中断，
     表现为「页面能显示但所有按钮点不动」。 */
  const global = window;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* ---------------- 全局错误提示 ----------------
     任何 JS 错误都显式告知，避免「点击无反应」却查不到原因 */
  window.addEventListener('error', e => {
    console.error('[运行错误]', e.message, e.filename, e.lineno);
    try { toast('出错了：' + (e.message || '未知错误')); } catch (_) { }
  });
  window.addEventListener('unhandledrejection', e => {
    console.error('[异步错误]', e.reason);
    try { toast('出错了：' + ((e.reason && e.reason.message) || '网络或数据异常')); } catch (_) { }
  });

  /* ★ 版本号：改代码时记得 +1，用于确认用户浏览器拿到的是不是最新版 */
  const APP_VER = 'v24';
  /* 实际生效的 Service Worker 缓存版本（从 sw.js 里读出来） */
  let SW_VER = '';
  async function readSwVer() {
    try {
      const res = await fetch('sw.js', { cache: 'no-store' });
      const txt = await res.text();
      const m = txt.match(/CACHE\s*=\s*'([^']+)'/);
      SW_VER = m ? m[1] : '?';
    } catch (e) { SW_VER = '?'; }
    return SW_VER;
  }
  readSwVer();

  const W = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* 赛事类型 */
  const COMPS = ['联赛', '杯赛', '友谊赛', '内部赛'];
  /* 事件类型：中文名 / 单位 / 榜单名 */
  const EV_TYPES = {
    goal: { name: '进球', unit: '球', lb: '射手榜' },
    assist: { name: '助攻', unit: '助', lb: '助攻榜' },
    app: { name: '出场', unit: '场', lb: '出场榜' },
    shoot: { name: '射门', unit: '次', lb: '射门榜' },
    clear: { name: '解围', unit: '次', lb: '解围榜' },
    save: { name: '扑救', unit: '次', lb: '扑救榜' },
    yellow: { name: '黄牌', unit: '张', lb: '黄牌榜' },
    red: { name: '红牌', unit: '张', lb: '红牌榜' },
    /* appear 是真实写入的事件类型（接龙导入的出场名单）；
       app 只是榜单用的虚拟口径，不写库 */
    appear: { name: '出场', unit: '场', lb: '出场榜' }
  };
  /* 可在比赛详情里单独录入的类型（不含 appear，出场走接龙导入） */
  const EV_INPUT = ['goal', 'assist', 'shoot', 'clear', 'save', 'yellow', 'red'];

  const ST = { profile: null, players: [], venues: [], matches: [], events: [], role: 'guest', admin: false, recorder: false, user: '', lb: 'goal', comp: '' };

  /* ---------------- 基础工具 ---------------- */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1900);
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function toISO(v) { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); }
  function fmtDateTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return '待定';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + W[d.getDay()] + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function dayBlock(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return { d: '?', m: '待定', t: '待定' };
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    return { d: d.getDate(), m: (d.getMonth() + 1) + '月', t: hh + ':' + mm };
  }
  function playerById(id) { return ST.players.find(p => p.id === id) || null; }
  function venueById(id) { return ST.venues.find(v => v.id === id) || null; }
  function avatarHtml(name, url, cls, num) {
    const n = esc(String(name || '?').slice(-2));
    const inner = url ? '<img src="' + esc(url) + '" alt="">' : esc(n);
    return '<div class="' + cls + '"' + (num != null ? ' data-num="' + esc(num) + '"' : '') + '>' + inner + '</div>';
  }

  /* ---------------- 登录状态 ----------------
     三种角色：guest（只读）/ recorder（录入员）/ admin（管理员） */
  function readLogin() {
    try { return JSON.parse(localStorage.getItem('sclh_login') || 'null'); }
    catch (e) { return null; }
  }
  function loadAdmin() {
    const s = readLogin();
    const ok = s && s.exp > Date.now() ? s.role : 'guest';
    ST.role = ok; ST.admin = ok === 'admin'; ST.recorder = ok === 'recorder';
    ST.user = (ok === 'guest' ? '' : (s.user || ''));
    return ST.role;
  }
  function setLogin(role, user) {
    ST.role = role; ST.user = user || '';
    ST.admin = role === 'admin'; ST.recorder = role === 'recorder';
    if (role === 'guest') localStorage.removeItem('sclh_login');
    else localStorage.setItem('sclh_login', JSON.stringify({
      role: role, user: user || '', exp: Date.now() + APP_CONFIG.adminSessionHours * 3600 * 1000
    }));
  }
  function logout() { setLogin('guest', ''); }
  function canEdit() { return ST.role === 'admin'; }          // 改球员/场地/球队资料/删数据
  function canRecord() { return ST.role === 'admin' || ST.role === 'recorder'; } // 录比赛
  function requireAdmin() {
    if (canEdit()) return true;
    toast('请先登录管理员账号');
    openAdmin();
    return false;
  }
  function requireRecord() {
    if (canRecord()) return true;
    toast('请先登录（管理员或录入员）');
    openAdmin();
    return false;
  }

  /* ---------------- 数据刷新 ---------------- */
  async function refresh(msg) {
    try {
      ST.profile = await Store.getProfile();
      ST.players = await Store.list('players');
      ST.venues = await Store.list('venues');
      ST.matches = await Store.list('matches');
      ST.events = await Store.list('events');
      renderAll();
      if (msg) toast(msg);
    } catch (e) {
      console.error(e); toast('数据读取失败：' + (e.message || e));
    }
  }

  /* ============================================================
   *  微信接龙导入
   *  从「#接龙 周四晚上8点，华涌2号场，实达（白色）对旺旺（红色）1. 秋风 …」
   *  里自动提取：日期时间 / 场地 / 对手 / 出场名单
   * ============================================================ */

  /* 昵称映射：config 预填的 + 本机现场选过的（本机优先合并） */
  function nickMapAll() {
    let local = {};
    try { local = JSON.parse(localStorage.getItem('sclh_nickmap') || '{}') || {}; } catch (e) { }
    return Object.assign({}, (APP_CONFIG.nicknameMap || {}), local);
  }
  function nickSave(nick, playerName) {
    let local = {};
    try { local = JSON.parse(localStorage.getItem('sclh_nickmap') || '{}') || {}; } catch (e) { }
    local[nick] = playerName;
    try { localStorage.setItem('sclh_nickmap', JSON.stringify(local)); } catch (e) { }
  }
  /* 按名字找球员（去掉空格后比较，容忍「孙文峰 / 孙 文峰」） */
  function playerByName(name) {
    const k = normOpp(name);
    if (!k) return null;
    return ST.players.find(p => normOpp(p.name) === k) || null;
  }

  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

  /* 清掉 emoji、括号内容、空格，得到可比较的昵称 */
  function cleanNick(raw) {
    let s = String(raw || '');
    s = s.replace(/[（(][^）)]*[）)]/g, '');   // 去掉括号及内容
    s = s.replace(EMOJI_RE, '');
    s = s.replace(/[\s\u3000]/g, '');
    s = s.replace(/^[、.,，。:：]+|[、.,，。:：]+$/g, '');
    return s.trim();
  }
  /* 括号里写着「待定 / 可能 / 不一定」的，整行跳过 */
  function isMaybe(raw) {
    const m = String(raw || '').match(/[（(]([^）)]*)[）)]/g) || [];
    return m.some(x => /待定|可能|不一定|未必|看看|争取|待确认/.test(x));
  }

  /* 从文本里提取日期时间：周X + 上午/下午/晚上 + N点 */
  function jielongDate(text) {
    const t = String(text || '');
    const wMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0, '末': 6 };
    let wd = null;
    const wm = t.match(/(?:周|星期|礼拜)\s*([一二三四五六日天末])/);
    if (wm) wd = wMap[wm[1]];
    let hh = null, mm = 0;
    const tm = t.match(/(上午|早上|早晨|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点:：時时]\s*(半|\d{1,2})?/);
    if (tm) {
      hh = Number(tm[2]);
      /* 支持「7点半」这种写法 */
      mm = tm[3] === '半' ? 30 : (tm[3] ? Number(tm[3]) : 0);
      const per = tm[1] || '';
      if (/下午|傍晚|晚上|夜里/.test(per)) { if (hh >= 1 && hh <= 11) hh += 12; else if (hh === 12 && /晚上|夜里/.test(per)) hh = 0; }
      else if (/中午/.test(per)) { if (hh >= 1 && hh <= 11) hh = 12; }
    }
    if (wd == null && hh == null) return '';
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (wd != null) {
      /* 找「下一个」该星期几；如果就是今天且时间还没到，也用今天 */
      let diff = (wd - base.getDay() + 7) % 7;
      base.setDate(base.getDate() + diff);
    }
    if (hh != null) base.setHours(hh, mm, 0, 0);
    else base.setHours(19, 30, 0, 0);
    const p = n => String(n).padStart(2, '0');
    return base.getFullYear() + '-' + p(base.getMonth() + 1) + '-' + p(base.getDate()) +
      'T' + p(base.getHours()) + ':' + p(base.getMinutes());
  }

  /* 从文本里认场地：取匹配到的最长场地名 */
  function jielongVenue(text) {
    const t = String(text || '');
    let best = null, bestLen = 0;
    ST.venues.forEach(v => {
      const n = (v.name || '').trim();
      if (!n) return;
      if (t.indexOf(n) >= 0 && n.length > bestLen) { best = v; bestLen = n.length; }
    });
    return best ? best.id : '';
  }

  /* 从「实达（白色）对旺旺（红色）」里认对手 */
  function jielongOpponent(text) {
    let t = String(text || '').replace(/[（(][^）)]*[）)]/g, ' ');
    const aliases = APP_CONFIG.ourAliases || ['实达', '狮山实达'];
    const m = t.match(/([\u4e00-\u9fa5A-Za-z0-9]{1,12})\s*(?:对|VS|vs|Vs|打|－|-|—)\s*([\u4e00-\u9fa5A-Za-z0-9]{1,12})/);
    if (!m) return '';
    const a = m[1], b = m[2];
    const isOurs = s => aliases.some(x => String(s).indexOf(x) >= 0);
    if (isOurs(a) && !isOurs(b)) return b;
    if (isOurs(b) && !isOurs(a)) return a;
    return b;   // 认不出我方时用后者
  }

  /* 提取名单行：以「1. 」「2、」「3)」等开头 */
  function jielongNames(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      const s = line.trim();
      if (!s) return;
      if (/^#/.test(s)) return;                      // 跳过 #接龙 那行
      const m = s.match(/^\s*(\d{1,3})\s*[.、)．，,、:：\-]\s*(.+)$/);
      if (!m) return;
      const raw = m[2].trim();
      out.push({ raw: raw, clean: cleanNick(raw), skip: isMaybe(raw) });
    });
    return out.filter(x => x.clean);
  }

  /* 昵称 → 球员：精确 → 映射表 → 包含关系 */
  function matchPlayer(clean) {
    if (!clean) return null;
    let p = playerByName(clean);
    if (p) return p;
    const nm = nickMapAll();
    if (nm[clean]) { p = playerByName(nm[clean]); if (p) return p; }
    const k = normOpp(clean);
    p = ST.players.find(x => {
      const n = normOpp(x.name);
      if (!n) return false;
      return n === k || n.indexOf(k) >= 0 || k.indexOf(n) >= 0;
    }) || null;
    return p;
  }

  /* 解析整段接龙 */
  function jielongParse(text) {
    const names = jielongNames(text);
    const items = names.map(x => {
      const p = x.skip ? null : matchPlayer(x.clean);
      return { raw: x.raw, clean: x.clean, skip: x.skip, player: p };
    });
    return {
      date: jielongDate(text),
      venueId: jielongVenue(text),
      opponent: jielongOpponent(text),
      items: items,
      matched: items.filter(x => x.player).length,
      skipped: items.filter(x => x.skip).length,
      unknown: items.filter(x => !x.skip && !x.player)
    };
  }

  /* ---------------- 统计计算 ---------------- */
  /* 榜单统计：支持 goal/assist/app/shoot/yellow/red，进球额外统计点球数 */
  function board(type) {
    const map = {};
    if (type === 'app') {
      /* 出场口径（两套并存，按比赛区分）：
         · 有接龙出场名单的比赛 → 只认名单里有的人（appear 事件）
         · 没有出场名单的比赛   → 有任意事件（进球/助攻/射门/牌）即算出场
         这样导入接龙后出场数准确，没导入的比赛也不会漏。 */
      const hasList = new Set();
      ST.events.forEach(e => { if (e.type === 'appear' && e.match_id) hasList.add(e.match_id); });
      const byList = {}, byEvent = {};
      ST.events.forEach(e => {
        if (!e.match_id || !e.player_id) return;
        if (e.type === 'appear') {
          (byList[e.player_id] = byList[e.player_id] || new Set()).add(e.match_id);
        } else if (!hasList.has(e.match_id)) {
          (byEvent[e.player_id] = byEvent[e.player_id] || new Set()).add(e.match_id);
        }
      });
      [byList, byEvent].forEach(src => {
        Object.keys(src).forEach(pid => {
          const m = map[pid] = map[pid] || { v: new Set(), pen: 0 };
          src[pid].forEach(mid => m.v.add(mid));
        });
      });
    } else {
      ST.events.forEach(e => {
        if (e.type !== type) return;
        const c = Number(e.count) || 0;
        const m = map[e.player_id] = map[e.player_id] || { v: 0, pen: 0 };
        m.v += c;
        if (e.is_penalty && type === 'goal') m.pen += c;
      });
    }
    const rows = Object.keys(map).map(pid => {
      const p = playerById(pid); if (!p) return null;
      const v = type === 'app' ? map[pid].v.size : map[pid].v;
      return { p: p, v: v, pen: map[pid].pen || 0 };
    }).filter(Boolean);
    rows.sort((a, b) => b.v - a.v || (Number(a.p.number) || 99) - (Number(b.p.number) || 99));
    return rows;
  }
  /* 球队战绩：胜/平/负、积分、胜率 */
  function record() {
    const fin = finishedMatches();
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    fin.forEach(m => {
      const a = Number(m.our_score) || 0, b = Number(m.opp_score) || 0;
      gf += a; ga += b;
      if (a > b) w++; else if (a < b) l++; else d++;
    });
    const n = fin.length;
    return { n: n, w: w, d: d, l: l, gf: gf, ga: ga, pts: w * 3 + d, gd: gf - ga, rate: n ? Math.round(w / n * 100) : 0 };
  }
  function totalGoals() {
    return ST.matches.filter(m => m.status === 'finished').reduce((s, m) => s + (Number(m.our_score) || 0), 0);
  }
  function finishedMatches() { return ST.matches.filter(m => m.status === 'finished'); }

  /* 某场地的历史战绩：胜/平/负 + 胜率（只统计已结束的比赛） */
  function venueRecord(vid) {
    if (!vid) return null;
    const fin = finishedMatches().filter(m => m.venue_id === vid);
    if (!fin.length) return null;
    let w = 0, d = 0, l = 0;
    fin.forEach(m => {
      const a = Number(m.our_score) || 0, b = Number(m.opp_score) || 0;
      if (a > b) w++; else if (a < b) l++; else d++;
    });
    const n = fin.length;
    return { n: n, w: w, d: d, l: l, rate: Math.round(w / n * 100) };
  }
  /* 胜率分级配色：≤60% 红，60~80% 黄，>80% 绿 */
  function rateClass(rate) {
    const r = Number(rate) || 0;
    return r <= 60 ? 'rt-low' : (r <= 80 ? 'rt-mid' : 'rt-high');
  }

  /* 把场地战绩渲染成小徽标，如「弘艺 3胜1平1负 · 60%」 */
  function venueTagHtml(m) {
    const v = venueById(m.venue_id);
    if (!v) return '';
    const r = venueRecord(m.venue_id);
    if (!r) return '<span class="fix-venue">' + esc(v.name) + '</span>';
    return '<span class="fix-venue has-rec ' + rateClass(r.rate) + '">' + esc(v.name) +
      '<i>' + r.w + '胜' + r.d + '平' + r.l + '负 · ' + r.rate + '%</i></span>';
  }

  /* 对手名归一化：去首尾空格、全角空格、统一小写，避免「XX队 / XX队 」算成两个对手 */
  function normOpp(s) {
    return String(s || '').replace(/[\s\u3000]+/g, '').toLowerCase();
  }

  /* 与某个对手的历史交锋：胜/平/负 + 胜率（只算已结束的） */
  function oppRecord(name) {
    const key = normOpp(name);
    if (!key) return null;
    const fin = finishedMatches().filter(m => normOpp(m.opponent) === key);
    if (!fin.length) return null;
    let w = 0, d = 0, l = 0;
    fin.forEach(m => {
      const a = Number(m.our_score) || 0, b = Number(m.opp_score) || 0;
      if (a > b) w++; else if (a < b) l++; else d++;
    });
    const n = fin.length;
    return { n: n, w: w, d: d, l: l, rate: Math.round(w / n * 100) };
  }
  /* 交锋战绩徽标：紧跟对手名，如「南海雄鹰 2胜1平1负 · 67%」 */
  function oppTagHtml(m) {
    const r = oppRecord(m.opponent);
    if (!r) return '';
    return '<span class="fix-opprec ' + rateClass(r.rate) + '">' +
      r.w + '胜' + r.d + '平' + r.l + '负 · ' + r.rate + '%</span>';
  }
  function wins() { return finishedMatches().filter(m => (Number(m.our_score) || 0) > (Number(m.opp_score) || 0)).length; }

  /* ---------------- 渲染 ---------------- */
  function renderAll() {
    renderClub(); renderHomeFixtures(); renderHomeBoards();
    renderCompFilter(); renderFixtures(); renderFullRank(); renderPlayers(); renderVenues();
    if (ST.view === 'record') renderRecord();
    /* 只读身份隐藏「添加」类按钮 */
    ['#btnAddMatch', '#btnAddPlayer', '#btnAddVenue'].forEach(s => {
      const n = $(s); if (n) n.style.display = canEdit() ? '' : 'none';
    });
    /* ---- 顶栏：按 config.topbar 决定显示什么（发给队友时可更干净） ---- */
    const TB = Object.assign({ showVersion: 'admin', showMode: true, showAdminBtn: true },
      (APP_CONFIG.topbar || {}));
    const mt = $('#modeTag');
    if (mt) {
      if (TB.showMode) {
        mt.textContent = (Store.isCloud() ? '云端已连接' : '⚠️ 本机模式') +
          (ST.role === 'admin' ? ' · 管理员' : ST.role === 'recorder' ? ' · 录入员' : '');
        mt.style.display = '';
        mt.classList.toggle('warn', !Store.isCloud());
        mt.title = Store.isCloud() ? '数据存云端，全队共享' : '数据只存这台设备，队友看不到';
      } else {
        mt.textContent = '';
        mt.style.display = 'none';
      }
    }
    /* 版本号：默认只对管理员显示，队友看不到 */
    const vt0 = $('#verTag');
    if (vt0) {
      const vis = TB.showVersion === 'always' || (TB.showVersion === 'admin' && canEdit());
      vt0.style.display = vis ? '' : 'none';
    }
    /* 齿轮：可隐藏（隐藏后需靠 #admin 进后台） */
    const ab = $('#btnAdmin');
    if (ab) ab.style.display = TB.showAdminBtn ? '' : 'none';
    $('#venueHint').textContent = '共 ' + ST.venues.length + ' 个场地';
    const d = new Date();
    $('#shotDate').textContent = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const fs = $('#seasonFilter');
    const seasons = Array.from(new Set(ST.matches.map(m => m.season).filter(Boolean))).sort().reverse();
    const cur = fs.value;
    fs.innerHTML = '<option value="">全部赛季</option>' + seasons.map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
    if (cur) fs.value = cur;
  }

  function renderClub() {
    const p = ST.profile || DEFAULT_PROFILE;
    $('#clubName').textContent = p.name || '狮山实达';
    $('#clubSlogan').textContent = p.slogan || '';
    $('#clubFounded').textContent = '成立 ' + (p.founded || '--');
    $('#clubHome').textContent = p.home_venue || '主场待定';
    $('#clubIntro').textContent = p.intro || '';
    $('#appTitle').textContent = APP_CONFIG.appName;
    const logo = $('#clubLogo');
    logo.innerHTML = p.logo_url ? '<img src="' + esc(p.logo_url) + '" alt="">' : esc(String(p.name || '狮').replace(/足球|俱乐部|队/g, '').slice(0, 2) || '狮');
    const r = record();
    /* 近 5 场战绩小球（胜绿 / 平灰 / 负红） */
    const recent = finishedMatches().slice(0, 5).map(m => {
      const a = Number(m.our_score) || 0, b = Number(m.opp_score) || 0;
      const cls = a > b ? 'w' : (a < b ? 'l' : 'd');
      const t = a > b ? '胜' : (a < b ? '负' : '平');
      return '<i class="fm ' + cls + '">' + t + '</i>';
    }).join('');
    $('#clubForm').innerHTML = recent
      ? '<div class="formline"><span class="formlab">近况</span>' + recent + '<span class="formrate">胜率 ' + r.rate + '%</span></div>'
      : '';
    $('#clubStats').innerHTML =
      '<div class="st"><b>' + r.n + '</b><span>已赛</span></div>' +
      '<div class="st"><b>' + r.pts + '</b><span>积分</span></div>' +
      '<div class="st"><b>' + r.gf + '</b><span>进球</span></div>' +
      '<div class="st"><b>' + (r.gd > 0 ? '+' : '') + r.gd + '</b><span>净胜球</span></div>' +
      '<div class="st"><b>' + ST.players.filter(x => x.active !== false).length + '</b><span>在队</span></div>';
  }

  function fixtureRow(m) {
    const db = dayBlock(m.match_date);
    const fin = m.status === 'finished';
    let score = '', cls = '';
    if (fin) {
      const a = Number(m.our_score) || 0, b = Number(m.opp_score) || 0;
      score = a + ' : ' + b;
      cls = a > b ? 'win' : (a < b ? 'lose' : 'draw');
    } else if (m.status === 'cancelled') { score = '取消'; cls = 'draw'; }
    else { score = m.match_date ? '未开始' : '待定'; cls = 'draw'; }
    const v = venueById(m.venue_id);
    const cp = m.competition || '';
    /* 排列顺序：日期 → 对手（+ 交锋战绩）→ 场地（+ 场地战绩）
       赛事徽标作为行首小标签，紧跟对手名 */
    return '<div class="fix" data-mid="' + esc(m.id) + '">' +
      '<div class="fix-date"><b>' + db.d + '</b><span>' + db.m + '</span></div>' +
      '<div class="fix-mid">' +
        '<div class="fix-top">' +
          (cp ? '<span class="ctag c-' + esc(cp) + '">' + esc(cp) + '</span>' : '') +
          '<span class="fix-opp">' + esc(m.opponent || '待定对手') + '</span>' +
          oppTagHtml(m) +
        '</div>' +
        /* 第二行：场地 + 该场地战绩 */
        '<div class="fix-extra">' +
          (v ? venueTagHtml(m) : '<span class="fix-venue">场地待定</span>') +
          esc(m.round || '') + '</div></div>' +
      '<div class="fix-right"><div class="fix-score ' + cls + '">' + score + '</div>' +
      '<div style="margin-top:3px"><span class="pill ' + (fin ? 'fin' : 'up') + '">' + (fin ? '已结束' : (m.status === 'cancelled' ? '已取消' : '未开始')) + '</span>' +
      '</div></div></div>';
  }

  function renderHomeFixtures() {
    /* 首页只显示最新 5 场：
       优先放最近的 2 场未开赛（未来赛程要看得见），
       剩余名额用最近已结束的比赛补足。 */
    const HOME_N = 5, UP_N = 2;
    const up = ST.matches.filter(m => m.status === 'upcoming')
      .sort((a, b) => new Date(a.match_date || 9e15) - new Date(b.match_date || 9e15))
      .slice(0, UP_N);
    const fin = finishedMatches().slice(0, Math.max(0, HOME_N - up.length));
    const list = up.concat(fin);
    $('#homeFixtures').innerHTML = list.length ? list.map(m => fixtureRow(m)).join('') :
      '<div class="empty"><i>📅</i>暂无赛程，点击右上角 ⚙️ 登录后可添加</div>';
    $('#fixtureSub').textContent = '共 ' + ST.matches.length + ' 场';
  }

  /* limit: 传 0 或 null 表示不限制，有数据的全部显示；clickable: 是否可点进球员信息卡 */
  function rankHtml(rows, limit, emptyTxt, clickable) {
    if (!rows.length) return '<div class="empty" style="padding:14px 0">' + (emptyTxt || '暂无数据') + '</div>';
    const r = limit ? rows.slice(0, limit) : rows;
    return r.map((x, i) => {
      const cls = i === 0 ? 't1' : i === 1 ? 't2' : i === 2 ? 't3' : '';
      const tail = clickable ? '<span class="rk-go">›</span>' : '';
      return '<div class="rk' + (clickable ? ' tap' : '') + '"' + (clickable ? ' data-pid="' + esc(x.p.id) + '"' : '') + '>' +
        '<div class="rk-no ' + cls + '">' + (i + 1) + '</div>' +
        avatarHtml(x.p.name, x.p.avatar_url, 'rk-av') +
        '<div class="rk-nm">' + esc(x.p.name) + (x.p.number ? '<small>#' + esc(x.p.number) + '</small>' : '') + '</div>' +
        '<div class="rk-v">' + x.v + '</div>' + tail + '</div>';
    }).join('');
  }

  /* 给榜单行绑定点击 → 打开球员信息卡 */
  function bindRankTap(scope) {
    $$(scope + ' .rk.tap').forEach(n => n.onclick = () => {
      const p = playerById(n.dataset.pid);
      if (p) openPlayerDetail(p);
    });
  }

  function renderHomeBoards() {
    /* 不限条数：有进球/助攻数据的球员全部列出 */
    $('#homeGoals').innerHTML = rankHtml(board('goal'), 0, '暂无进球数据', true);
    $('#homeAssists').innerHTML = rankHtml(board('assist'), 0, '暂无助攻数据', true);
    bindRankTap('#homeGoals');
    bindRankTap('#homeAssists');
  }

  /* 赛事筛选标签 */
  function renderCompFilter() {
    const used = Array.from(new Set(ST.matches.map(m => m.competition).filter(Boolean)));
    const all = ['全部'].concat(COMPS.filter(c => used.indexOf(c) >= 0))
      .concat(used.filter(c => COMPS.indexOf(c) < 0 && c !== '全部'));
    const el = $('#compFilter');
    el.innerHTML = all.map(c => {
      const v = c === '全部' ? '' : c;
      const n = c === '全部' ? ST.matches.length : ST.matches.filter(m => (m.competition || '') === v).length;
      return '<button class="chip' + (ST.comp === v ? ' on' : '') + '" data-c="' + esc(v) + '">' + esc(c) + ' ' + n + '</button>';
    }).join('');
    $$('#compFilter .chip').forEach(b => b.onclick = () => { ST.comp = b.dataset.c; renderFixtures(); renderCompFilter(); });
  }

  function renderFixtures() {
    const s = $('#seasonFilter').value;
    let list = ST.matches.slice().sort((a, b) => new Date(b.match_date || 0) - new Date(a.match_date || 0));
    if (s) list = list.filter(m => m.season === s);
    if (ST.comp) list = list.filter(m => (m.competition || '') === ST.comp);
    const el = $('#allFixtures');
    if (!list.length) {
      el.innerHTML = '<div class="empty"><i>📅</i>暂无赛程</div>';
    } else {
      /* 按月份分组 */
      const groups = []; let cur = null;
      list.forEach(m => {
        const d = new Date(m.match_date || 0);
        const key = isNaN(d) ? '待定' : (d.getFullYear() + '年' + (d.getMonth() + 1) + '月');
        if (!cur || cur.key !== key) { cur = { key: key, list: [] }; groups.push(cur); }
        cur.list.push(m);
      });
      el.innerHTML = groups.map(g =>
        '<div class="grp-hd"><span>' + esc(g.key) + '</span><i>' + g.list.length + ' 场</i></div>' +
        g.list.map(m => fixtureRow(m)).join('')
      ).join('');
    }
    $$('#allFixtures .fix').forEach(n => n.onclick = () => openMatch(n.dataset.mid));
    $$('#homeFixtures .fix').forEach(n => n.onclick = () => openMatch(n.dataset.mid));
  }

  function renderFullRank() {
    const t = ST.lb;
    const rows = board(t);
    const meta = EV_TYPES[t] || { name: '数据', unit: '', lb: '榜单' };
    const showPen = t === 'goal';
    let html = '';
    if (!rows.length) {
      html = '<div class="empty"><i>🏆</i>暂无' + meta.name + '数据</div>';
    } else {
      html = '<div class="rk-hd">' +
        '<span class="rk-c1">' + meta.lb + '</span>' +
        (showPen ? '<span class="rk-c2">点球</span>' : '') +
        '<span class="rk-c3">' + meta.name + '</span></div>';
      html += rows.map((x, i) => {
        const cls = i === 0 ? 't1' : i === 1 ? 't2' : i === 2 ? 't3' : '';
        const sub = '<small>#' + esc(x.p.number || '-') + ' · ' + esc(x.p.position || '球员') + '</small>';
        const pen = showPen ? '<span class="rk-c2">' + (x.pen || 0) + '</span>' : '';
        return '<div class="rk tap" data-pid="' + esc(x.p.id) + '"><div class="rk-no ' + cls + '">' + (i + 1) + '</div>' +
          avatarHtml(x.p.name, x.p.avatar_url, 'rk-av') +
          '<div class="rk-nm c1">' + esc(x.p.name) + sub + '</div>' +
          pen +
          '<div class="rk-v c3">' + x.v + '</div><span class="rk-go">›</span></div>';
      }).join('');
    }
    $('#fullRank').innerHTML = html;
    bindRankTap('#fullRank');
    $('#statMatches').innerHTML = finishedMatches().slice(0, 5).map(m => fixtureRow(m)).join('') ||
      '<div class="empty" style="padding:14px 0">暂无比赛记录</div>';
    $$('#statMatches .fix').forEach(n => n.onclick = () => openMatch(n.dataset.mid));
  }

  function renderPlayers() {
    const kw = ($('#playerSearch').value || '').trim().toLowerCase();
    let list = ST.players.slice().sort((a, b) => (Number(a.number) || 99) - (Number(b.number) || 99));
    if (kw) list = list.filter(p => (p.name || '').toLowerCase().includes(kw) || String(p.number || '').includes(kw));
    const g = board('goal'), a = board('assist');
    const gm = {}, am = {};
    g.forEach(x => gm[x.p.id] = x.v); a.forEach(x => am[x.p.id] = x.v);
    $('#playerList').innerHTML = list.length ? list.map(p =>
      '<div class="card" data-pid="' + esc(p.id) + '">' +
      avatarHtml(p.name, p.avatar_url, 'c-av c-num', p.number) +
      '<div class="c-mid"><div class="c-t">' + esc(p.name) + (p.active === false ? ' <span class="badge off">离队</span>' : '') + '</div>' +
      '<div class="c-s">' + esc(p.position || '位置待定') + ' · 进 ' + (gm[p.id] || 0) + ' 球 · 助 ' + (am[p.id] || 0) + ' 次' + (p.phone ? ' · ' + esc(p.phone) : '') + '</div></div>' +
      '<div class="c-g" style="font-size:12px;color:#7A8399">›</div></div>').join('') :
      '<div class="empty"><i>👥</i>暂无球员</div>';
    $$('#playerList .card').forEach(n => n.onclick = () => openPlayer(n.dataset.pid));
  }

  function renderVenues() {
    $('#venueList').innerHTML = ST.venues.length ? ST.venues.map(v =>
      '<div class="card" data-vid="' + esc(v.id) + '">' +
      '<div class="c-av">⚽</div>' +
      '<div class="c-mid"><div class="c-t">' + esc(v.name) + '</div>' +
      '<div class="c-s">' + esc([v.surface, v.price != null && v.price !== '' ? '¥' + v.price + '/场' : '', v.address].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="c-g" style="font-size:12px;color:#7A8399">›</div></div>').join('') :
      '<div class="empty"><i>⚽</i>暂无场地</div>';
    $$('#venueList .card').forEach(n => n.onclick = () => openVenue(n.dataset.vid));
  }

  /* ---------------- 弹窗 ---------------- */
  function openSheet(title, html, after) {
    const t = $('#sheetTitle'), b = $('#sheetBody'), s = $('#sheet'), m = $('#mask');
    if (!b || !s) {                       // 结构缺失时降级为 alert，绝不让脚本静默中断
      console.error('弹窗结构缺失', { t: !!t, b: !!b, s: !!s, m: !!m });
      alert('页面结构未就绪，请刷新页面重试');
      return;
    }
    if (t) t.textContent = title;
    b.innerHTML = html;
    s.classList.add('on'); if (m) m.classList.add('on');
    if (after) {
      try { after(b); }
      catch (e) { console.error('弹窗回调出错', e); toast('界面初始化出错：' + (e.message || e)); }
    }
  }
  function closeSheet() {
    const s = $('#sheet'), m = $('#mask');
    if (s) { s.classList.remove('on'); s.classList.remove('pd-mode'); }
    if (m) m.classList.remove('on');
  }
  /* 安全绑定：元素不存在时只警告，不中断整个脚本 */
  function on(sel, ev, fn) {
    const n = $(sel);
    if (!n) { console.warn('未找到元素', sel); return null; }
    n[ev] = fn; return n;
  }
  on('#sheetClose', 'onclick', closeSheet);
  on('#mask', 'onclick', closeSheet);

  /* ---------------- 球队介绍 ---------------- */
  function openProfile() {
    const p = ST.profile || DEFAULT_PROFILE;
    openSheet('球队介绍',
      '<div class="fld"><label>球队名称</label><input class="ipt" id="f_name" value="' + esc(p.name || '') + '"></div>' +
      '<div class="fld"><label>口号</label><input class="ipt" id="f_slogan" value="' + esc(p.slogan || '') + '"></div>' +
      '<div class="row2"><div class="fld"><label>成立年份</label><input class="ipt" id="f_founded" value="' + esc(p.founded || '') + '"></div>' +
      '<div class="fld"><label>主场</label><input class="ipt" id="f_home" value="' + esc(p.home_venue || '') + '"></div></div>' +
      '<div class="fld"><label>队徽图片地址（可留空）</label><input class="ipt" id="f_logo" placeholder="https://..." value="' + esc(p.logo_url || '') + '"></div>' +
      '<div class="fld"><label>球队简介</label><textarea class="ipt" id="f_intro" rows="4">' + esc(p.intro || '') + '</textarea></div>' +
      '<div class="acts"><button class="btn" id="f_save">保存</button></div>', () => {
        $('#f_save').onclick = async () => {
          try {
            await Store.saveProfile({
              name: $('#f_name').value.trim(), slogan: $('#f_slogan').value.trim(),
              founded: $('#f_founded').value.trim(), home_venue: $('#f_home').value.trim(),
              logo_url: $('#f_logo').value.trim(), intro: $('#f_intro').value.trim()
            });
            closeSheet(); refresh('球队介绍已更新');
          } catch (e) { toast('保存失败：' + e.message); }
        };
      });
  }

  /* ---------------- 比赛 ---------------- */
  function openMatch(id) {
    const m = ST.matches.find(x => x.id === id); if (!m) return;
    const admin = canEdit();
    const vOpts = ST.venues.map(v => '<option value="' + esc(v.id) + '"' + (v.id === m.venue_id ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('');
    let html = '';
    if (admin) {
      html +=
        '<div class="fld"><label>对手</label><input class="ipt" id="m_opp" value="' + esc(m.opponent || '') + '"></div>' +
        '<div class="fld"><label>比赛时间</label><input class="ipt" type="datetime-local" id="m_date" value="' + toLocalInput(m.match_date) + '"></div>' +
        '<div class="row2"><div class="fld"><label>赛季</label><input class="ipt" id="m_season" value="' + esc(m.season || '') + '"></div>' +
        '<div class="fld"><label>轮次</label><input class="ipt" id="m_round" value="' + esc(m.round || '') + '"></div></div>' +
        '<div class="fld"><label>赛事</label><div class="seg five" id="m_comp">' +
        COMPS.map(c => '<button data-v="' + esc(c) + '" class="' + ((m.competition || '联赛') === c ? 'on' : '') + '">' + esc(c) + '</button>').join('') +
        '</div></div>' +
        '<div class="fld"><label>主客场</label><div class="seg" id="m_side"><button data-v="1" class="' + (m.is_home ? 'on' : '') + '">主场</button><button data-v="0" class="' + (m.is_home ? '' : 'on') + '">客场</button></div></div>' +
        '<div class="fld"><label>场地</label><select class="ipt" id="m_venue"><option value="">未指定</option>' + vOpts + '</select></div>' +
        '<div class="fld"><label>比分</label><div class="row2">' +
        '<div><input class="ipt" type="number" id="m_ourscore" placeholder="我方" value="' + (m.our_score == null ? '' : m.our_score) + '"></div>' +
        '<div><input class="ipt" type="number" id="m_oppscore" placeholder="对手" value="' + (m.opp_score == null ? '' : m.opp_score) + '"></div></div></div>' +
        '<div class="fld"><label>状态</label><div class="seg" id="m_status">' +
        ['upcoming:未开始', 'finished:已结束', 'cancelled:已取消'].map(s => {
          const [k, t] = s.split(':');
          return '<button data-v="' + k + '" class="' + (m.status === k ? 'on' : '') + '">' + t + '</button>';
        }).join('') + '</div></div>' +
        '<div class="fld"><label>备注</label><input class="ipt" id="m_remark" value="' + esc(m.remark || '') + '"></div>' +
        '<div class="acts"><button class="btn" id="m_save">保存</button><button class="btn red" id="m_del">删除</button></div>';
    } else {
      html += '<div class="note">' + esc(m.opponent || '待定对手') + ' · ' + fmtDateTime(m.match_date) + ' · ' +
        (m.is_home ? '主场' : '客场') + '<br>比分：' +
        (m.status === 'finished' ? (Number(m.our_score) || 0) + ' : ' + (Number(m.opp_score) || 0) : (m.status === 'cancelled' ? '已取消' : '未开始')) +
        (m.remark ? '<br>' + esc(m.remark) : '') + '</div>';
      /* 录入员可删除自己录入的那场 */
      if (ST.role === 'recorder' && m.created_by && m.created_by === ST.user) {
        html += '<div style="margin-top:10px"><button class="btn wide red" id="m_mydel">删除我录入的这场</button></div>';
      }
    }
    html += '<div class="block-hd" style="margin-top:6px"><h3>本场数据</h3>' + (admin ? '<span class="block-sub" id="m_add">＋ 录入</span>' : '') + '</div>';
    html += '<div id="m_events">' + eventsHtml(id, admin) + '</div>';

    openSheet('比赛详情', html, () => {
      if (admin) {
        segBind('#m_side', '#m_side'); segBind('#m_status', '#m_status'); segBind('#m_comp');
        $('#m_save').onclick = async () => {
          try {
            const patch = {
              opponent: $('#m_opp').value.trim(), match_date: toISO($('#m_date').value),
              season: $('#m_season').value.trim(), round: $('#m_round').value.trim(),
              competition: $('#m_comp button.on') ? $('#m_comp button.on').dataset.v : (m.competition || '联赛'),
              is_home: $('#m_side button.on').dataset.v === '1',
              venue_id: $('#m_venue').value || null,
              our_score: $('#m_ourscore').value === '' ? null : Number($('#m_ourscore').value),
              opp_score: $('#m_oppscore').value === '' ? null : Number($('#m_oppscore').value),
              status: $('#m_status button.on').dataset.v, remark: $('#m_remark').value.trim()
            };
            await Store.update('matches', m.id, patch);
            closeSheet(); refresh('已保存');
          } catch (e) { toast('保存失败：' + e.message); }
        };
        $('#m_del').onclick = async () => {
          if (!confirm('确定删除这场比赛？相关进球/助攻数据也会移除')) return;
          await Store.removeWhere('events', 'match_id', m.id);
          await Store.remove('matches', m.id);
          closeSheet(); refresh('已删除');
        };
        $('#m_add').onclick = () => openEvent(m.id);
      }
      bindEventDel(id);
      if ($('#m_mydel')) $('#m_mydel').onclick = async () => {
        if (!confirm('删除这场比赛？其进球/助攻数据也会一起移除。')) return;
        await Store.removeWhere('events', 'match_id', id);
        await Store.remove('matches', id);
        closeSheet(); refresh('已删除');
      };
    });
  }

  function eventsHtml(mid, admin) {
    const evs = ST.events.filter(e => e.match_id === mid);
    if (!evs.length) return '<div class="empty" style="padding:14px 0">暂无比赛数据</div>';
    const order = ['goal', 'assist', 'shoot', 'clear', 'save', 'yellow', 'red'];
    evs.sort((a, b) => {
      const ia = order.indexOf(a.type), ib = order.indexOf(b.type);
      return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib) || (Number(a.minute) || 0) - (Number(b.minute) || 0);
    });
    return evs.map(e => {
      const p = playerById(e.player_id);
      const meta = EV_TYPES[e.type] || { name: e.type };
      const cls = { goal: '', assist: 'a', shoot: 's', clear: 'c', save: 'v', yellow: 'y', red: 'r' }[e.type] || '';
      const tag = (e.type === 'goal' && e.is_penalty) ? '<i class="ptag">点</i>' : '';
      return '<div class="ev"><div class="ev-b ' + cls + '">' + meta.name + '</div>' +
        '<div class="ev-m">' + esc(p ? p.name : '未知球员') + tag +
        '<small>' + (e.count || 1) + ' ' + (meta.unit || '次') + (e.minute ? ' · ' + e.minute + "'" : '') + '</small></div>' +
        (admin ? '<button class="ev-x" data-eid="' + esc(e.id) + '">✕</button>' : '') + '</div>';
    }).join('');
  }
  function bindEventDel(mid) {
    $$('#m_events .ev-x').forEach(b => b.onclick = async () => {
      await Store.remove('events', b.dataset.eid);
      ST.events = ST.events.filter(e => e.id !== b.dataset.eid);
      $('#m_events').innerHTML = eventsHtml(mid, true); bindEventDel(mid);
      refresh();
    });
  }
  function segBind(sel) {
    $$(sel + ' button').forEach(b => b.onclick = () => {
      $$(sel + ' button').forEach(x => x.classList.remove('on')); b.classList.add('on');
    });
  }

  function openMatchNew() {
    if (!requireAdmin()) return;
    const vOpts = ST.venues.map(v => '<option value="' + esc(v.id) + '">' + esc(v.name) + '</option>').join('');
    const d = new Date(Date.now() + 3 * 86400000); d.setHours(19, 30, 0, 0);
    openSheet('添加比赛',
      '<div class="fld"><label>对手</label><input class="ipt" id="m_opp" placeholder="对手队名"></div>' +
      '<div class="fld"><label>比赛时间</label><input class="ipt" type="datetime-local" id="m_date" value="' + toLocalInput(d.toISOString()) + '"></div>' +
      '<div class="row2"><div class="fld"><label>赛季</label><input class="ipt" id="m_season" value="' + (new Date().getFullYear()) + '"></div>' +
      '<div class="fld"><label>轮次</label><input class="ipt" id="m_round" placeholder="如 第1轮"></div></div>' +
      '<div class="fld"><label>赛事</label><div class="seg five" id="m_comp">' +
      COMPS.map((c, i) => '<button data-v="' + esc(c) + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(c) + '</button>').join('') +
      '</div></div>' +
      '<div class="fld"><label>主客场</label><div class="seg" id="m_side"><button data-v="1" class="on">主场</button><button data-v="0">客场</button></div></div>' +
      '<div class="fld"><label>场地</label><select class="ipt" id="m_venue"><option value="">未指定</option>' + vOpts + '</select></div>' +
      '<div class="fld"><label>状态</label><div class="seg" id="m_status"><button data-v="upcoming" class="on">未开始</button><button data-v="finished">已结束</button><button data-v="cancelled">已取消</button></div></div>' +
      '<div class="fld"><label>备注</label><input class="ipt" id="m_remark"></div>' +
      '<div class="acts"><button class="btn" id="m_save">添加</button></div>', () => {
        segBind('#m_side'); segBind('#m_status'); segBind('#m_comp');
        $('#m_save').onclick = async () => {
          const opp = $('#m_opp').value.trim();
          if (!opp) return toast('请填写对手');
          await Store.insert('matches', {
            opponent: opp, match_date: toISO($('#m_date').value), season: $('#m_season').value.trim(),
            round: $('#m_round').value.trim(), competition: $('#m_comp button.on').dataset.v,
            is_home: $('#m_side button.on').dataset.v === '1',
            venue_id: $('#m_venue').value || null, our_score: null, opp_score: null,
            status: $('#m_status button.on').dataset.v, remark: $('#m_remark').value.trim()
          });
          closeSheet(); refresh('比赛已添加');
        };
      });
  }

  function openEvent(mid) {
    if (!ST.players.length) return toast('请先在「球员」中添加球员');
    const pOpts = ST.players.map(p => '<option value="' + esc(p.id) + '">#' + esc(p.number || '-') + ' ' + esc(p.name) + '</option>').join('');
    const tBtns = EV_INPUT.map((k, i) =>
      '<button data-v="' + k + '"' + (i === 0 ? ' class="on"' : '') + '>' + EV_TYPES[k].name + '</button>').join('');
    openSheet('录入本场数据',
      '<div class="fld"><label>球员</label><select class="ipt" id="e_p">' + pOpts + '</select></div>' +
      '<div class="fld"><label>类型（解围 / 扑救等在此单独录入）</label><div class="seg wrap" id="e_t">' + tBtns + '</div></div>' +
      '<div class="fld" id="e_penwrap"><label>是否点球</label><div class="seg" id="e_pen"><button data-v="0" class="on">否</button><button data-v="1">是（点球）</button></div></div>' +
      '<div class="row2"><div class="fld"><label>次数</label><input class="ipt" type="number" id="e_c" value="1" min="1"></div>' +
      '<div class="fld"><label>分钟（可留空）</label><input class="ipt" type="number" id="e_m" placeholder="如 68"></div></div>' +
      '<div class="acts"><button class="btn" id="e_save">添加</button></div>', () => {
        segBind('#e_t'); segBind('#e_pen');
        const syncPen = () => {
          const t = $('#e_t button.on').dataset.v;
          $('#e_penwrap').style.display = t === 'goal' ? '' : 'none';
        };
        $$('#e_t button').forEach(b => b.onclick = () => {
          $$('#e_t button').forEach(x => x.classList.remove('on')); b.classList.add('on'); syncPen();
        });
        syncPen();
        $('#e_save').onclick = async () => {
          try {
            const t = $('#e_t button.on').dataset.v;
            await Store.insert('events', {
              match_id: mid, player_id: $('#e_p').value, type: t,
              count: Number($('#e_c').value) || 1, minute: $('#e_m').value ? Number($('#e_m').value) : null,
              is_penalty: t === 'goal' && $('#e_pen button.on').dataset.v === '1'
            });
            await refresh();
            closeSheet(); openMatch(mid); toast('已录入');
          } catch (e) { toast('录入失败：' + e.message); }
        };
      });
  }

  /* ---------------- 球员 ---------------- */
  function playerForm(p, isNew) {
    return '<div class="fld"><label>姓名</label><input class="ipt" id="p_name" value="' + esc(p.name || '') + '"></div>' +
      '<div class="row2"><div class="fld"><label>号码</label><input class="ipt" type="number" id="p_num" value="' + esc(p.number == null ? '' : p.number) + '"></div>' +
      '<div class="fld"><label>位置</label><input class="ipt" id="p_pos" value="' + esc(p.position || '') + '" placeholder="前锋/中场/后卫/门将"></div></div>' +
      '<div class="fld"><label>联系电话（可留空）</label><input class="ipt" id="p_phone" value="' + esc(p.phone || '') + '"></div>' +
      '<div class="fld"><label>入队日期</label><input class="ipt" type="date" id="p_join" value="' + esc(p.joined_at || '') + '"></div>' +
      '<div class="fld"><label>头像（脸部特写，用于合成头部）</label><div class="row2"><div><input class="ipt" id="p_avatar" placeholder="图片网址" value="' + esc((p.avatar_url || '').slice(0, 30) === 'data:image' ? '' : (p.avatar_url || '')) + '"></div>' +
      '<div><input type="file" accept="image/*" id="p_file" class="ipt" style="padding:7px 8px;font-size:12px"></div></div></div>' +
      '<div class="fld"><label>全身照（选填，填了就用真实照片，不再合成）</label><div class="row2"><div><input class="ipt" id="p_full" placeholder="图片网址" value="' + esc((p.fullbody_url || '').slice(0, 30) === 'data:image' ? '' : (p.fullbody_url || '')) + '"></div>' +
      '<div><input type="file" accept="image/*" id="p_fullfile" class="ipt" style="padding:7px 8px;font-size:12px"></div></div>' +
      '<div class="note" style="margin-top:6px">拍一张正面全身站立照，效果最真实。不填则用「头像 + 球衣」自动合成卡通形象。</div></div>' +
      '<div class="fld"><label>状态</label><div class="seg" id="p_act"><button data-v="1" class="' + (p.active === false ? '' : 'on') + '">在队</button><button data-v="0" class="' + (p.active === false ? 'on' : '') + '">离队</button></div></div>' +
      (isNew ? '<div class="acts"><button class="btn" id="p_save">添加球员</button></div>'
        : '<div class="acts"><button class="btn" id="p_save">保存</button><button class="btn red" id="p_del">删除</button></div>');
  }
  /* 读图 → 压缩 → 转 dataURL（避免超长字符串撑爆数据库） */
  function pickImage(fileInput, targetId, maxSide, quality, tip) {
    const f = $(fileInput); if (!f) return;
    f.onchange = () => {
      const file = f.files[0]; if (!file) return;
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement('canvas');
        const s = Math.min(img.width, img.height);
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        $(targetId).value = c.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        toast(tip || '图片已读取，点保存生效');
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast('图片读取失败'); };
      img.src = url;
    };
  }
  function bindAvatarPicker() {
    /* 头像：裁成正方形 256 */
    const f = $('#p_file'); if (!f) return;
    f.onchange = () => {
      const file = f.files[0]; if (!file) return;
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
        const ctx = c.getContext('2d');
        const s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        $('#p_avatar').value = c.toDataURL('image/jpeg', 0.78);
        URL.revokeObjectURL(url); toast('头像已读取，点保存生效');
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast('图片读取失败'); };
      img.src = url;
    };
    /* 全身照：保留竖版比例，长边压到 600 */
    pickImage('#p_fullfile', '#p_full', 600, 0.8, '全身照已读取，点保存生效');
  }
  function openPlayerNew() {
    if (!requireAdmin()) return;
    openSheet('添加球员', playerForm({ active: true }, true), () => {
      segBind('#p_act'); bindAvatarPicker();
      $('#p_save').onclick = async () => {
        const n = $('#p_name').value.trim(); if (!n) return toast('请填写姓名');
        await Store.insert('players', {
          name: n, number: $('#p_num').value === '' ? null : Number($('#p_num').value),
          position: $('#p_pos').value.trim(), phone: $('#p_phone').value.trim(),
          avatar_url: $('#p_avatar').value.trim(), joined_at: $('#p_join').value,
          fullbody_url: $('#p_full') ? $('#p_full').value.trim() : '',
          active: $('#p_act button.on').dataset.v === '1'
        });
        closeSheet(); refresh('球员已添加');
      };
    });
  }
  /* ---------------- 球员信息卡（星光动效 + 全身照） ---------------- */
  const PD = { kit: 'home' };

  /* 生成环绕星光：12 个光点，各自旋转半径 / 延迟不同 */
  function starsHtml() {
    const n = 12, out = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * 360;
      const r = 96 + (i % 3) * 13;
      const size = i % 3 === 0 ? 6 : i % 3 === 1 ? 4 : 3;
      const delay = (i * 0.28).toFixed(2);
      out.push('<i class="pd-star" style="--a:' + ang + 'deg;--r:' + r + 'px;--s:' + size + 'px;--d:' + delay + 's"></i>');
    }
    return out.join('');
  }

  /* 球员近 N 场表现：出场即计入，显示该场进球/助攻 + 球队胜负 */
  function playerRecent(p, n) {
    const mine = ST.events.filter(e => e.player_id === p.id);
    const ids = [];
    mine.forEach(e => { if (e.match_id && ids.indexOf(e.match_id) < 0) ids.push(e.match_id); });
    const ms = ids.map(id => ST.matches.find(m => m.id === id)).filter(Boolean)
      .filter(m => m.status === 'finished')
      .sort((a, b) => new Date(b.match_date || 0) - new Date(a.match_date || 0))
      .slice(0, n || 5);
    return ms.map(m => {
      const evs = mine.filter(e => e.match_id === m.id);
      const g = evs.filter(e => e.type === 'goal').reduce((s, e) => s + (Number(e.count) || 0), 0);
      const a = evs.filter(e => e.type === 'assist').reduce((s, e) => s + (Number(e.count) || 0), 0);
      const y = evs.filter(e => e.type === 'yellow').reduce((s, e) => s + (Number(e.count) || 0), 0);
      const r = evs.filter(e => e.type === 'red').reduce((s, e) => s + (Number(e.count) || 0), 0);
      const our = Number(m.our_score) || 0, opp = Number(m.opp_score) || 0;
      const cls = our > opp ? 'w' : our < opp ? 'l' : 'd';
      const d = new Date(m.match_date || 0);
      const date = isNaN(d) ? '待定' : (d.getMonth() + 1) + '/' + d.getDate();
      return { date: date, opp: m.opponent || '待定', g: g, a: a, y: y, r: r, cls: cls };
    });
  }

  function openPlayerDetail(p) {
    const g = board('goal').find(x => x.p.id === p.id);
    const a = board('assist').find(x => x.p.id === p.id);
    const ap = board('app').find(x => x.p.id === p.id);
    const sh = board('shoot').find(x => x.p.id === p.id);
    const rec = playerRecent(p, 5);

    /* 球衣款式选择 */
    const kits = (global.Jersey ? global.Jersey.KITS : []);
    const kitBtns = kits.map(k =>
      '<button class="kit' + (PD.kit === k.id ? ' on' : '') + '" data-k="' + k.id + '" title="' + esc(k.name) + '">' +
      '<span class="kit-sw" style="background:' + k.main + ';border-color:' + k.accent + '"></span>' +
      esc(k.name) + '</button>').join('');

    const recentHtml = rec.length ? rec.map(r =>
      '<div class="pd-r ' + r.cls + '">' +
      '<span class="pd-rd">' + esc(r.date) + '</span>' +
      '<span class="pd-ro">' + esc(r.opp) + '</span>' +
      '<span class="pd-rv">' +
      (r.g ? '<b class="g">' + r.g + '球</b>' : '') +
      (r.a ? '<b class="a">' + r.a + '助</b>' : '') +
      (r.y ? '<b class="y">' + r.y + '黄</b>' : '') +
      (r.r ? '<b class="r">' + r.r + '红</b>' : '') +
      (!r.g && !r.a && !r.y && !r.r ? '<em>出场</em>' : '') +
      '</span></div>').join('')
      : '<div class="empty" style="padding:12px 0">暂无出场记录</div>';

    const sheet = $('#sheet');
    if (sheet) sheet.classList.add('pd-mode');

    openSheet(p.name || '球员',
      '<div class="pd">' +
      /* ---- 舞台：全身照 + 星光 ---- */
      '<div class="pd-stage">' +
      '<div class="pd-glow"></div>' +
      '<div class="pd-halo"></div>' +
      '<div class="pd-stars">' + starsHtml() + '</div>' +
      '<div class="pd-body" id="pdBody"></div>' +
      '</div>' +
      /* ---- 姓名 / 号码 / 位置 ---- */
      '<div class="pd-name">' + esc(p.name || '') + (p.active === false ? ' <span class="badge off">离队</span>' : '') + '</div>' +
      '<div class="pd-badges">' +
      '<span class="pd-num">#' + esc(p.number == null ? '-' : p.number) + '</span>' +
      '<span class="pd-pos">' + esc(p.position || '位置待定') + '</span>' +
      (p.joined_at ? '<span class="pd-join">入队 ' + esc(p.joined_at) + '</span>' : '') +
      '</div>' +
      /* ---- 本赛季数据 ---- */
      '<div class="pd-stats">' +
      '<div class="pd-st"><b>' + (ap ? ap.v : 0) + '</b><span>出场</span></div>' +
      '<div class="pd-st"><b>' + (g ? g.v : 0) + '</b><span>进球</span></div>' +
      '<div class="pd-st"><b>' + (a ? a.v : 0) + '</b><span>助攻</span></div>' +
      '<div class="pd-st"><b>' + (sh ? sh.v : 0) + '</b><span>射门</span></div>' +
      '</div>' +
      /* ---- 球衣切换 ---- */
      (global.Jersey ? '<div class="pd-kits">' + kitBtns + '</div>' : '') +
      /* ---- 近 5 场 ---- */
      '<div class="pd-sec"><span>近 5 场表现</span><i>共 ' + rec.length + ' 场</i></div>' +
      '<div class="pd-recent">' + recentHtml + '</div>' +
      /* ---- 管理员操作 ---- */
      (canEdit() ? '<div class="acts" style="margin-top:14px">' +
        '<button class="btn ghost" id="pd_edit">✏️ 编辑资料</button>' +
        '<button class="btn red" id="pd_del">删除</button></div>' : '') +
      '</div>', () => {

        /* 画全身照：优先用真实照片，没有才合成 */
        const paint = () => {
          const box = $('#pdBody'); if (!box) return;
          box.innerHTML = '';
          /* ① 真实全身照 */
          if (p.fullbody_url) {
            const img = document.createElement('img');
            img.className = 'pd-cv pd-photo';
            img.src = p.fullbody_url;
            img.alt = p.name || '';
            img.onerror = () => { img.remove(); drawSynthetic(); };
            box.appendChild(img);
            return;
          }
          drawSynthetic();
        };
        const drawSynthetic = () => {
          const box = $('#pdBody'); if (!box) return;
          box.innerHTML = '';
          let cv = null;
          try { cv = global.Jersey.draw({ name: p.name, number: p.number, position: p.position, avatar: p.avatar_url, kit: PD.kit }, 2); }
          catch (e) { console.error(e); }
          if (cv) { cv.className = 'pd-cv'; box.appendChild(cv); }
          else box.innerHTML = '<div class="pd-fallback">' + esc((p.name || '?').slice(0, 1)) + '</div>';
        };
        if (global.Jersey && p.avatar_url) {
          global.Jersey.load(p.avatar_url).then(paint).catch(paint);
        }
        paint();

        /* 切换球衣（只对合成形象生效） */
        const kitBox = $$('#sheetBody .kit');
        if (p.fullbody_url) {
          kitBox.forEach(b => { b.style.display = 'none'; });
        } else {
          kitBox.forEach(b => b.onclick = () => {
            PD.kit = b.dataset.k;
            $$('#sheetBody .kit').forEach(x => x.classList.toggle('on', x === b));
            paint();
          });
        }

        if ($('#pd_edit')) $('#pd_edit').onclick = () => { closeSheet(); openPlayerEdit(p.id); };
        if ($('#pd_del')) $('#pd_del').onclick = async () => {
          if (!confirm('确定删除该球员？其进球/助攻记录也会移除')) return;
          await Store.removeWhere('events', 'player_id', p.id);
          await Store.remove('players', p.id);
          closeSheet(); refresh('已删除');
        };
      });
  }

  /* 管理员编辑（从信息卡进入） */
  function openPlayerEdit(id) {
    const p = playerById(id); if (!p) return;
    if (!requireAdmin()) return;
    openSheet('编辑球员', playerForm(p, false), () => {
      segBind('#p_act'); bindAvatarPicker();
      $('#p_save').onclick = async () => {
        await Store.update('players', id, {
          name: $('#p_name').value.trim(), number: $('#p_num').value === '' ? null : Number($('#p_num').value),
          position: $('#p_pos').value.trim(), phone: $('#p_phone').value.trim(),
          avatar_url: $('#p_avatar').value.trim(), joined_at: $('#p_join').value,
          fullbody_url: $('#p_full') ? $('#p_full').value.trim() : (p.fullbody_url || ''),
          active: $('#p_act button.on').dataset.v === '1'
        });
        closeSheet(); refresh('已保存');
      };
      $('#p_del').onclick = async () => {
        if (!confirm('确定删除该球员？其进球/助攻记录也会移除')) return;
        await Store.removeWhere('events', 'player_id', id);
        await Store.remove('players', id);
        closeSheet(); refresh('已删除');
      };
    });
  }

  function openPlayer(id) {
    const p = playerById(id); if (!p) return;
    if (canEdit()) {
      /* 管理员：先看信息卡，卡里有「编辑」按钮 */
      return openPlayerDetail(p);
    }
    /* 只读：直接看信息卡 */
    openPlayerDetail(p);
  }

  /* ---------------- 场地 ---------------- */
  function venueForm(v, isNew) {
    return '<div class="fld"><label>场地名称</label><input class="ipt" id="v_name" value="' + esc(v.name || '') + '"></div>' +
      '<div class="fld"><label>地址</label><input class="ipt" id="v_addr" value="' + esc(v.address || '') + '"></div>' +
      '<div class="row2"><div class="fld"><label>草坪类型</label><select class="ipt" id="v_surf">' +
      ['人造草', '天然草', '室内场', '土场'].map(s => '<option' + (v.surface === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<div class="fld"><label>价格（元/场）</label><input class="ipt" type="number" id="v_price" value="' + esc(v.price == null ? '' : v.price) + '"></div></div>' +
      '<div class="fld"><label>联系人 / 电话</label><input class="ipt" id="v_contact" value="' + esc(v.contact || '') + '"></div>' +
      '<div class="fld"><label>导航链接（可留空）</label><input class="ipt" id="v_map" placeholder="高德/百度地图分享链接" value="' + esc(v.map_url || '') + '"></div>' +
      '<div class="fld"><label>备注</label><textarea class="ipt" id="v_remark" rows="3">' + esc(v.remark || '') + '</textarea></div>' +
      (isNew ? '<div class="acts"><button class="btn" id="v_save">添加场地</button></div>'
        : '<div class="acts"><button class="btn" id="v_save">保存</button><button class="btn red" id="v_del">删除</button></div>');
  }
  function openVenueNew() {
    if (!requireAdmin()) return;
    openSheet('添加场地', venueForm({}, true), () => {
      $('#v_save').onclick = async () => {
        const n = $('#v_name').value.trim(); if (!n) return toast('请填写场地名称');
        await Store.insert('venues', {
          name: n, address: $('#v_addr').value.trim(), surface: $('#v_surf').value,
          price: $('#v_price').value === '' ? null : Number($('#v_price').value),
          contact: $('#v_contact').value.trim(), map_url: $('#v_map').value.trim(), remark: $('#v_remark').value.trim()
        });
        closeSheet(); refresh('场地已添加');
      };
    });
  }
  function openVenue(id) {
    const v = venueById(id); if (!v) return;
    if (!canEdit()) {
      return openSheet('场地详情',
        '<div class="note">名称：' + esc(v.name) + '<br>地址：' + esc(v.address || '-') + '<br>类型：' + esc(v.surface || '-') +
        '<br>价格：' + (v.price != null ? '¥' + esc(v.price) + '/场' : '-') + '<br>联系：' + esc(v.contact || '-') +
        (v.remark ? '<br>备注：' + esc(v.remark) : '') + '</div>' +
        (v.map_url ? '<a class="btn wide" style="text-align:center;line-height:38px;text-decoration:none" href="' + esc(v.map_url) + '" target="_blank" rel="noopener">打开导航</a>' : ''));
    }
    openSheet('编辑场地', venueForm(v, false), () => {
      $('#v_save').onclick = async () => {
        await Store.update('venues', id, {
          name: $('#v_name').value.trim(), address: $('#v_addr').value.trim(), surface: $('#v_surf').value,
          price: $('#v_price').value === '' ? null : Number($('#v_price').value),
          contact: $('#v_contact').value.trim(), map_url: $('#v_map').value.trim(), remark: $('#v_remark').value.trim()
        });
        closeSheet(); refresh('已保存');
      };
      $('#v_del').onclick = async () => {
        if (!confirm('确定删除该场地？')) return;
        await Store.remove('venues', id);
        closeSheet(); refresh('已删除');
      };
    });
  }

  /* ---------------- 管理 / 登录面板 ---------------- */
  function openAdmin() {
    if (ST.role === 'admin') { return openAdminPanel(); }
    if (ST.role === 'recorder') { return openRecorderPanel(); }
    /* 未登录：登录表单，自动识别身份 */
    openSheet('登录',
      '<div class="note">两种账号：<br>' +
      '· <b>管理员</b>：管球队资料、球员、场地、赛程，也能录比赛<br>' +
      '· <b>录入员</b>：只有一个「录入」界面，专门录比赛数据<br>' +
      '不登录时为只读浏览模式。</div>' +
      '<div class="fld"><label>账号</label><input class="ipt" id="l_user" placeholder="账号" autocomplete="username"></div>' +
      '<div class="fld"><label>密码</label><input class="ipt" type="password" id="l_pass" placeholder="密码" autocomplete="current-password"></div>' +
      '<div class="acts"><button class="btn" id="l_go">登录</button></div>', () => {
        $('#l_go').onclick = () => {
          const u = $('#l_user').value.trim(), p = $('#l_pass').value;
          const A = APP_CONFIG.admin, R = APP_CONFIG.recorder;
          if (u === A.user && p === A.pass) {
            setLogin('admin', u); closeSheet(); renderNav(); renderAll();
            toast('管理员登录成功'); openAdminPanel();
          } else if (u === R.user && p === R.pass) {
            setLogin('recorder', u); closeSheet(); renderNav(); renderAll();
            go('record'); toast('录入员登录成功，可直接录入');
          } else { toast('账号或密码不正确'); return; }
          /* 角色变了，若当前停在无权访问的页面，退回首页 */
          if (allowedViews().indexOf(ST.view) < 0) go('home');
        };
        $('#l_pass').onkeydown = e => { if (e.key === 'Enter') $('#l_go').click(); };
      });
  }

  /* 管理员后台 */
  function openAdminPanel() {
    const mode = Store.isCloud()
      ? '<span class="badge">云端已连接</span>'
      : '<span class="badge warn">本机模式</span>';
    const srcTxt = { url: '来自分享链接', saved: '来自本机配置', config: '来自 config.js', none: '未配置' }[Store.source] || '';
    openSheet('管理后台',
      '<div class="admin-item"><div class="ai-l"><b>管理员</b><small>' + esc(APP_CONFIG.admin.user) + ' · 已登录</small></div><button class="btn sm ghost" id="a_logout">退出</button></div>' +
      '<div class="admin-item"><div class="ai-l"><b>数据存储</b><small>' + (Store.isCloud() ? 'Supabase 云数据库，多设备自动同步' : '仅保存在本机浏览器，换设备不同步') + (Store.isCloud() ? ' · ' + srcTxt : '') + '</small></div>' + mode + '</div>' +
      '<div style="margin-top:12px"><button class="btn wide" id="a_profile">✏️ 编辑球队介绍</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide ' + (Store.isCloud() ? 'ghost' : 'gold') + '" id="a_connect">' + (Store.isCloud() ? '☁️ 云端设置 / 生成分享链接' : '☁️ 连接云端数据库') + '</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide ghost" id="a_export">📤 导出备份（JSON）</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide ghost" id="a_import">📥 导入备份</button></div>' +
      '<div class="admin-item"><div class="ai-l"><b>版本</b><small>代码 ' + APP_VER + ' · 离线缓存 ' + (SW_VER || '未知') +
      '<br>不一致时强制刷新页面（Ctrl+Shift+R）</small></div>' +
      '<button class="btn sm ghost" id="a_reload">刷新</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide ghost" id="a_fix">🔧 检查云端表结构</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide ghost" id="a_install">📱 安装到手机桌面</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide ghost" id="a_cloud">☁️ 云端配置指引</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide red" id="a_clear">🗑 清空全部数据</button></div>' +
      '<div class="note" style="margin-top:14px">提示：截图请在首页点击右上角 📷；录入员账号 <b>' + esc(APP_CONFIG.recorder.user) + '</b> 登录后只能进「录入」页。</div>', () => {
        $('#a_logout').onclick = () => { logout(); closeSheet(); renderNav(); go('home'); renderAll(); toast('已退出'); };
        $('#a_profile').onclick = () => { closeSheet(); openProfile(); };
        $('#a_connect').onclick = () => { closeSheet(); openCloudSetup(); };
        $('#a_export').onclick = async () => {
          const data = await Store.exportAll();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = '狮山实达数据备份-' + new Date().toISOString().slice(0, 10) + '.json';
          a.click(); toast('已导出');
        };
        $('#a_import').onclick = () => {
          const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
          inp.onchange = async () => {
            const f = inp.files[0]; if (!f) return;
            try {
              const txt = await f.text();
              await Store.importAll(JSON.parse(txt));
              closeSheet(); refresh('导入成功');
            } catch (e) { toast('导入失败：' + e.message); }
          };
          inp.click();
        };
        $('#a_install').onclick = () => { closeSheet(); openInstall(); };
        $('#a_reload').onclick = () => {
          if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
            navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
          }
          setTimeout(() => global.location.reload(true), 300);
        };
        $('#a_fix').onclick = async () => {
          if (!Store.isCloud()) { closeSheet(); return openCloudGuide(); }
          const b = $('#a_fix'); const old = b.textContent; b.textContent = '检查中…'; b.disabled = true;
          try {
            const miss = await Store.checkSchema();
            b.textContent = old; b.disabled = false;
            if (!miss.length) { closeSheet(); return openSheet('表结构检查', '<div class="note"><b style="color:#0E9F6E">✅ 表结构正常</b><br>所有字段齐全，可以正常保存数据。</div>'); }
            const TYPES = {
              competition: 'text', created_by: 'text', season: 'text', round: 'text', remark: 'text',
              address: 'text', surface: 'text', contact: 'text', map_url: 'text',
              name: 'text', slogan: 'text', founded: 'text', home_venue: 'text', logo_url: 'text', intro: 'text',
              position: 'text', phone: 'text', avatar_url: 'text', joined_at: 'date',
              match_id: 'uuid', player_id: 'uuid', venue_id: 'uuid', type: 'text',
              count: 'int', minute: 'int', number: 'int', our_score: 'int', opp_score: 'int', price: 'numeric',
              status: 'text', is_home: 'boolean', active: 'boolean', is_penalty: 'boolean'
            };
            const uniq = {};
            miss.forEach(([t, c]) => { (uniq[t] = uniq[t] || []).push(c); });
            const sql = Object.keys(uniq).map(t =>
              uniq[t].map(c => 'alter table public.' + t + ' add column if not exists ' + c + ' ' + (TYPES[c] || 'text') + ';').join('\n')
            ).join('\n') + '\n\n-- ⚠️ 跑完上面这段后，务必再执行下面这句刷新 PostgREST 缓存，否则仍会报同样的错：\nnotify pgrst, \'reload schema\';';
            closeSheet();
            openSheet('云端表缺少字段',
              '<div class="note" style="background:#FFF6E0;border-color:#F5E3B0;color:#8A6212">' +
              '<b>缺少 ' + miss.length + ' 个字段</b>，这就是保存失败的原因。</div>' +
              '<div class="note"><b>修复方法（2 步）</b><br>' +
              '1. Supabase 控制台 → <b>SQL Editor</b> → New query，粘贴下面这段 → <b>Run</b><br>' +
              '2. 再到 <b>Settings → API</b>，点一下 <b>Reload schema cache</b>（刷新缓存，否则仍会报错）</div>' +
              '<div class="code" id="fixsql">' + esc(sql) + '</div>' +
              '<div class="acts"><button class="btn" id="fx_copy">复制 SQL</button><button class="btn ghost" id="fx_recheck">重新检查</button></div>', () => {
                $('#fx_copy').onclick = async () => {
                  const t = $('#fixsql');
                  let ok = false;
                  try { t.select(); ok = document.execCommand('copy'); } catch (e) { }
                  if (!ok && navigator.clipboard) { try { await navigator.clipboard.writeText(sql); ok = true; } catch (e) { } }
                  toast(ok ? '已复制，去 SQL Editor 粘贴运行' : '请手动选中复制');
                };
                $('#fx_recheck').onclick = () => { closeSheet(); openAdmin(); $('#a_fix').click(); };
              });
          } catch (e) {
            b.textContent = old; b.disabled = false; toast('检查失败：' + (e.message || e));
          }
        };
        $('#a_cloud').onclick = () => { closeSheet(); openCloudGuide(); };
        $('#a_clear').onclick = async () => {
          if (!confirm('将清空球员、场地、赛程与全部比赛数据，且不可恢复！建议先导出备份。确定继续？')) return;
          if (!confirm('再次确认：真的要清空吗？')) return;
          await Store.clearAll(); closeSheet(); refresh('数据已清空');
        };
      });
  }

  /* 录入员面板 */
  function openRecorderPanel() {
    const mine = ST.matches.filter(m => m.created_by === ST.user).length;
    openSheet('录入员',
      '<div class="admin-item"><div class="ai-l"><b>录入员</b><small>' + esc(ST.user || APP_CONFIG.recorder.user) + ' · 已登录</small></div><button class="btn sm ghost" id="r_logout">退出</button></div>' +
      '<div class="admin-item"><div class="ai-l"><b>已录入</b><small>由你录入的比赛</small></div><span class="badge">' + mine + ' 场</span></div>' +
      '<div style="margin-top:12px"><button class="btn wide gold" id="r_rec">📝 录入一场比赛</button></div>' +
      '<div style="margin-top:9px"><button class="btn wide ghost" id="r_install">📱 安装到手机桌面</button></div>' +
      '<div class="note" style="margin-top:14px">录入只需填：日期、场地、对手、比分，以及谁进了球、谁助攻了。球员名单由管理员维护，如需新增请联系管理员。</div>', () => {
        $('#r_logout').onclick = () => { logout(); closeSheet(); renderNav(); go('home'); renderAll(); toast('已退出'); };
        $('#r_rec').onclick = () => { closeSheet(); go('record'); };
        $('#r_install').onclick = () => { closeSheet(); openInstall(); };
      });
  }

  /* 是否在微信内置浏览器里打开 */
  function inWeChat() { return /MicroMessenger/i.test(navigator.userAgent || ''); }

  /* 复制网址到剪贴板（带降级方案） */
  function copyLink(text, okMsg) {
    const done = () => toast(okMsg || '网址已复制，去微信粘贴发给队友');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback); return;
      }
    } catch (e) { }
    fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('复制失败，请长按地址栏手动复制'); }
      document.body.removeChild(ta);
    }
  }

  function openInstall() {
    const wx = inWeChat();
    openSheet('安装到手机桌面',
      (wx ? '<div class="note" style="background:rgba(242,183,5,.14);border-color:rgba(242,183,5,.4)">' +
        '<b>⚠️ 你正在微信里打开</b><br>微信不支持「添加到桌面」。<br>' +
        '请点微信右上角 <b>···</b> → <b>在浏览器打开</b>，再按下面步骤操作。</div>' : '') +
      '<div class="note"><b>iPhone（Safari）</b><br>1. 用 Safari 打开本页<br>2. 点击底部「分享」按钮 <b>⬆️</b><br>3. 选择「添加到主屏幕」<br>4. 确认后桌面出现图标，点开即全屏运行，和 App 一样</div>' +
      '<div class="note"><b>安卓（Chrome / 夸克 /  Edge）</b><br>1. 打开本页后点击右上角菜单 <b>⋮</b><br>2. 选择「添加到主屏幕 / 安装应用」<br>3. 确认即可</div>' +
      '<div class="note"><b>发微信给队友</b><br>直接把网址发到群里，对方点开就能看（会显示成一张卡片）。所有人看到的是同一份云端数据，只有输入管理密码的人才能修改。</div>' +
      '<div style="margin-top:8px"><button class="btn wide" id="i_try">' + (deferredPrompt ? '一键安装' : '已支持添加到桌面') + '</button></div>' +
      '<div style="margin-top:8px"><button class="btn wide ghost" id="i_copy">📋 复制网址</button></div>', () => {
        $('#i_try').onclick = async () => {
          if (!deferredPrompt) return toast('请按上方步骤在浏览器菜单中添加');
          deferredPrompt.prompt(); const r = await deferredPrompt.userChoice; deferredPrompt = null;
          if (r && r.outcome === 'accepted') toast('已添加到桌面');
        };
        $('#i_copy').onclick = () => copyLink(global.location.href.split('#')[0]);
      });
  }

  /* 微信内首次打开：顶部提示条，引导去浏览器打开后可装桌面 */
  function wechatTip() {
    if (!inWeChat()) return;
    if (sessionStorage.getItem('wxTipOff')) return;
    const bar = document.createElement('div');
    bar.className = 'wx-tip';
    bar.innerHTML = '<span>微信内无法「添加到桌面」</span>' +
      '<b id="wx_how">怎么装？</b>' +
      '<i id="wx_x">✕</i>';
    document.body.appendChild(bar);
    document.body.classList.add('has-wxtip');
    $('#wx_x').onclick = () => {
      sessionStorage.setItem('wxTipOff', '1');
      document.body.classList.remove('has-wxtip');
      bar.remove();
    };
    $('#wx_how').onclick = () => openInstall();
    setTimeout(() => { if (bar.parentNode) { bar.classList.add('fade'); } }, 6000);
  }

  function openCloudGuide() {
    openSheet('云端配置指引',
      '<div class="note">当前：<b>' + (Store.isCloud() ? '已连接 Supabase 云端数据库' : '本机模式（数据只存在这台设备）') + '</b></div>' +
      '<div class="note"><b>准备云端数据库（只需做一次）</b><br>' +
      '1. 打开 supabase.com 注册免费账号，新建一个 Project<br>' +
      '2. 左侧 <b>SQL Editor</b> → New query，粘贴运行建表脚本 <b>schema.sql</b><br>' +
      '3. 左下角 <b>Settings（齿轮）→ API</b>，复制 Project URL 和 publishable / anon public key<br>' +
      '4. 回到本页，把两串粘进去即可（不用改代码文件）</div>' +
      '<div class="note">免费额度足够一支业余球队长期使用，无需付费，也不需要服务器。</div>' +
      '<div style="margin-top:8px"><button class="btn wide gold" id="g_go">去填写 URL 和 Key</button></div>', () => {
        $('#g_go').onclick = () => { closeSheet(); openCloudSetup(); };
      });
  }

  /* 在界面里直接连接云端，无需修改代码文件 */
  function openCloudSetup() {
    const c = Store.cfg || { url: '', anonKey: '' };
    const on = Store.isCloud();
    const link = Store.shareLink();
    const localN = Store.localCounts().total;
    openSheet('连接云端数据库',
      '<div class="note">' + (on
        ? '<b style="color:#0E9F6E">已连接云端</b>，所有设备共用同一份数据。'
        : '当前为<b>本机模式</b>，数据只存在这台设备。连云端后全队实时共享。') + '</div>' +
      '<div class="fld"><label>Project URL</label><input class="ipt" id="c_url" placeholder="https://abcdefgh.supabase.co" value="' + esc(c.url || '') + '"></div>' +
      '<div class="fld"><label>Publishable / anon public key</label><input class="ipt" id="c_key" placeholder="sb_publishable_... 或 eyJhbGciOi..." value="' + esc(c.anonKey || '') + '"></div>' +
      '<div class="acts"><button class="btn" id="c_save">连接并保存</button>' + (on ? '<button class="btn red" id="c_off">断开</button>' : '') + '</div>' +
      (on && localN ? '<div style="margin-top:14px"><button class="btn wide gold" id="c_mig">⬆️ 把本机 ' + localN + ' 条数据上传到云端</button></div>' +
        '<div class="note" style="margin-top:6px">连云端后 App 只显示云端数据。如果你之前在本机录过数据，点这里一次搬上去（云端已有数据的表会自动跳过）。</div>' : '') +
      (on && link && Store.shareIsLocal() ? '<div class="note" style="margin-top:14px;background:#FFF6E0;border-color:#F5E3B0;color:#8A6212">' +
        '<b>⚠️ 现在是「本机打开」，还不能发给队友</b><br>' +
        '当前页面地址是 ' + (String(location.protocol).toLowerCase() === 'file:' ? '你电脑上的本地文件（file://）' : '本机 localhost') +
        '，队友点开只会打开他们自己电脑上的文件，或者根本打不开。<br><br>' +
        '<b>要分享，先把文件夹传到一个网址上</b>（约 30 秒）：<br>' +
        '1. 打开 <b>app.netlify.com/drop</b>（或 vercel.com）<br>' +
        '2. 把 <b>sclh-app 整个文件夹</b>拖进网页虚线框里<br>' +
        '3. 几十秒后得到一个 https://xxx.netlify.app 网址<br>' +
        '4. 用那个网址打开本 App，再来这里生成分享链接，就能发给队友了</div>' : '') +
      (on && link && !Store.shareIsLocal() ? '<div class="fld" style="margin-top:14px"><label>队友专用链接（点开自动连好同一个库）</label>' +
        '<textarea class="ipt" id="c_link" rows="3" readonly>' + esc(link) + '</textarea></div>' +
        '<div class="acts"><button class="btn ghost" id="c_copy">复制链接发给队友</button></div>' +
        '<div class="note" style="margin-top:6px">这条链接里含数据库地址与 key，<b>只发球队群，别发到公开场合</b>。</div>' : '') +
      '<div class="note" style="margin-top:14px"><b>去哪里找这两串？</b><br>' +
      'Supabase 控制台 → 打开你的项目 → 左下角 <b>Settings（齿轮）</b> → <b>API</b>（或 API Keys）<br>' +
      '· <b>Project URL</b>：形如 https://abcdefgh.supabase.co<br>' +
      '· <b>API Keys</b>：复制 label 为 <b>publishable</b>（新版）或 <b>anon public</b>（旧版）的那一个<br>' +
      '<b style="color:#E02424">不要复制 service_role / sb_secret_ 开头的那个。</b><br><br>' +
      '<b>第一次连接前</b>，需先在 Supabase 左侧 <b>SQL Editor</b> 里运行一次建表脚本 schema.sql，否则会提示连接失败。</div>', () => {
        $('#c_save').onclick = async () => {
          const b = $('#c_save'); const old = b.textContent; b.textContent = '连接中…'; b.disabled = true;
          try {
            await Store.connectCloud($('#c_url').value, $('#c_key').value);
            await refresh();
            closeSheet(); toast('云端已连接'); openCloudSetup();
          } catch (e) {
            toast(e.message || '连接失败'); b.textContent = old; b.disabled = false;
          }
        };
        if ($('#c_off')) $('#c_off').onclick = async () => {
          if (!confirm('断开云端？将回到本机模式（云端数据不会丢失）。')) return;
          Store.disconnectCloud(); await refresh(); closeSheet(); toast('已断开云端'); openCloudSetup();
        };
        if ($('#c_mig')) $('#c_mig').onclick = async () => {
          if (!confirm('把本机数据上传到云端？（云端已有的表会跳过）')) return;
          const b = $('#c_mig'); const old = b.textContent; b.textContent = '上传中…'; b.disabled = true;
          try {
            const n = await Store.migrateLocalToCloud();
            await refresh(); closeSheet(); toast('已上传 ' + n + ' 条'); openCloudSetup();
          } catch (e) { toast('上传失败：' + (e.message || e)); b.textContent = old; b.disabled = false; }
        };
        if ($('#c_copy')) $('#c_copy').onclick = async () => {
          const t = $('#c_link'); t.select(); t.setSelectionRange(0, 99999);
          let ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { }
          if (!ok && navigator.clipboard) { try { await navigator.clipboard.writeText(t.value); ok = true; } catch (e) { } }
          toast(ok ? '已复制，发给队友即可' : '请手动长按复制');
        };
      });
  }

  /* ---------------- 一键截图（Canvas 自绘海报） ---------------- */
  let shotBlob = null;

  /* 组装海报数据 */
  function shotData() {
    const p = ST.profile || DEFAULT_PROFILE;
    const r = record();
    const COMP_COLOR = { '联赛': '#1D4ED8', '杯赛': '#7C3AED', '友谊赛': '#0E9F6E', '内部赛': '#C89204' };

    /* 近期赛程：与首页一致 —— 未来 2 场 + 最近已结束补足到 5 场 */
    const SHOT_N = 5, SHOT_UP = 2;
    const up = ST.matches.filter(m => m.status === 'upcoming')
      .sort((a, b) => new Date(a.match_date || 9e15) - new Date(b.match_date || 9e15)).slice(0, SHOT_UP);
    const list = up.concat(finishedMatches().slice(0, Math.max(0, SHOT_N - up.length)));
    const fixtures = list.map(m => {
      const db = dayBlock(m.match_date);
      const fin = m.status === 'finished';
      let score = '未开始', sc = '#8E9AAE', state = '';
      if (fin) {
        const a = Number(m.our_score) || 0, b = Number(m.opp_score) || 0;
        score = a + ' : ' + b;
        sc = a > b ? '#0E9F6E' : a < b ? '#E02424' : '#8E9AAE';
        state = '已结束';
      } else if (m.status === 'cancelled') { score = '取消'; state = '已取消'; }
      else { state = db.t || '待定'; }
      /* 场地 + 该场地战绩（与页面一致：日期 → 对手 → 场地） */
      const vv = venueById(m.venue_id);
      const vr = venueRecord(m.venue_id);
      const venueTxt = vv ? (vv.name + (vr ? '  ' + vr.w + '胜' + vr.d + '平' + vr.l + '负 · ' + vr.rate + '%' : ''))
        : '场地待定';
      /* 与该对手的历史交锋 */
      const orr = oppRecord(m.opponent);
      const oppRecTxt = orr ? (orr.w + '胜' + orr.d + '平' + orr.l + '负 · ' + orr.rate + '%') : '';
      return {
        d: db.d, m: db.m, opp: m.opponent || '待定对手', home: !!m.is_home,
        comp: m.competition || '', compColor: COMP_COLOR[m.competition] || '#1D4ED8',
        score: score, scoreColor: sc, state: state,
        venue: venueTxt, oppRec: oppRecTxt
      };
    });

    /* 榜单：与首页一致 —— 有数据的球员全部列出（不再截断到 5 行） */
    const toRows = arr => arr.map(x => ({
      name: x.p.name, number: x.p.number, position: x.p.position,
      avatar: x.p.avatar_url, v: x.v
    }));
    const goals = toRows(board('goal'));
    const assists = toRows(board('assist'));

    /* 近况小球 */
    const recent = finishedMatches().slice(0, 6).map(m => {
      const a = Number(m.our_score) || 0, b = Number(m.opp_score) || 0;
      return { cls: a > b ? 'w' : a < b ? 'l' : 'd', t: a > b ? '胜' : a < b ? '负' : '平' };
    });

    const d = new Date();
    return {
      profile: p,
      stats: [
        { v: String(r.n), k: '已赛' },
        { v: String(r.pts), k: '积分' },
        { v: String(r.gf), k: '进球' },
        { v: (r.gd > 0 ? '+' : '') + r.gd, k: '净胜球' },
        { v: String(ST.players.filter(x => x.active !== false).length), k: '在队' }
      ],
      recent: recent,
      rate: r.rate,
      fixtures: fixtures,
      fixtureSub: '共 ' + ST.matches.length + ' 场',
      goals: goals,
      assists: assists,
      date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    };
  }

  async function doShot() {
    const btn = $('#btnShot'); btn.textContent = '⏳';
    try {
      if (!global.Poster) throw new Error('海报模块未加载');
      const d = shotData();
      /* 先预加载头像（网络图可能慢），最多等 2.5 秒 */
      const urls = [];
      (d.goals || []).concat(d.assists || []).forEach(r => { if (r.avatar) urls.push(r.avatar); });
      if (d.profile && d.profile.logo_url) urls.push(d.profile.logo_url);
      await Promise.race([
        Promise.all(urls.map(u => new Promise(res => {
          const img = new Image(); img.crossOrigin = 'anonymous';
          const done = ok => { global.Poster.imgCache[u] = ok ? img : null; res(); };
          img.onload = () => done(true); img.onerror = () => done(false);
          img.src = u;
          setTimeout(() => { if (!img.complete) done(false); }, 2200);
        }))),
        new Promise(res => setTimeout(res, 2500))
      ]);

      const canvas = global.Poster.draw(d);
      shotBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      $('#shotImg').src = canvas.toDataURL('image/png');
      $('#shotMask').classList.add('on'); $('#shotView').classList.add('on');
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      $('#shotTip').textContent = ios
        ? 'iPhone：长按上方图片 →「存储到照片」；或点「分享」发给微信好友'
        : '点「保存到相册」直接下载；也可点「分享」发给队友';
    } catch (e) {
      console.error(e); toast('截图失败：' + (e.message || '请改用手机系统截图'));
    } finally { btn.textContent = '📷'; }
  }
  function closeShot() {
    const m = $('#shotMask'), v = $('#shotView');
    if (m) m.classList.remove('on');
    if (v) v.classList.remove('on');
  }
  function saveShotToDisk() {
    if (!shotBlob) return toast('请先生成截图');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(shotBlob);
    a.download = '狮山实达-' + new Date().toISOString().slice(0, 10) + '.png';
    a.click(); toast('已保存到下载目录');
  }
  async function shareShotToApp() {
    if (!shotBlob) return toast('请先生成截图');
    const file = new File([shotBlob], '狮山实达.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '狮山实达数据统计' }); return;
      }
      if (navigator.share) { await navigator.share({ title: '狮山实达数据统计', text: '球队战绩与射手榜' }); return; }
      toast('当前浏览器不支持分享，可长按图片保存');
    } catch (e) { /* 用户取消 */ }
  }

  /* ---------------- 录入界面（录入员专用，极简） ---------------- */
  /* 当前正在录入的内容 */
  /* 录入表单状态：一行 = 一个球员，同行的进球 / 助攻并排填
     p 球员id，g 进球数，a 助攻数（都留空，空按 0 处理，不做预填） */
  const RC = {
    mid: '',                          // 继续录入的比赛 id
    rows: [{ p: '', g: '', a: '' }],  // 每行一个球员，进球 / 助攻并排
    date: '', venue: '', opp: '', our: '', oppS: '',   // 记住已填内容，重渲染不丢
    lineup: []                              // 接龙导入的出场名单（球员 id）
  };

  function playerOpts(sel) {
    return ST.players.filter(p => p.active !== false).map(p =>
      '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>#' + esc(p.number || '-') + ' ' + esc(p.name) + '</option>'
    ).join('');
  }
  /* 一行：球员 + 进球 + 助攻 + 删除
     占位 option 用空白（不显示提示文字），避免出现预选导致误存 */
  function evRowHtml(i, row) {
    return '<div class="evrow" data-i="' + i + '">' +
      '<select class="ipt ev-p">' + '<option value=""' + (row.p ? '' : ' selected') + '></option>' + playerOpts(row.p) + '</select>' +
      '<input class="ipt ev-n" type="number" inputmode="numeric" min="0" placeholder="球" value="' + (row.g === '' ? '' : row.g) + '" aria-label="进球">' +
      '<input class="ipt ev-n" type="number" inputmode="numeric" min="0" placeholder="助" value="' + (row.a === '' ? '' : row.a) + '" aria-label="助攻">' +
      '<button class="ev-del">✕</button></div>';
  }
  function evRowsHtml() {
    return RC.rows.map((r, i) => evRowHtml(i, r)).join('');
  }
  /* 汇总：分别统计进球 / 助攻 */
  function rcSum() {
    let g = 0, a = 0;
    RC.rows.forEach(r => { g += Number(r.g) || 0; a += Number(r.a) || 0; });
    return { g: g, a: a };
  }

  /* 未完成（未开赛）的比赛，供「继续录入」选择 */
  function pendingMatches() {
    return ST.matches.filter(m => m.status === 'upcoming')
      .sort((a, b) => new Date(a.match_date || 9e15) - new Date(b.match_date || 9e15));
  }

  function renderRecord() {
    const el = $('#recordBody');
    if (!el) return;
    if (!canRecord()) {
      el.innerHTML = '<div class="block"><div class="empty"><i>🔒</i>需要登录后才能录入</div>' +
        '<button class="btn wide" id="rc_login" style="margin-top:6px">登录（管理员 / 录入员）</button>' +
        '<div class="note" style="margin-top:12px">未登录时 App 为只读浏览模式，可自由查看赛程、榜单、球员。</div></div>';
      $('#rc_login').onclick = openAdmin;
      return;
    }
    if (!ST.players.length) {
      el.innerHTML = '<div class="block"><div class="empty"><i>👥</i>还没有球员</div>' +
        '<div class="note" style="margin-top:10px">请先让管理员在「球员」页添加球员，之后才能录入进球与助攻。</div></div>';
      return;
    }
    /* 本机模式下录入的数据只有自己看得到 —— 必须醒目提示，避免白录 */
    const OFFLINE_WARN = !Store.isCloud()
      ? '<div class="note rc-warn"><b>⚠️ 当前是本机模式，录入的数据只有你自己能看到</b><br>' +
        '请用管理员发的「队友专用链接」打开本页（打开后顶部显示「云端已连接」），' +
        '否则这场比赛不会同步给全队。<br><br>' +
        '<b>怎么确认？</b>看页面顶部标签：<br>' +
        '· 显示「云端已连接 · 录入员」→ 正常，放心录<br>' +
        '· 显示「本机模式 · 录入员」→ 就是现在这个状态，先去换链接</div>'
      : '';
    const pend = pendingMatches();
    const vOpts = ST.venues.map(v => '<option value="' + esc(v.id) + '"' + (v.id === RC.venue ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('');
    /* 场地占位项也留空，保持界面干净 */
    const vHead = RC.venue ? '' : '<option value="" selected></option>';

    /* 已导入的出场名单提示 */
    const LINEUP_TIP = (RC.lineup && RC.lineup.length)
      ? '<div class="note rc-lineup">✓ 已导入出场名单 <b>' + RC.lineup.length + ' 人</b>：' +
        RC.lineup.map(id => { const p = playerById(id); return p ? esc(p.name) : ''; }).filter(Boolean).join('、') +
        '<br><button class="btn ghost" id="rc_clearlu" style="margin-top:8px">清除名单</button></div>'
      : '';

    el.innerHTML =
      OFFLINE_WARN +
      '<div class="block rc">' +
        '<div class="block-hd"><h3>本场比赛</h3><span class="block-sub" id="rc_mode">新录入</span></div>' +
        '<button class="btn wide ghost" id="rc_jielong" style="margin-bottom:10px">📋 从微信接龙导入</button>' +
        LINEUP_TIP +
        (pend.length ? '<div class="fld rc-pick">' +
          '<label>继续未完成的比赛（' + pend.length + ' 场）</label>' +
          '<select class="ipt" id="rc_pick"><option value="">＋ 新录一场</option>' +
          pend.map(m => {
            const d = new Date(m.match_date || 0);
            const dt = isNaN(d) ? '待定' : (d.getMonth() + 1) + '/' + d.getDate();
            return '<option value="' + esc(m.id) + '">' + esc(dt + ' vs ' + (m.opponent || '待定')) + '</option>';
          }).join('') +
          '</select></div>' : '') +
        '<div class="fld-row">' +
          '<div class="fld"><label>日期</label><input class="ipt" type="date" id="rc_date" value="' + esc(RC.date || '') + '"></div>' +
          '<div class="fld"><label>场地</label><select class="ipt" id="rc_venue">' + vHead + vOpts + '</select></div>' +
        '</div>' +
        '<div class="fld-row">' +
          '<div class="fld"><label>对手</label><input class="ipt" id="rc_opp" value="' + esc(RC.opp || '') + '"></div>' +
          '<div class="fld rc-score"><label>比分</label><div class="score-row">' +
            '<input class="ipt" type="number" inputmode="numeric" id="rc_our" value="' + esc(RC.our || '') + '">' +
            '<span class="vs">:</span>' +
            '<input class="ipt" type="number" inputmode="numeric" id="rc_opp2" value="' + esc(RC.oppS || '') + '">' +
          '</div></div>' +
        '</div>' +
        '<button class="btn wide ghost" id="rc_cancel" style="display:' + (RC.mid ? '' : 'none') + ';margin-top:2px">取消继续录入，回到新录一场</button>' +
      '</div>' +
      /* ★ 进球 / 助攻合并成一个区块，同一行内并排填写 */
      '<div class="block rc">' +
        '<div class="block-hd"><h3>本场数据</h3><span class="block-sub" id="rc_sum">进 0 · 助 0</span></div>' +
        '<div class="ev-head"><span>球员</span><span>进球</span><span>助攻</span><span></span></div>' +
        '<div id="rc_rows">' + evRowsHtml() + '</div>' +
        '<button class="btn wide ghost" id="rc_add" style="margin-top:8px">＋ 添加球员</button>' +
      '</div>' +
      '<div style="margin:14px 0"><button class="btn wide big" id="rc_save">✓ 保存这场比赛</button></div>' +
      '<div class="block"><div class="block-hd"><h3>最近录入</h3><span class="block-sub">点开可查看详情 / 删除</span></div>' +
        '<div id="rc_recent" class="list">' + recentHtml() + '</div></div>';

    /* 记住已填内容，避免重渲染时丢失 */
    const keep = () => {
      RC.date = ($('#rc_date').value || '');
      RC.venue = ($('#rc_venue').value || '');
      RC.opp = ($('#rc_opp').value || '');
      RC.our = ($('#rc_our').value || '');
      RC.oppS = ($('#rc_opp2').value || '');
    };

    const bind = () => {
      $$('#recordBody .evrow').forEach(row => {
        const i = +row.dataset.i;
        row.querySelector('.ev-p').onchange = e => { RC.rows[i].p = e.target.value; renderRecord(); };
        const nums = row.querySelectorAll('.ev-n');
        nums[0].oninput = e => { RC.rows[i].g = e.target.value; updSum(); };
        nums[1].oninput = e => { RC.rows[i].a = e.target.value; updSum(); };
        row.querySelector('.ev-del').onclick = () => {
          keep();
          RC.rows.splice(i, 1);
          if (!RC.rows.length) RC.rows.push({ p: '', g: '', a: '' });
          renderRecord();
        };
      });
    };
    const updSum = () => {
      const t = rcSum();
      const n = $('#rc_sum'); if (n) n.textContent = '进 ' + t.g + ' · 助 ' + t.a;
    };
    const addRow = () => {
      keep();
      RC.rows.push({ p: '', g: '', a: '' });
      renderRecord();
    };

    /* ---- 继续录入：选中未完成的比赛，把已有信息带进表单 ---- */
    const setMode = txt => {
      const m = $('#rc_mode'); if (m) m.textContent = txt;
      const b = $('#rc_save'); if (b) b.textContent = txt === '新录入' ? '✓ 保存这场比赛' : '✓ 更新这场比赛';
      if (RC.mid && txt !== '新录入' && $('#rc_cancel')) $('#rc_cancel').style.display = '';
    };
    const resetForm = () => {
      RC.mid = ''; RC.rows = [{ p: '', g: '', a: '' }];
      RC.date = ''; RC.venue = ''; RC.opp = ''; RC.our = ''; RC.oppS = ''; RC.lineup = [];
      renderRecord();
      setMode('新录入');
    };

    const pick = $('#rc_pick');
    if (pick) pick.onchange = () => {
      const id = pick.value;
      if (!id) return resetForm();
      const m = ST.matches.find(x => x.id === id);
      if (!m) return resetForm();
      RC.mid = id;
      const d = new Date(m.match_date || 0);
      RC.date = isNaN(d) ? '' : dateInputVal(d);
      RC.venue = m.venue_id || '';
      RC.opp = m.opponent || '';
      RC.our = (m.our_score == null ? '' : String(m.our_score));
      RC.oppS = (m.opp_score == null ? '' : String(m.opp_score));
      /* 已有事件按球员聚合成行，进球 / 助攻并排显示 */
      const ev = ST.events.filter(e => e.match_id === id);
      const map = {}; const order = [];
      ev.forEach(e => {
        if (e.type !== 'goal' && e.type !== 'assist') return;
        if (!map[e.player_id]) { map[e.player_id] = { p: e.player_id, g: '', a: '' }; order.push(e.player_id); }
        const c = Number(e.count) || 0;
        if (e.type === 'goal') map[e.player_id].g = String((Number(map[e.player_id].g) || 0) + c);
        else map[e.player_id].a = String((Number(map[e.player_id].a) || 0) + c);
      });
      RC.rows = order.length ? order.map(k => map[k]) : [{ p: '', g: '', a: '' }];
      /* 出场名单带回来（appear 事件） */
      RC.lineup = ev.filter(e => e.type === 'appear').map(e => e.player_id).filter(Boolean);
      renderRecord();
      setMode('继续录入 · ' + (m.opponent || ''));
      toast('已载入：' + (m.opponent || '') );
    };
    if ($('#rc_cancel')) $('#rc_cancel').onclick = resetForm;

    $('#rc_add').onclick = addRow;
    $('#rc_save').onclick = saveRecord;
    if ($('#rc_jielong')) $('#rc_jielong').onclick = openJielongImport;
    if ($('#rc_clearlu')) $('#rc_clearlu').onclick = () => { keep(); RC.lineup = []; renderRecord(); };
    /* 输入时记住，切页面回来不丢 */
    ['#rc_date', '#rc_venue', '#rc_opp', '#rc_our', '#rc_opp2'].forEach(sel => {
      const n = $(sel); if (n) n.onchange = keep;
    });
    bind(); updSum();
    if (RC.mid) setMode('继续录入');
    $$('#rc_recent .fix').forEach(n => n.onclick = () => openMatch(n.dataset.mid));
  }

  /* 把 Date 转成 <input type="date"> 需要的 YYYY-MM-DD（按本地时区） */
  function dateInputVal(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------------- 接龙导入界面 ---------------- */
  function openJielongImport() {
    openSheet('从微信接龙导入',
      '<div class="note">把群里的接龙整段粘进来，自动识别<b>日期 / 场地 / 对手 / 出场名单</b>。<br>' +
        '带「（待定）」的会自动跳过。</div>' +
      '<div class="fld"><label>接龙内容</label>' +
      '<textarea class="ipt" id="jl_txt" rows="8" placeholder="#接龙\n周四晚上8点，华涌2号场，实达（白色）对旺旺（红色）\n\n1. 秋风\n2. 蓝\n3. 张远城"></textarea></div>' +
      '<div class="acts"><button class="btn" id="jl_go">解析</button></div>' +
      '<div id="jl_result"></div>', () => {
        $('#jl_go').onclick = () => {
          const txt = ($('#jl_txt').value || '').trim();
          if (!txt) return toast('请先粘贴接龙内容');
          const r = jielongParse(txt);
          const box = $('#jl_result');
          if (!r.items.length) {
            box.innerHTML = '<div class="note" style="margin-top:12px">没识别出名单。请确认每行是「1. 名字」这种格式。</div>';
            return;
          }
          const v = r.venueId ? venueById(r.venueId) : null;
          const un = r.unknown || [];
          box.innerHTML =
            '<div class="block rc" style="margin-top:12px">' +
            '<div class="block-hd"><h3>识别结果</h3><span class="block-sub">' +
            '匹配 ' + r.matched + ' 人' + (r.skipped ? ' · 跳过 ' + r.skipped + ' 人' : '') + '</span></div>' +
            '<div class="fld-row">' +
            '<div class="fld"><label>日期</label><input class="ipt" type="datetime-local" id="jl_date" value="' + esc(r.date) + '"></div>' +
            '<div class="fld"><label>对手</label><input class="ipt" id="jl_opp" value="' + esc(r.opponent) + '"></div>' +
            '</div>' +
            '<div class="fld"><label>场地</label><select class="ipt" id="jl_venue">' +
            '<option value=""></option>' +
            ST.venues.map(x => '<option value="' + esc(x.id) + '"' + (x.id === r.venueId ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') +
            '</select></div>' +
            '<div class="note" style="margin-top:4px">识别到的名单：<br>' +
            r.items.map(x => {
              if (x.skip) return '<span style="opacity:.5;text-decoration:line-through">' + esc(x.clean) + '（待定，跳过）</span>';
              return x.player ? esc(x.player.name) : '<b style="color:#A01111">' + esc(x.clean) + '（未识别）</b>';
            }).join('、') + '</div>' +
            (un.length ? '<div style="margin-top:10px"><label>把这些昵称关联到球员（选一次就记住）</label>' +
              un.map((x, i) => '<div class="evrow" data-i="' + i + '">' +
                '<span class="jl-nick">' + esc(x.clean) + '</span>' +
                '<select class="ipt ev-p jl-sel" data-nick="' + esc(x.clean) + '">' +
                '<option value="">跳过此人</option>' +
                ST.players.map(p => '<option value="' + esc(p.name) + '">#' + esc(p.number || '-') + ' ' + esc(p.name) + '</option>').join('') +
                '</select></div>').join('') + '</div>' : '') +
            '<div style="margin-top:12px"><button class="btn wide big" id="jl_apply">✓ 导入到录入表单</button></div>' +
            '</div>';

          $('#jl_apply').onclick = () => {
            /* 保存现场关联 */
            $$('#jl_result .jl-sel').forEach(sel => {
              const v2 = sel.value;
              if (v2) nickSave(sel.dataset.nick, v2);
            });
            const names = [];
            r.items.forEach(x => {
              if (x.skip) return;
              let p = x.player;
              if (!p) {
                const nm = nickMapAll()[x.clean];
                if (nm) p = playerByName(nm);
              }
              if (p) names.push(p.id);
            });
            if (!names.length) return toast('没有识别到任何球员，请先在「球员」页添加');
            /* 填入录入表单 */
            RC.date = ($('#jl_date').value || '');
            RC.venue = ($('#jl_venue').value || '');
            RC.opp = ($('#jl_opp').value || '');
            RC.lineup = names;
            closeSheet();
            renderRecord();
            toast('已导入：' + RC.opp + ' · 出场 ' + names.length + ' 人');
          };
        };
      });
  }

  function recentHtml() {
    const mine = ST.matches.filter(m => m.status === 'finished')
      .sort((a, b) => new Date(b.match_date || 0) - new Date(a.match_date || 0)).slice(0, 6);
    return mine.length ? mine.map(m => fixtureRow(m)).join('') :
      '<div class="empty" style="padding:14px 0">还没有录入记录</div>';
  }

  async function saveRecord() {
    const opp = ($('#rc_opp').value || '').trim();
    if (!opp) return toast('请填写对手队名');
    const dv = ($('#rc_date').value || '').trim();
    if (!dv) return toast('请选择比赛日期');
    /* 只选了日期没选时间时，自动补默认开球时间，避免显示成 00:00 */
    const def = APP_CONFIG.recordDefaults || {};
    const date = toISO(dv.length <= 10 ? dv + 'T' + (def.kickoff || '19:30') : dv);
    if (!date) return toast('比赛日期无效');
    const our = $('#rc_our').value === '' ? 0 : (Number($('#rc_our').value) || 0);
    const oppS = $('#rc_opp2').value === '' ? 0 : (Number($('#rc_opp2').value) || 0);
    /* 每行可同时填进球与助攻 */
    const goals = RC.rows.filter(r => r.p && (Number(r.g) || 0) > 0)
      .map(r => ({ p: r.p, n: Number(r.g) || 0 }));
    const assists = RC.rows.filter(r => r.p && (Number(r.a) || 0) > 0)
      .map(r => ({ p: r.p, n: Number(r.a) || 0 }));
    if (!goals.length && our > 0) {
      if (!confirm('本场进了 ' + our + ' 球，但没有填写进球球员。仍要保存吗？')) return;
    }
    /* 本机模式：录入的数据队友看不到，保存前再拦一次 */
    if (!Store.isCloud()) {
      if (!confirm('⚠️ 当前是本机模式，这场比赛保存后只有你自己能看到，不会同步给全队。\n\n确定要这样保存吗？（建议改用管理员发的队友专用链接）')) return;
    }
    const btn = $('#rc_save'); const old = btn.textContent;
    btn.textContent = '保存中…'; btn.disabled = true;
    const mid = RC.mid;   /* 有值 = 继续录入（更新），空 = 新录一场 */
    try {
      const d = new Date(date);
      const payload = {
        opponent: opp, match_date: date, season: String(d.getFullYear()),
        round: '', competition: def.competition || '联赛', is_home: def.is_home !== false,
        venue_id: $('#rc_venue').value || null,
        our_score: our, opp_score: oppS, status: 'finished', remark: ''
      };
      let m;
      if (mid) {
        /* 更新已有比赛：先清掉旧事件再写入，避免重复累加 */
        await Store.update('matches', mid, payload);
        await Store.removeWhere('events', 'match_id', mid);
        m = { id: mid };
      } else {
        payload.created_by = ST.user || '';
        m = await Store.insert('matches', payload);
      }
      for (const r of goals) {
        await Store.insert('events', { match_id: m.id, player_id: r.p, type: 'goal', count: r.n, minute: null, is_penalty: false });
      }
      for (const r of assists) {
        await Store.insert('events', { match_id: m.id, player_id: r.p, type: 'assist', count: r.n, minute: null, is_penalty: false });
      }
      /* 出场名单（接龙导入）：写成 appear 事件，出场榜直接按它统计 */
      (RC.lineup || []).forEach(pid => {
        if (pid) Store.insert('events', { match_id: m.id, player_id: pid, type: 'appear', count: 1, minute: null, is_penalty: false });
      });
      const luN = (RC.lineup || []).length;
      /* 清空表单 */
      RC.mid = ''; RC.rows = [{ p: '', g: '', a: '' }];
      RC.date = ''; RC.venue = ''; RC.opp = ''; RC.our = ''; RC.oppS = ''; RC.lineup = []; RC.lineup = [];
      await refresh();
      renderRecord();
      toast((mid ? '已更新：' : '已保存：') + opp + ' ' + our + ':' + oppS + (luN ? ' · 出场 ' + luN + ' 人' : ''));
    } catch (e) {
      toast('保存失败：' + (e.message || e)); btn.textContent = old; btn.disabled = false;
    }
  }

  /* ---------------- 导航 ---------------- */
  /* 权限规则：
     游客（未登录） → 首页 / 赛程 / 榜单
     录入员        → 首页 / 录入 / 赛程 / 榜单
     管理员        → 全部 */
  const NAV = [
    { v: 'home', i: '🏠', t: '首页', always: true },
    { v: 'record', i: '📝', t: '录入', role: 'rec' },
    { v: 'fixtures', i: '📅', t: '赛程', always: true },
    { v: 'stats', i: '🏆', t: '榜单', always: true },
    { v: 'players', i: '👥', t: '球员', role: 'admin' },
    { v: 'venues', i: '⚽', t: '场地', role: 'admin' }
  ];

  /* 当前角色能进哪些页面 */
  function allowedViews() {
    return NAV.filter(n => n.always || (n.role === 'rec' && canRecord()) || (n.role === 'admin' && canEdit()))
      .map(n => n.v);
  }

  /* 渲染底部导航：按角色显示 */
  function renderNav() {
    const bar = $('#tabbar');
    const list = NAV.filter(n => n.always || (n.role === 'rec' && canRecord()) || (n.role === 'admin' && canEdit()));
    bar.innerHTML = list.map(n =>
      '<button class="tbtn' + (ST.view === n.v ? ' active' : '') + '" data-view="' + n.v + '">' +
      '<i>' + n.i + '</i><span>' + n.t + '</span></button>').join('');
    $$('#tabbar .tbtn').forEach(b => b.onclick = () => go(b.dataset.view));
  }
  /* 切换页面（带权限校验：非管理员访问球员/场地会被挡回首页） */
  function go(v) {
    const ok = allowedViews();
    if (ok.indexOf(v) < 0) {
      toast(v === 'players' || v === 'venues' ? '该功能仅管理员可见' : '请先登录');
      v = 'home';
    }
    ST.view = v;
    $$('.view').forEach(x => x.classList.remove('active'));
    const el = $('#view-' + v); if (el) el.classList.add('active');
    $$('#tabbar .tbtn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    if (v === 'record') renderRecord();
    window.scrollTo(0, 0);
  }

  $$('.tab[data-lb]').forEach(b => b.onclick = () => {
    $$('.tab[data-lb]').forEach(x => x.classList.remove('active')); b.classList.add('active');
    ST.lb = b.dataset.lb; renderFullRank();
  });
  on('#btnAdmin', 'onclick', openAdmin);
  /* 备用入口：万一 ⚙️ 被隐藏，连点标题 5 次也能进后台 */
  (function () {
    const t = $('#appTitle'); if (!t) return;
    let n = 0, last = 0;
    t.onclick = () => {
      const now = Date.now();
      if (now - last > 1200) n = 0;
      last = now; n++;
      if (n >= 5) { n = 0; openAdmin(); }
    };
  })();
  on('#btnAddMatch', 'onclick', openMatchNew);
  on('#btnAddPlayer', 'onclick', openPlayerNew);
  on('#btnAddVenue', 'onclick', openVenueNew);
  on('#seasonFilter', 'onchange', renderFixtures);
  on('#playerSearch', 'oninput', renderPlayers);
  on('#btnShot', 'onclick', doShot);
  on('#btnSaveShot', 'onclick', saveShotToDisk);
  on('#btnShareShot', 'onclick', shareShotToApp);

  /* ---------------- PWA ---------------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }

  /* ---------------- 启动 ---------------- */
  (async function boot() {
    loadAdmin();
    const mode = await Store.init();
    await refresh();
    const empty = !ST.matches.length && !ST.players.length && !ST.venues.length;
    renderNav();
    go('home');
    /* 环境自检：把关键依赖状态打到控制台，方便排查「点不动」 */
    const diag = {
      网址: global.location.href,
      协议: global.location.protocol,
      弹窗结构: !!$('#sheet') && !!$('#sheetBody'),
      顶部按钮: !!$('#btnAdmin'),
      supabase: !!(global.supabase && global.supabase.createClient),
      海报模块: !!global.Poster,
      存储可用: (function () { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; } })(),
      数据模式: mode,
      云端地址: Store.cfg.url || '(未配置)'
    };
    diag.版本 = APP_VER;
    let verTap = 0;
    console.log('[狮山实达] 环境自检', diag);
    global.__DIAG = diag;
    /* 页面上也标出来，点 5 次可复制完整诊断信息 */
    const vt = $('#verTag');
    if (vt) {
      vt.textContent = APP_VER;
      vt.onclick = () => {
        verTap++;
        if (verTap >= 5) {
          verTap = 0;
          const txt = JSON.stringify(diag, null, 1);
          try {
            const ta = document.createElement('textarea');
            ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            toast('诊断信息已复制');
          } catch (e) { console.log(txt); toast('请到控制台查看 __DIAG'); }
        }
      };
    }
    if (!diag.supabase) console.warn('[狮山实达] vendor/supabase.js 未加载 → 无法连云端（请确认该文件已上传）');
    if (!diag.Poster) console.warn('[狮山实达] js/poster.js 未加载 → 截图不可用（请确认该文件已上传）');
    try { wechatTip(); } catch (e) { console.warn('微信提示未显示', e); }
    /* 隐藏 ⚙️ 后的入口：网址后加 #admin 即可打开登录 */
    try {
      if (String(global.location.hash || '').replace(/^#/, '').toLowerCase() === 'admin') {
        setTimeout(() => openAdmin(), 300);
      }
    } catch (e) { }
  })();

  window.__SCLH = { ST: ST, refresh: refresh };
})();
