/* ============================================================
 *  狮山实达数据统计 —— 全局配置
 *  【重要】把 Supabase 的 URL 和 anon key 填到下面两行，
 *  数据就会自动存到云端；留空则使用本机模式（数据只存这台设备）。
 * ============================================================ */
const APP_CONFIG = {
  appName: '狮山实达数据统计',
  shortName: '狮山实达',
  clubCode: 'SSSD',

  /* 管理员：可管理球队资料、球员、场地、赛程，也能用录入界面 */
  admin: {
    user: 'sclh',
    pass: 'sclh2026'
  },

  /* 数据录入员：登录后只有一个「录入」界面，只能录比赛，不能改球员/场地/清数据
     账号密码可在这里随意修改 */
  recorder: {
    user: 'luru',
    pass: 'sssd2026'
  },

  /* Supabase 云数据库（免费额度足够一支业余球队使用）
     两个值都在 Supabase 控制台：左下角 Settings（齿轮）→ API / API Keys
     - url：Project URL，形如 https://abcdefgh.supabase.co
     - anonKey：anon public（旧）或 publishable（新，sb_publishable_ 开头），两种都能用
       注意：不要用 service_role / sb_secret_ 开头的那个 */
  supabase: {
    url: '',
    anonKey: ''
  },

  /* 登录状态保持多久（小时） */
  adminSessionHours: 72,

  /* 录入员录一场比赛时，默认的主客场 / 赛事类型（界面里不显示，保持录入极简） */
  recordDefaults: {
    is_home: true,
    competition: '联赛'
  }
};

/* 默认球队资料（首次使用时的初始值，可随时在 App 内修改） */
const DEFAULT_PROFILE = {
  name: '狮山实达足球俱乐部',
  slogan: '狮山实达，实干致胜',
  founded: '2021',
  home_venue: '佛山世纪莲体育中心',
  intro: '狮山实达足球俱乐部。',
  logo_url: ''
};

/* 同时挂到 window，方便其它脚本与调试台访问 */
window.APP_CONFIG = APP_CONFIG;
window.DEFAULT_PROFILE = DEFAULT_PROFILE;
