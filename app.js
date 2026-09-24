/* ============================================================
 * 高情商回复引擎 v2.0
 * 场景自动识别 · 人设过滤 · 话术库浏览 · 收藏 · 历史 · 换一批
 * 语音输入（可选）· 本地 AI 引擎（可选，自动探测）
 * ============================================================ */

const $ = (s) => document.querySelector(s);
const state = { persona: 'all', view: 'gen', libScene: 'all', libPersona: 'all' };
let aiReady = true;

/* ---------- 合并扩充话术库（replies2/replies3 在页面中先行加载） ---------- */
if (typeof REPLIES2 !== 'undefined') REPLIES.push(...REPLIES2);
if (typeof REPLIES3 !== 'undefined') REPLIES.push(...REPLIES3);
/* ---------- 合并上海话场景与回复（replies_sh.js） ---------- */
if (typeof SH_SCENARIOS !== 'undefined') SCENARIOS.push(...SH_SCENARIOS);
if (typeof SH_REPLIES !== 'undefined') REPLIES.push(...SH_REPLIES);

/* ---------- 本地存储工具 ---------- */
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let favs = store.get('lk_fav', []);
let hist = store.get('lk_hist', []);

/* ---------- 初始化人设按钮 ---------- */
function renderPersonas() {
  const grid = $('#personaGrid');
  let html = `<div class="persona-item ${state.persona==='all'?'sel':''}" data-p="all">
      <span class="em">🎲</span><span>智能混搭</span></div>`;
  PERSONAS.forEach(p => {
    html += `<div class="persona-item ${state.persona===p.id?'sel':''}" data-p="${p.id}">
      <span class="em">${p.emoji}</span><span>${p.name}</span></div>`;
  });
  grid.innerHTML = html;
  grid.querySelectorAll('.persona-item').forEach(el => {
    el.addEventListener('click', () => {
      state.persona = el.dataset.p;
      renderPersonas();
    });
  });
}

/* ---------- 场景识别（关键词计分） ---------- */
function detectScenarios(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  const scored = SCENARIOS.map(s => {
    const hits = s.keywords.filter(k => t.includes(k.toLowerCase()));
    return { id: s.id, score: hits.length, hits };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored;
}

/* ---------- 方言识别（上海话） ---------- */
function detectDialect(text) {
  if (!text || typeof SH_WORDS === 'undefined') return null;
  const t = text;
  const s3 = SH_WORDS.s3.filter(w => t.includes(w));
  const s2 = SH_WORDS.s2.filter(w => t.includes(w));
  if (s3.length >= 1) return { type: 'sh', label: '🗣️ 上海话', hits: [...s3, ...s2].slice(0, 5) };
  if (s2.length >= 2) return { type: 'sh', label: '🗣️ 上海话', hits: s2.slice(0, 5) };
  return null;
}

/* ---------- 谐音梗识别（接梗专用，不走 AI） ---------- */
function detectXieyin(text) {
  if (!text || typeof XIEYIN_ITEMS === 'undefined') return null;
  const t = text.toLowerCase();
  for (const it of XIEYIN_ITEMS) {
    if (it.w.some(w => t.includes(w.toLowerCase()))) return it;
  }
  return null;
}

/* ---------- 回复生成（带近期去重：连续使用时不会刷到刚用过的） ---------- */
function shuffle(a) { const x = [...a]; for (let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; }

let recentKeys = store.get('lk_recent', []);

function generate(msg, persona, scenarioId, poolOverride) {
  let pool;
  if (poolOverride) {
    pool = poolOverride;
  } else if (scenarioId) {
    pool = REPLIES.filter(r => r.s === scenarioId);
  } else {
    pool = REPLIES;
  }
  if (persona && persona !== 'all') {
    const filtered = pool.filter(r => r.p === persona);
    if (filtered.length >= 2) pool = filtered;
  }
  if (!pool.length) {
    pool = FALLBACK;
    if (persona && persona !== 'all') {
      const f = FALLBACK.filter(r => r.p === persona);
      if (f.length) pool = f;
    }
  }
  // 优先排除最近用过的；新鲜的不够 3 条时，先取新鲜的、再用池里剩下的补齐（保证总有 3 条且尽量不重复）
  let fresh = shuffle(pool).filter(r => !recentKeys.includes(r.t));
  let picked;
  if (fresh.length >= 3) {
    picked = fresh.slice(0, 3);
  } else {
    const rest = shuffle(pool).filter(r => !fresh.includes(r));
    picked = [...fresh, ...rest].slice(0, 3);
  }
  picked.forEach(r => {
    recentKeys.unshift(r.t);
    if (recentKeys.length > 80) recentKeys.pop();
  });
  store.set('lk_recent', recentKeys);
  return picked;
}

/* ---------- 复制 ---------- */
function copyText(text) {
  const done = () => toast('已复制 ✓');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch(e) { toast('复制失败，请长按手动复制'); }
  document.body.removeChild(ta);
}
let toastTimer;
function toast(t) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = t; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

/* ---------- 收藏 ---------- */
function isFav(t) { return favs.includes(t); }
function toggleFav(t) {
  if (isFav(t)) favs = favs.filter(x => x !== t); else favs.push(t);
  store.set('lk_fav', favs);
  toast(isFav(t) ? '已收藏 ⭐' : '已取消收藏');
  if (state.view === 'lib') renderLibraryList();
  if (state.view === 'fav') renderFavView();
}

/* ---------- 历史 ---------- */
function pushHist(msg, items) {
  hist.unshift({ msg, items, time: Date.now() });
  hist = hist.slice(0, 30);
  store.set('lk_hist', hist);
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => (n < 10 ? '0' : '') + n;
  return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 渲染结果 ---------- */
let lastGen = null;
function renderResults(items, scenarioLabel, isAI) {
  const card = $('#resultCard'), list = $('#resultList');
  $('#resultCount').textContent = scenarioLabel ? `· ${scenarioLabel}` : '';
  list.innerHTML = '';
  items.forEach(it => {
    const p = PERSONAS.find(x => x.id === it.p);
    const meta = p ? `${p.emoji} ${p.name}人设` : '高情商回复';
    const el = document.createElement('div');
    el.className = 'reply-item';
    el.innerHTML = `<div class="reply-text">${it.t}</div>
      <div class="reply-meta">${meta}</div>
      <button class="copy-btn">复制</button>`;
    el.querySelector('.copy-btn').addEventListener('click', () => copyText(it.t));
    list.appendChild(el);
  });
  card.hidden = false;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- 主流程 ---------- */
async function run() {
  const msg = $('#msg').value.trim();
  if (!msg) { toast('先粘一句话进来吧'); return; }

  const scen = detectScenarios(msg);
  const dlg = detectDialect(msg);
  const xy = detectXieyin(msg);
  const detectEl = $('#detectCard'), detectRes = $('#detectResult');

  // 识别标签：谐音梗 > 方言 > 场景，可叠加
  const tags = [];
  if (xy) tags.push(`<span class="detect-tag xy-tag">${xy.tag}</span>`);
  if (dlg) tags.push(`<span class="detect-tag sh-tag">${dlg.label}</span>`);
  if (scen.length) {
    scen.slice(0, 3).forEach(s => {
      const info = SCENARIOS.find(x => x.id === s.id);
      tags.push(`<span class="detect-tag">${info ? info.emoji + ' ' + info.name : s.id}</span>`);
    });
  }
  if (tags.length) {
    detectRes.innerHTML = tags.join('');
    detectEl.hidden = false;
  } else {
    detectEl.hidden = true;
  }
  const scenarioId = scen.length ? scen[0].id : null;
  const scenarioLabel = tags.map(t => t.replace(/<[^>]+>/g, '')).join(' · ');

  let items = [];
  if (xy) {
    // 谐音梗：直接接梗（AI 不认识最新梗，模板接得更准）
    items = shuffle(xy.r).slice(0, 3).map(r => ({ t: r.t, p: r.p }));
  } else if (dlg) {
    // 上海话：优先上海话专属回复池；若场景命中 sh_*，则出对应上海话场景的回复
    const shScen = scen.find(s => s.id.startsWith('sh_'));
    items = shScen ? generate(msg, state.persona, shScen.id) : generate(msg, state.persona, null, SH_REPLIES);
  } else if (aiReady) {
    const aiBtn = $('#toggleAiBtn');
    const old = aiBtn.textContent;
    aiBtn.textContent = '🧠 AI 正在思考…';
    try {
      const aiList = await aiGenerate(msg, state.persona, scenarioId);
      if (aiList && aiList.length) items = aiList.map(t => ({ t, p: state.persona === 'all' ? 'wenrou' : state.persona }));
    } catch (e) { console.warn('AI失败', e); }
    aiBtn.textContent = old;
  }
  if (!items.length) {
    items = generate(msg, state.persona, scenarioId);
  }

  lastGen = { msg, persona: state.persona, dlg: !!dlg, xy: !!xy };
  renderResults(items, scenarioLabel);
  pushHist(msg, items.map(i => i.t));
}

/* ---------- AI 调用（server.js 本地模型，自动回退模板） ---------- */
async function serverAiGenerate(message, persona, scenario) {
  const resp = await fetch('/api/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, persona: persona === 'all' ? 'wenrou' : persona, scenario: scenario || '', count: 3 }),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (!data || !Array.isArray(data.replies) || !data.replies.length) throw new Error('empty');
  return data.replies;
}
async function aiGenerate(message, persona, scenario) {
  try {
    return await serverAiGenerate(message, persona, scenario);
  } catch (e) {
    console.warn('本地AI调用失败，使用模板结果', e);
    return [];
  }
}

/* ---------- AI 开关 ---------- */
async function toggleAI() {
  const btn = $('#toggleAiBtn');
  if (aiReady) {
    aiReady = false; btn.textContent = '⚙️ 本地AI引擎（当前关闭）';
    $('#aiStatus').hidden = true; toast('已关闭本地AI（用内置话术库）');
    return;
  }
  checkAI().then(() => toast(aiReady ? '本地AI引擎已开启' : '未检测到AI服务，已用内置话术库'));
}

/* ---------- 离线探测：检查 AI 服务是否真的可用 ---------- */
async function checkAI() {
  const btn = $('#toggleAiBtn');
  const note = $('.note2');
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const resp = await fetch('/api/health', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error('health ' + resp.status);
    const data = await resp.json();
    if (!data || !data.ok) throw new Error('not ready');
    aiReady = true;
    btn.textContent = '⚙️ 本地AI引擎（当前开启）';
    if (note) note.textContent = '✅ 本地 AI 引擎已开启（免 key、隐私本地）——能真正理解你说的内容再回话';
    console.log('[AI] 本地AI服务在线，使用AI生成');
  } catch (e) {
    aiReady = false;
    btn.textContent = '⚙️ 本地AI引擎（未运行，已用内置话术库）';
    if (note) note.textContent = '💡 当前为纯离线模式：内置 500+ 条高情商话术，断网也能用';
    console.log('[AI] 未检测到AI服务，使用内置话术库', e && e.message);
  }
}

/* ---------- 开场白 ---------- */
const OPENERS = [
  '嗨，我是今天路过你生活的一阵风，想问问你最近好不好。',
  '终于等到你出现，我还以为缘分迷路了。',
  '我掐指一算，你最近会走桃花运——因为我来了。',
  '你好呀，我叫XX，请问我该叫你什么？',
  '今天天气这么好，想不想跟一个有趣的人聊聊天？',
  '我是来打招呼的，顺便看看你会不会回复。',
  '你是我今天加的第一个人，也是最后一个。',
];
function renderOpeners() {
  const list = $('#openerList');
  list.innerHTML = OPENERS.map(t =>
    `<div class="opener-item"><span>${t}</span><span class="ocopy">复制</span></div>`
  ).join('');
  list.querySelectorAll('.opener-item').forEach(el => {
    el.addEventListener('click', () => {
      const t = el.querySelector('span').textContent;
      copyText(t);
    });
  });
}

/* ---------- 视图切换 ---------- */
function switchView(v) {
  state.view = v;
  document.querySelectorAll('.tab-item').forEach(el => el.classList.toggle('active', el.dataset.v === v));
  ['genView', 'libView', 'favView', 'histView'].forEach(id => {
    document.getElementById(id).hidden = (id.replace('View', '') !== v);
  });
  if (v === 'lib') renderLibraryList();
  if (v === 'fav') renderFavView();
  if (v === 'hist') renderHistView();
}

/* ---------- 话术库 ---------- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function renderLibChips() {
  const scEl = $('#libSceneChips');
  scEl.innerHTML = `<button class="chip ${state.libScene==='all'?'on':''}" data-sc="all">全部场景</button>` +
    `<button class="chip ${state.libScene==='__sh__'?'on':''}" data-sc="__sh__">🗣️ 上海话</button>` +
    `<button class="chip ${state.libScene==='__xy__'?'on':''}" data-sc="__xy__">🎯 谐音梗</button>` +
    SCENARIOS.filter(s => !s.id.startsWith('sh_')).map(s => `<button class="chip ${state.libScene===s.id?'on':''}" data-sc="${s.id}">${s.emoji} ${s.name}</button>`).join('');
  scEl.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => { state.libScene = el.dataset.sc; renderLibChips(); renderLibraryList(); });
  });
  const psEl = $('#libPersonaChips');
  psEl.innerHTML = `<button class="chip ${state.libPersona==='all'?'on':''}" data-ps="all">全部人设</button>` +
    PERSONAS.map(p => `<button class="chip ${state.libPersona===p.id?'on':''}" data-ps="${p.id}">${p.emoji} ${p.name}</button>`).join('');
  psEl.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => { state.libPersona = el.dataset.ps; renderLibChips(); renderLibraryList(); });
  });
}
function replyItemHTML(r) {
  const scn = SCENARIOS.find(s => s.id === r.s);
  const per = PERSONAS.find(p => p.id === r.p);
  const star = isFav(r.t) ? '★' : '☆';
  const scnTxt = scn ? scn.emoji + ' ' + scn.name : (r.s === '__xy__' ? '🎯 谐音梗' : '');
  return `<div class="reply-item lib-item">
    <div class="reply-text">${esc(r.t)}</div>
    <div class="reply-meta">${scnTxt}${per ? ' · ' + per.emoji + ' ' + per.name : ''}</div>
    <div class="lib-actions">
      <button class="copy-btn">复制</button>
      <button class="fav-btn ${isFav(r.t) ? 'on' : ''}" data-t="${esc(r.t)}">${star}</button>
    </div>
  </div>`;
}
function renderLibraryList() {
  const kw = $('#libSearch').value.trim().toLowerCase();
  let list = REPLIES;
  if (state.libScene === '__sh__') {
    list = list.filter(r => r.s && r.s.startsWith('sh_'));
  } else if (state.libScene === '__xy__') {
    const rows = [];
    XIEYIN_ITEMS.forEach(it => it.r.forEach(r => rows.push({ t: r.t, s: '__xy__', p: r.p })));
    list = rows;
  } else if (state.libScene !== 'all') {
    list = list.filter(r => r.s === state.libScene);
  }
  if (state.libPersona !== 'all') list = list.filter(r => r.p === state.libPersona);
  if (kw) list = list.filter(r => r.t.toLowerCase().includes(kw));
  $('#libCount').textContent = list.length;
  const el = $('#libList');
  if (!list.length) {
    el.innerHTML = '<div class="empty">没有匹配的话术，换个关键词试试 🔍</div>';
    return;
  }
  el.innerHTML = list.map(replyItemHTML).join('');
  bindLibEvents(el);
}
function bindLibEvents(el) {
  el.querySelectorAll('.copy-btn').forEach(b => {
    b.addEventListener('click', e => copyText(e.target.closest('.reply-item').querySelector('.reply-text').textContent));
  });
  el.querySelectorAll('.fav-btn').forEach(b => {
    b.addEventListener('click', e => toggleFav(e.target.dataset.t));
  });
}

/* ---------- 收藏视图 ---------- */
function renderFavView() {
  const el = $('#favList');
  if (!favs.length) {
    el.innerHTML = '<div class="empty">还没有收藏的话术\n去「📚 话术库」里点 ⭐ 收藏吧</div>';
    return;
  }
  const items = favs.map(t => REPLIES.find(r => r.t === t)).filter(Boolean);
  el.innerHTML = items.map(replyItemHTML).join('');
  bindLibEvents(el);
}

/* ---------- 历史视图 ---------- */
function renderHistView() {
  const el = $('#histList');
  if (!hist.length) {
    el.innerHTML = '<div class="empty">还没有生成记录\n生成过的回复会出现在这里</div>';
    return;
  }
  el.innerHTML = hist.map(h => `
    <div class="hist-item">
      <div class="hist-msg">💬 ${esc(h.msg)}</div>
      ${h.items.map(t => `<div class="hist-reply" data-t="${esc(t)}">${esc(t)} <span class="hcopy">复制</span></div>`).join('')}
      <div class="hist-time">${fmtTime(h.time)}</div>
    </div>`).join('');
  el.querySelectorAll('.hist-reply').forEach(el2 => {
    el2.addEventListener('click', () => copyText(el2.dataset.t));
  });
}

/* ---------- 语音输入（有网时可用） ---------- */
function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#voiceBtn');
  if (!SR) return;
  btn.hidden = false;
  let rec = null, listening = false;
  btn.addEventListener('click', () => {
    if (listening) { try { rec.stop(); } catch {} return; }
    try {
      rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = e => {
        const t = e.results[0][0].transcript;
        $('#msg').value = t;
        toast('已识别 ✓');
        run();
      };
      rec.onend = () => { listening = false; btn.classList.remove('on'); };
      rec.onerror = () => { listening = false; btn.classList.remove('on'); toast('语音识别失败（需联网）'); };
      rec.start();
      listening = true;
      btn.classList.add('on');
      toast('🎤 请说话…');
    } catch (e) { toast('语音识别不可用'); }
  });
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  $('#genBtn').addEventListener('click', run);
  $('#againBtn').addEventListener('click', () => {
    if (!lastGen) return;
    const msg = lastGen.msg;
    if (lastGen.xy) {
      const xy = detectXieyin(msg);
      const items = shuffle(xy.r).slice(0, 3).map(r => ({ t: r.t, p: r.p }));
      renderResults(items, xy.tag);
    } else if (lastGen.dlg) {
      const scen2 = detectScenarios(msg);
      const shScen = scen2.find(s => s.id.startsWith('sh_'));
      const items = shScen ? generate(msg, lastGen.persona, shScen.id) : generate(msg, lastGen.persona, null, SH_REPLIES);
      renderResults(items, '🗣️ 上海话');
    } else {
      const scen = detectScenarios(msg);
      const items = generate(msg, lastGen.persona, scen.length ? scen[0].id : null);
      renderResults(items, scen.length ? (SCENARIOS.find(x => x.id === scen[0].id) || {}).name : '');
    }
    toast('已换一批 🔄');
  });
  $('#clearBtn').addEventListener('click', () => {
    $('#msg').value = '';
    $('#resultCard').hidden = true;
    $('#detectCard').hidden = true;
    toast('已清空');
  });
  $('#libSearch').addEventListener('input', renderLibraryList);
  document.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.v));
  });
  document.querySelectorAll('.chip[data-demo]').forEach(ch => {
    ch.addEventListener('click', () => {
      const demo = ch.dataset.demo;
      $('#msg').value = {
        1: '今天加班到九点，累死了，感觉整个人被掏空……',
        2: '我喜欢你很久了，能做我女朋友吗？',
        3: '你总是这样，算了，随便你吧。',
        4: '侬今朝夜到有空伐？阿拉一道出去白相好伐？',
        5: '今天考试又挂了，真的栓Q，感觉要芭比Q了……',
        6: '弄了组撒？弄了窝里啊，晓得了晓得了',
      }[demo];
      run();
    });
  });
  $('#toggleAiBtn').addEventListener('click', toggleAI);
}

/* ---------- 启动 ---------- */
renderPersonas();
renderOpeners();
renderLibChips();
bindEvents();
initVoice();
checkAI();
