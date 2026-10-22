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

  /* 录入员录一场比赛时，默认的主客场 / 赛事类型 / 开球时间
     （界面里不显示，保持录入极简；只选日期时会自动补上开球时间，
       避免赛程里显示成 00:00） */
  recordDefaults: {
    is_home: true,
    competition: '联赛',
    kickoff: '19:30'
  },

  /* ============================================================
   *  顶栏显示开关（发给队友的链接上想更干净就改这里）
   *  showVersion: 'admin'  仅管理员可见（默认，队友看不到版本号）
   *                'always' 所有人可见
   *                'never'  谁都不显示
   *  showMode:    true    显示「云端已连接 / ⚠️ 本机模式」（默认）
   *                false   不显示，顶栏只剩标题
   *  showAdminBtn: true   显示右上角 ⚙️（登录入口，建议保留）
   *                 false  隐藏（队友彻底看不到管理入口，但你也要靠
   *                        网址后加 #admin 才能登录，见 README）
   * ============================================================ */
  topbar: {
    showVersion: 'admin',
    showMode: true,
    showAdminBtn: true
  }
};

/* 默认球队资料（首次使用时的初始值，可随时在 App 内修改） */
const DEFAULT_PROFILE = {
  name: '狮山实达足球俱乐部',
  slogan: '实达酒鬼，快乐足球',
  founded: '2021',
  home_venue: '佛山世纪莲体育中心',
  intro: '狮山实达足球俱乐部。',
  logo_url: ''
};

/* 同时挂到 window，方便其它脚本与调试台访问 */
window.APP_CONFIG = APP_CONFIG;
window.DEFAULT_PROFILE = DEFAULT_PROFILE;
