/* ============================================================
 *  数据层：Supabase 云端 / 本机 localStorage 双实现
 *  配置填了 supabase.url + anonKey → 自动走云端
 *  否则走本机演示模式，功能完全一致
 * ============================================================ */
(function (global) {
  'use strict';

  const LS = 'sclh_';
  const TABLES = ['players', 'venues', 'matches', 'events'];

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- 本机模式 ---------- */
  const Local = {
    read(table) {
      try { return JSON.parse(localStorage.getItem(LS + table) || '[]'); }
      catch (e) { return []; }
    },
    write(table, rows) { localStorage.setItem(LS + table, JSON.stringify(rows)); },
    async list(table) { return Local.read(table); },
    async get(table, id) { return Local.read(table).find(r => r.id === id) || null; },
    async insert(table, obj) {
      const rows = Local.read(table);
      obj.id = obj.id || uid();
      obj.created_at = obj.created_at || new Date().toISOString();
      rows.push(obj); Local.write(table, rows); return obj;
    },
    async update(table, id, obj) {
      const rows = Local.read(table);
      const i = rows.findIndex(r => r.id === id);
      if (i < 0) return null;
      rows[i] = Object.assign({}, rows[i], obj); Local.write(table, rows); return rows[i];
    },
    async remove(table, id) {
      const rows = Local.read(table).filter(r => r.id !== id);
      Local.write(table, rows); return true;
    },
    async removeWhere(table, field, value) {
      const rows = Local.read(table).filter(r => r[field] !== value);
      Local.write(table, rows); return true;
    }
  };

  /* ---------- 云端模式 ---------- */
  /* 从 PostgREST 报错里抠出缺失的列名，例如：
     Could not find the 'competition' column of 'matches' in the schema cache */
  function missingColumn(err) {
    const s = String((err && (err.message || err.details || err.hint)) || '');
    /* PostgREST 缓存未刷新时：Could not find the 'competition' column of 'matches' in the schema cache */
    let m = s.match(/Could not find the ['"]([^'"]+)['"] column/i);
    if (m) return m[1];
    /* Postgres 原生：column matches.competition does not exist
                     column "is_penalty" of relation "events" does not exist */
    if (!/does not exist/i.test(s)) return null;
    m = s.match(/column\s+["']?(?:[\w]+\.)?([a-z_][a-z0-9_]*)["']?.*?does not exist/is);
    return m ? m[1] : null;
  }

  const Cloud = {
    client: null,
    missingCols: {},   // 记住哪些列在这张表里不存在，后续自动跳过

    init(cfg) {
      const fn = global.supabase && global.supabase.createClient;
      if (!fn) throw new Error('supabase.js 未加载');
      Cloud.client = fn(cfg.url, cfg.anonKey);
      Cloud.missingCols = {};
      return Cloud.client;
    },

    /* 剔除云端表里不存在的列，避免整条写入失败 */
    strip(table, obj) {
      const bad = Cloud.missingCols[table];
      if (!bad || !bad.size) return obj;
      const o = {};
      Object.keys(obj).forEach(k => { if (!bad.has(k)) o[k] = obj[k]; });
      return o;
    },

    /* 写入失败时，抠掉缺失列再重试一次；整表缺列也会记住，下次不再带 */
    async write(kind, table, arg1, arg2) {
      let payload = kind === 'insert' ? arg1 : arg2;
      const known = Cloud.missingCols[table] || new Set();
      if (known.size) {
        Object.keys(payload).forEach(k => { if (known.has(k)) delete payload[k]; });
      }
      let tries = 0;
      for (;;) {
        const res = kind === 'insert'
          ? await Cloud.client.from(table).insert([payload]).select().single()
          : await Cloud.client.from(table).update(payload).eq('id', arg1).select().single();
        if (!res.error) return res.data;
        const col = missingColumn(res.error);
        if (col && tries < 4 && payload[col] !== undefined) {
          (Cloud.missingCols[table] = Cloud.missingCols[table] || new Set()).add(col);
          delete payload[col];
          tries++;
          continue;                     // 自动降级：丢掉这一列再试，保住整条数据
        }
        throw res.error;
      }
    },
    async list(table, opts) {
      opts = opts || {};
      let q = Cloud.client.from(table).select('*');
      if (opts.order) q = q.order(opts.order, { ascending: !!opts.asc });
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async get(table, id) {
      const { data, error } = await Cloud.client.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    async insert(table, obj) {
      delete obj.id;
      return Cloud.write('insert', table, obj);
    },
    /* 导入备份时用：保留原 id，保证比赛↔场地、事件↔球员/比赛的关联不断 */
    async rawInsert(table, obj) {
      return Cloud.write('insert', table, Object.assign({}, obj));
    },
    async update(table, id, obj) {
      delete obj.id;
      return Cloud.write('update', table, id, obj);
    },
    async remove(table, id) {
      const { error } = await Cloud.client.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    async removeWhere(table, field, value) {
      const { error } = await Cloud.client.from(table).delete().eq(field, value);
      if (error) throw error;
      return true;
    }
  };

  const SORTERS = {
    players: (a, b) => (Number(a.number) || 99) - (Number(b.number) || 99),
    matches: (a, b) => new Date(b.match_date || 0) - new Date(a.match_date || 0),
    venues: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'),
    events: (a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0)
  };

  /* ---------- 云端配置来源：分享链接 > 本机已保存 > config.js ---------- */
  function readSaved() {
    try { return JSON.parse(localStorage.getItem(LS + 'cloud_cfg') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function fromUrl() {
    try {
      const q = new URLSearchParams(global.location.search);
      return { url: (q.get('su') || '').trim(), anonKey: (q.get('sk') || '').trim() };
    } catch (e) { return { url: '', anonKey: '' }; }
  }

  /* URL 规范化：不少人会整串复制 Data API 页面上的
     https://xxx.supabase.co/rest/v1/ ，这里自动砍成 https://xxx.supabase.co */
  function normalizeUrl(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    s = s.replace(/\/+$/, '');                    // 去掉末尾斜杠
    s = s.replace(/\/rest\/v\d+\/?$/i, '');       // 去掉 /rest/v1
    s = s.replace(/\/rest\/?$/i, '');
    s = s.replace(/\/auth\/v\d+\/?$/i, '');
    s = s.replace(/\/graphql\/v\d+\/?$/i, '');
    s = s.replace(/\/storage\/v\d+\/?$/i, '');
    s = s.replace(/\/+$/, '');
    // 只保留到域名，去掉任何残留路径
    try {
      const uu = new URL(s);
      s = uu.origin;
    } catch (e) { /* 解析失败就用正则处理过的结果 */ }
    return s;
  }

  const Store = {
    mode: 'local',
    ready: false,
    source: 'none',   // none | url | saved | config
    cfg: { url: '', anonKey: '' },

    resolveCfg() {
      const base = (global.APP_CONFIG && global.APP_CONFIG.supabase) || {};
      const saved = readSaved();
      const q = fromUrl();
      if (q.url && q.anonKey) {
        const fixed = { url: normalizeUrl(q.url), anonKey: q.anonKey.trim() };
        Store.source = 'url';
        if (fixed.url !== saved.url || fixed.anonKey !== saved.anonKey) {
          try { localStorage.setItem(LS + 'cloud_cfg', JSON.stringify(fixed)); } catch (e) { }
        }
        return fixed;
      }
      if (saved.url && saved.anonKey) { Store.source = 'saved'; return saved; }
      if (base.url && base.anonKey) { Store.source = 'config'; return base; }
      Store.source = 'none';
      return { url: '', anonKey: '' };
    },

    async init() {
      const cfg = Store.resolveCfg();
      Store.cfg = cfg;
      if (cfg.url && cfg.anonKey) {
        try { Cloud.init(cfg); Store.mode = 'cloud'; }
        catch (e) { console.error('云端初始化失败，回退本机模式', e); Store.mode = 'local'; Store.source = 'none'; }
      } else {
        Store.mode = 'local';
      }
      Store.ready = true;
      return Store.mode;
    },

    /* 界面里连接云端：保存并立即生效 */
    async connectCloud(url, anonKey) {
      url = normalizeUrl(url); anonKey = String(anonKey || '').trim();
      if (!url || !anonKey) throw new Error('URL 和 Key 都要填');
      if (!/^https?:\/\//i.test(url)) throw new Error('URL 要以 https:// 开头');
      if (!/\.supabase\.(co|in|net)$/i.test(url.replace(/\/+$/, ''))) {
        throw new Error('URL 应该形如 https://abcdefgh.supabase.co');
      }
      if (/^sb_secret_/i.test(anonKey)) throw new Error('这是 secret key，请改用 publishable / anon public key');
      try { Cloud.init({ url: url, anonKey: anonKey }); }
      catch (e) { throw new Error('连接失败：' + e.message); }
      // 探活：读一次球队资料，确认 key 有效、表已建好
      const { error } = await Cloud.client.from('team_profile').select('*').limit(1);
      if (error) throw new Error('连接失败：' + (error.message || '请确认已执行建表脚本'));
      localStorage.setItem(LS + 'cloud_cfg', JSON.stringify({ url: url, anonKey: anonKey }));
      Store.mode = 'cloud'; Store.source = 'saved'; Store.cfg = { url: url, anonKey: anonKey };
      return true;
    },

    disconnectCloud() {
      localStorage.removeItem(LS + 'cloud_cfg');
      Store.mode = 'local'; Store.source = 'none'; Store.cfg = { url: '', anonKey: '' };
      Cloud.client = null;
    },

    /* 云端表结构自检：逐列探测，返回缺失清单 + 应执行的 SQL */
    async checkSchema() {
      if (!Store.isCloud()) throw new Error('尚未连接云端');
      const want = {
        matches: ['competition', 'created_by', 'season', 'round', 'is_home', 'venue_id', 'our_score', 'opp_score', 'status', 'remark'],
        events: ['is_penalty', 'match_id', 'player_id', 'type', 'count', 'minute'],
        players: ['number', 'position', 'phone', 'avatar_url', 'joined_at', 'active'],
        venues: ['address', 'surface', 'price', 'contact', 'map_url', 'remark'],
        team_profile: ['name', 'slogan', 'founded', 'home_venue', 'logo_url', 'intro']
      };
      const missing = [];
      for (const table of Object.keys(want)) {
        for (const col of want[table]) {
          try {
            const { error } = await Cloud.client.from(table).select(col).limit(1);
            if (error && /Could not find the '[^']+' column|does not exist/i.test(error.message)) missing.push([table, col]);
          } catch (e) {
            if (/Could not find the '[^']+' column|does not exist/i.test(String(e.message))) missing.push([table, col]);
          }
        }
      }
      return missing;
    },

    /* 本机已录了多少条数据 */
    localCounts() {
      const o = {};
      for (const t of TABLES) {
        try { o[t] = (JSON.parse(localStorage.getItem(LS + t) || '[]') || []).length; }
        catch (e) { o[t] = 0; }
      }
      o.total = o.players + o.venues + o.matches + o.events;
      return o;
    },

    /* 把本机数据原样搬上云端（保留 id，保证进球/助攻与比赛、球员的对应关系不断裂） */
    async migrateLocalToCloud() {
      if (!Store.isCloud()) throw new Error('尚未连接云端');
      let n = 0;
      for (const t of TABLES) {
        const rows = Local.read(t);
        if (!rows.length) continue;
        const { data, error } = await Cloud.client.from(t).select('id').limit(1);
        if (error) throw error;
        if (data && data.length) continue;           // 云端该表已有数据，跳过以免重复
        for (const r of rows) {
          const row = Object.assign({}, r);
          if (!row.id) row.id = uid();
          const { error: e2 } = await Cloud.client.from(t).insert([row]);
          if (e2) throw e2;
          n++;
        }
      }
      return n;
    },

    /* 当前页面是不是只在自己这台设备能打开（file:// 或 localhost） */
    shareIsLocal() {
      try {
        const loc = global.location;
        const p = String(loc.protocol || '').toLowerCase();
        const h = String(loc.hostname || '').toLowerCase();
        return p === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '' || h === '0.0.0.0';
      } catch (e) { return true; }
    },

    shareLink() {
      const c = Store.cfg;
      if (!c.url || !c.anonKey) return '';
      let base = '';
      try {
        const loc = global.location;
        if (String(loc.protocol || '').toLowerCase() === 'file:') base = loc.href.split('?')[0];
        else base = loc.origin + loc.pathname;
      } catch (e) { return ''; }
      return base + '?su=' + encodeURIComponent(c.url) + '&sk=' + encodeURIComponent(c.anonKey);
    },

    isCloud() { return Store.mode === 'cloud'; },

    /* 球队资料：单条记录 */
    async getProfile() {
      if (Store.isCloud()) {
        try {
          const { data, error } = await Cloud.client.from('team_profile').select('*').limit(1);
          if (error) throw error;
          if (data && data.length) return data[0];
          const { data: created, error: e2 } = await Cloud.client
            .from('team_profile').insert([Object.assign({}, global.DEFAULT_PROFILE)]).select().single();
          if (e2) throw e2;
          return created;
        } catch (e) { console.warn('读取云端球队资料失败', e); return Object.assign({}, global.DEFAULT_PROFILE); }
      }
      let p = null;
      try { p = JSON.parse(localStorage.getItem(LS + 'profile') || 'null'); } catch (e) { p = null; }
      return p || Object.assign({}, global.DEFAULT_PROFILE);
    },

    async saveProfile(obj) {
      if (Store.isCloud()) {
        const cur = await Store.getProfile();
        if (cur && cur.id) {
          const { data, error } = await Cloud.client.from('team_profile')
            .update(obj).eq('id', cur.id).select().single();
          if (error) throw error;
          return data;
        }
        const { data, error } = await Cloud.client.from('team_profile').insert([obj]).select().single();
        if (error) throw error;
        return data;
      }
      localStorage.setItem(LS + 'profile', JSON.stringify(obj));
      return obj;
    },

    async list(table) {
      const rows = Store.isCloud() ? await Cloud.list(table) : await Local.list(table);
      const s = SORTERS[table];
      return s ? rows.slice().sort(s) : rows;
    },
    async get(table, id) { return Store.isCloud() ? Cloud.get(table, id) : Local.get(table, id); },
    async insert(table, obj) { return Store.isCloud() ? Cloud.insert(table, obj) : Local.insert(table, obj); },
    async update(table, id, obj) { return Store.isCloud() ? Cloud.update(table, id, obj) : Local.update(table, id, obj); },
    async remove(table, id) { return Store.isCloud() ? Cloud.remove(table, id) : Local.remove(table, id); },
    async removeWhere(table, f, v) { return Store.isCloud() ? Cloud.removeWhere(table, f, v) : Local.removeWhere(table, f, v); },

    /* 整库导出 / 导入 */
    async exportAll() {
      const out = { app: global.APP_CONFIG.appName, exported_at: new Date().toISOString(), profile: await Store.getProfile() };
      for (const t of TABLES) out[t] = await Store.list(t);
      return out;
    },
    async importAll(data) {
      if (!data) throw new Error('文件内容为空');
      if (data.profile) await Store.saveProfile(data.profile);
      for (const t of TABLES) {
        if (!Array.isArray(data[t])) continue;
        for (const row of data[t]) {
          if (Store.isCloud()) await Cloud.rawInsert(t, row); else await Local.insert(t, row);
        }
      }
      return true;
    },
    async clearAll() {
      for (const t of TABLES) {
        const rows = await Store.list(t);
        for (const r of rows) await Store.remove(t, r.id);
      }
      return true;
    }
  };

  global.Store = Store;
  global.uid = uid;
})(window);
