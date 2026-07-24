import type { Project, ExportOptions } from '../../shared/types'
import { DEFAULT_EXPORT_OPTIONS } from '../../shared/types'
import { buildRuntimeCoreJS } from '../../shared/runtimeCore'

/**
 * 导出 HTML5 单文件。
 * 策略：序列化 Project + 内联一个自包含的 AVG 播放器（DOM/CSS 渲染，零外部依赖）。
 * 保证离线双击可开、单文件 < 5MB。
 * 支持：开始界面外观自定义 / 常用游戏内设置 / 多存档槽。
 */
export function exportHtml(project: Project, options?: ExportOptions): string {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...(options || {}) }
  const data = JSON.stringify(project)
  const cfg = JSON.stringify(opts)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(project.title || 'StoryForge 作品')}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:100%; height:100%; background:#000; overflow:hidden; font-family:"Microsoft YaHei",system-ui,sans-serif; }
  #stage { position:relative; width:100vw; height:100vh; overflow:hidden; cursor:pointer; }
  #bg { position:absolute; inset:0; background-size:cover; background-position:center; transition:opacity .5s ease; }
  #weather { position:absolute; inset:0; pointer-events:none; z-index:2; }
  .portrait { position:absolute; bottom:0; height:82%; transition:all .4s ease; z-index:3; filter:drop-shadow(0 8px 24px rgba(0,0,0,.5)); }
  .portrait.left { left:6%; } .portrait.center { left:50%; transform:translateX(-50%); } .portrait.right { right:6%; }
  #ph-fallback { position:absolute; bottom:0; width:280px; height:70%; border-radius:20px 20px 0 0; z-index:3; }
  #botfade { position:absolute; left:0; right:0; bottom:0; height:38%; z-index:4; pointer-events:none;
    background:linear-gradient(to top, rgba(6,7,12,.72) 0%, rgba(6,7,12,.28) 55%, transparent 100%); }
  #dialogBox { position:absolute; left:5%; right:5%; bottom:4.5%; min-height:150px;
    background:linear-gradient(180deg, rgba(16,18,30,.72) 0%, rgba(10,12,20,.88) 100%);
    border:1px solid rgba(124,92,255,.42); border-radius:16px; padding:24px 30px 20px; z-index:5;
    backdrop-filter:blur(14px) saturate(1.25); box-shadow:0 10px 36px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.07); }
  #dialogBox.nobg { background:transparent; border-color:transparent; backdrop-filter:none; box-shadow:none; }
  #speaker { position:absolute; top:-16px; left:24px; padding:4px 16px; border-radius:10px; color:#fff;
    font-size:17px; font-weight:700; text-shadow:0 1px 3px rgba(0,0,0,.6); display:none;
    background:linear-gradient(135deg, rgba(92,200,255,.9), rgba(92,200,255,.6));
    border:1px solid rgba(255,255,255,.22); box-shadow:0 4px 14px rgba(0,0,0,.45); backdrop-filter:blur(6px); }
  #text { color:#f0f0f4; font-size:19px; line-height:1.8; text-shadow:0 2px 6px rgba(0,0,0,.7); white-space:pre-wrap; }
  #choices { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; gap:16px; z-index:6; background:rgba(0,0,0,.35); }
  .choice-btn { min-width:340px; padding:16px 28px; background:rgba(30,31,38,.9); border:1px solid rgba(124,92,255,.5);
    color:#e6e6ea; font-size:18px; border-radius:12px; cursor:pointer; transition:all .2s; text-align:center; }
  .choice-btn:hover { background:rgba(124,92,255,.35); transform:scale(1.03); }
  .choice-empty { color:rgba(255,255,255,.5); font-size:15px; padding:14px; }
  #hint { position:absolute; right:24px; bottom:18px; color:rgba(255,255,255,.5); font-size:13px; z-index:5; animation:blink 1.4s infinite; }
  @keyframes blink { 50% { opacity:.2; } }
  #endcard { position:absolute; inset:0; display:none; align-items:center; justify-content:center; flex-direction:column; gap:20px; z-index:9; background:#000; color:#fff; }
  #endcard button { padding:12px 32px; background:#7c5cff; border:none; color:#fff; border-radius:10px; font-size:16px; cursor:pointer; }
  .fall { position:absolute; top:-10%; z-index:2; opacity:.85; animation:fall linear infinite; }
  @keyframes fall { to { transform:translateY(120vh) rotate(360deg); } }

  /* ---- 游戏外壳：开始界面 / 菜单 / 设置 ---- */
  .overlay { position:fixed; inset:0; z-index:20; display:flex; align-items:center; justify-content:center; }
  #startScreen { background:linear-gradient(135deg,#1a1130,#0d1a30 60%,#2a1a40); }
  #startBg { position:absolute; inset:0; background-size:cover; background-position:center; }
  #startInner { position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; gap:18px; padding:24px; text-align:center; }
  #startScreen.layout-bottom { align-items:flex-end; padding-bottom:8vh; }
  /* RenPy 式 left 布局：左侧竖排菜单 + 右下标题（复用原 DOM，绝对定位重排） */
  #startScreen.layout-left #startInner { position:static; width:100%; height:100%; padding:0; }
  #startScreen.layout-left #startMenu { position:absolute; left:0; top:0; bottom:0; width:280px; z-index:3;
    display:flex; flex-direction:column; justify-content:center; gap:4px; margin:0; padding:0 32px 0 40px;
    background:linear-gradient(90deg, rgba(8,9,16,.85) 0%, rgba(8,9,16,.6) 70%, transparent 100%); }
  #startScreen.layout-left .start-btn { min-width:0; background:transparent; border:none; text-align:left; padding:10px 12px; color:rgba(255,255,255,.75);
    text-shadow:0 1px 4px rgba(0,0,0,.8); border-radius:8px; }
  #startScreen.layout-left .start-btn:hover { color:#fff; padding-left:22px; background:rgba(255,255,255,.06); transform:none; }
  #startScreen.layout-left #startTitle { position:absolute; right:40px; bottom:92px; z-index:3; text-align:right; }
  #startScreen.layout-left #startSub { position:absolute; right:40px; bottom:56px; z-index:3; text-align:right; }
  /* 顶部功能按钮组 */
  #topBtns { position:fixed; left:16px; top:14px; z-index:15; display:none; gap:6px; }
  .top-btn { width:38px; height:38px; border-radius:8px; background:rgba(0,0,0,.35); color:rgba(255,255,255,.75);
    border:none; font-size:17px; cursor:pointer; backdrop-filter:blur(4px); }
  .top-btn:hover { background:rgba(0,0,0,.55); color:#fff; }
  .top-btn.active { background:rgba(124,92,255,.7); color:#fff; }
  /* 历史记录面板 */
  #histCard { width:min(680px,90vw); height:80vh; }
  #histList { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px; }
  .hist-item { padding:8px 12px; border-radius:10px; background:rgba(255,255,255,.05); }
  .hist-item .who { font-size:12px; font-weight:700; color:#9d8bff; margin-bottom:2px; }
  .hist-item .say { font-size:14px; color:#e6e6ea; line-height:1.7; white-space:pre-wrap; }
  #startTitle { font-size:46px; font-weight:800; color:#fff; text-shadow:0 2px 16px rgba(0,0,0,.7); }
  #startSub { font-size:16px; color:rgba(255,255,255,.82); }
  #startMenu { display:flex; flex-direction:column; gap:12px; margin-top:8px; }
  .start-btn { min-width:260px; padding:14px 24px; border-radius:12px; font-size:17px; color:#eef; cursor:pointer;
    background:rgba(30,31,46,.8); border:1px solid rgba(124,92,255,.55); transition:all .2s; }
  .start-btn:hover { background:rgba(124,92,255,.3); transform:scale(1.04); }
  #menuBtn { position:fixed; left:16px; top:14px; z-index:15; width:38px; height:38px; border-radius:8px;
    background:rgba(0,0,0,.35); color:rgba(255,255,255,.75); border:none; font-size:22px; cursor:pointer; display:none; }
  #menuBtn:hover { background:rgba(0,0,0,.55); color:#fff; }
  #autoBadge { position:fixed; right:16px; top:14px; z-index:15; padding:6px 12px; border-radius:8px; display:none;
    background:rgba(124,92,255,.85); color:#fff; font-size:13px; cursor:pointer; }
  .panel-card { width:340px; max-height:86vh; overflow-y:auto; background:rgba(22,23,32,.97); border:1px solid rgba(124,92,255,.4); border-radius:16px;
    padding:24px; display:flex; flex-direction:column; gap:16px; color:#fff; }
  .panel-title { text-align:center; font-weight:700; font-size:18px; }
  .panel-sub { text-align:center; color:rgba(255,255,255,.6); font-size:13px; }
  .menu-item { padding:12px; border-radius:10px; background:rgba(255,255,255,.06); border:none; color:#e6e6ea; font-size:15px; cursor:pointer; transition:all .2s; }
  .menu-item:hover { background:rgba(124,92,255,.28); }
  .slider-row { display:flex; flex-direction:column; gap:6px; }
  .slider-row .lab { display:flex; justify-content:space-between; font-size:14px; color:#e6e6ea; }
  .slider-row input[type=range] { width:100%; accent-color:#7c5cff; }
  .toggle-row { display:flex; justify-content:space-between; align-items:center; font-size:14px; }
  .switch { width:44px; height:24px; border-radius:999px; background:#444; position:relative; cursor:pointer; border:none; transition:.2s; flex:none; }
  .switch.on { background:#7c5cff; }
  .switch i { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:#fff; transition:.2s; }
  .switch.on i { left:22px; }
  .panel-actions { display:flex; gap:10px; margin-top:4px; }
  .panel-actions button { flex:1; padding:10px; border-radius:10px; border:none; cursor:pointer; font-size:14px; }
  .btn-ghost { background:rgba(255,255,255,.1); color:#e6e6ea; }
  .btn-primary { background:#7c5cff; color:#fff; }
  /* 存档槽 */
  .slot { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,.05); border:1px solid rgba(124,92,255,.25); border-radius:10px; padding:10px; }
  .slot .info { flex:1; min-width:0; }
  .slot .name { font-size:14px; }
  .slot .meta { font-size:11px; color:rgba(255,255,255,.55); }
  .slot .acts { display:flex; gap:6px; }
  .slot .acts button { padding:6px 10px; border-radius:8px; border:none; cursor:pointer; font-size:12px; }
</style>
</head>
<body>
<div id="stage">
  <div id="bg"></div>
  <div id="weather"></div>
  <div id="botfade"></div>
  <div id="dialogBox">
    <div id="speaker"></div>
    <div id="text"></div>
  </div>
  <div id="choices"></div>
  <div id="hint">点击继续 ▶</div>
  <div id="endcard"><div style="font-size:28px">— 完 —</div><button onclick="location.reload()">重新开始</button></div>
</div>
<div id="topBtns">
  <button class="top-btn" id="menuBtn" title="菜单">≡</button>
  <button class="top-btn" id="histBtn" title="历史记录">📜</button>
  <button class="top-btn" id="skipBtn" title="快进">⏩</button>
  <button class="top-btn" id="fsBtn" title="全屏">⛶</button>
</div>
<button id="autoBadge">AUTO ⏸</button>

<!-- 历史记录 -->
<div id="historyPanel" class="overlay" style="display:none; background:rgba(0,0,0,.75)">
  <div class="panel-card" id="histCard">
    <div class="panel-title">历史记录</div>
    <div id="histList"></div>
    <div class="panel-actions"><button class="btn-ghost" id="histBack">返回</button></div>
  </div>
</div>

<!-- 开始界面 -->
<div id="startScreen" class="overlay">
  <div id="startBg"></div>
  <div id="startInner">
    <div id="startTitle"></div>
    <div id="startSub"></div>
    <div id="startMenu"></div>
  </div>
</div>

<!-- 游戏内菜单 -->
<div id="inGameMenu" class="overlay" style="display:none; background:rgba(0,0,0,.6)">
  <div class="panel-card">
    <div class="panel-title">菜单</div>
    <button class="menu-item" id="igResume">继续游戏</button>
    <button class="menu-item" id="igSave">存档 / 读档</button>
    <button class="menu-item" id="igSettings">设置</button>
    <button class="menu-item" id="igCredits">制作名单</button>
    <button class="menu-item" id="igRestart" style="background:rgba(255,80,80,.18)">返回开始界面</button>
  </div>
</div>

<!-- 存档 / 读档 -->
<div id="savePanel" class="overlay" style="display:none; background:rgba(0,0,0,.7)">
  <div class="panel-card">
    <div class="panel-title">存档 / 读档</div>
    <div class="panel-sub">当前进度可存入任意槽位，随时读取</div>
    <div id="slotList" style="display:flex; flex-direction:column; gap:8px;"></div>
    <div class="panel-actions"><button class="btn-ghost" id="saveBack">返回</button></div>
  </div>
</div>

<!-- 设置 -->
<div id="settingsPanel" class="overlay" style="display:none; background:rgba(0,0,0,.7)">
  <div class="panel-card">
    <div class="panel-title">设置</div>
    <div class="slider-row"><div class="lab"><span>文字速度</span><span id="setSpeedVal"></span></div>
      <input type="range" id="setSpeed" min="1" max="10" /></div>
    <div class="slider-row"><div class="lab"><span>BGM 音量</span><span id="setBgmVal"></span></div>
      <input type="range" id="setBgm" min="0" max="100" /></div>
    <div class="slider-row"><div class="lab"><span>音效音量</span><span id="setSfxVal"></span></div>
      <input type="range" id="setSfx" min="0" max="100" /></div>
    <div class="slider-row"><div class="lab"><span>语音音量</span><span id="setVoiceVal"></span></div>
      <input type="range" id="setVoice" min="0" max="100" /></div>
    <div class="slider-row"><div class="lab"><span>自动阅读间隔</span><span id="setAutoVal"></span></div>
      <input type="range" id="setAutoSpeed" min="500" max="4000" step="100" /></div>
    <div class="toggle-row"><span>BGM 自动循环</span><button class="switch" id="setLoop"><i></i></button></div>
    <div class="toggle-row"><span>自动阅读</span><button class="switch" id="setAuto"><i></i></button></div>
    <div class="toggle-row"><span>显示立绘</span><button class="switch" id="setPortraits"><i></i></button></div>
    <div class="toggle-row"><span>字幕底纹</span><button class="switch" id="setSubBg"><i></i></button></div>
    <div class="panel-actions">
      <button class="btn-ghost" id="setBack">返回</button>
      <button class="btn-primary" id="setSave">保存为默认</button>
    </div>
  </div>
</div>

<!-- 制作名单 -->
<div id="creditsPanel" class="overlay" style="display:none; background:rgba(0,0,0,.8)">
  <div class="panel-card" style="align-items:center; text-align:center">
    <div id="creditsTitle" style="font-size:24px; font-weight:800"></div>
    <div class="panel-sub">制作名单</div>
    <div id="creditsBody" style="font-size:14px; line-height:1.9; color:#e6e6ea"></div>
    <button class="menu-item" id="creditsBack">返回</button>
  </div>
</div>

<script>
const PROJECT = ${data};
const EXPORT_OPTS = ${cfg};
${buildRuntimeCoreJS()}
${RUNTIME_JS}
</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

// 内联到导出 HTML 中的独立播放器逻辑（与编辑器渲染语义一致）
const RUNTIME_JS = `
(function(){
  var cards = [];
  (PROJECT.scenes||[]).forEach(function(sc){ (sc||[]).forEach(function(c){ cards.push(c); }); });
  var byId = {}; cards.forEach(function(c){ byId[c.id] = c; });
  var chars = {}; (PROJECT.characters||[]).forEach(function(c){ chars[c.name] = c; chars[c.id] = c; });
  var bgs = {}; (PROJECT.backgrounds||[]).forEach(function(b){ bgs[b.id] = b; });
  var clips = {}; (PROJECT.videos||[]).forEach(function(v){ clips[v.id] = v; });
  var vars = {}; (PROJECT.variables||[]).forEach(function(v){ vars[v.id] = v.initial; });

  // 游戏外壳配置（向后兼容：旧工程可能无 shell）
  var def = { enabled:true, start:{ title:PROJECT.title, subtitle:'一款由 StoryForge 创作的视觉小说', backgroundId:null, showContinue:true, appearance:{},
      menu:[{id:'m_start',label:'开始游戏',action:'start'},{id:'m_continue',label:'继续游戏',action:'continue'},
            {id:'m_settings',label:'设置',action:'settings'},{id:'m_credits',label:'制作名单',action:'credits'}] },
    settings:{ textSpeed:6, bgmVolume:70, sfxVolume:80, autoBgm:true } };
  var shell = PROJECT.shell || def;
  if(!shell.start.appearance) shell.start.appearance = {};
  var OPTS = EXPORT_OPTS || { includeShell:true, saveSlots:3, showBranding:true };
  var SLOT_COUNT = Math.max(0, OPTS.saveSlots|0);
  // 导出时若关闭外壳，则忽略工程里的 enabled
  var shellEnabled = OPTS.includeShell !== false && shell.enabled;

  var idx = 0;
  var started = false;
  var typing = false;
  var typeTimer = null;
  var autoTimer = null;
  var skipTimer = null;
  var skipMode = false;
  var hist = [];
  var lastBgmSrc = ''; var lastSfxSrc = '';

  var el = { bg:g('bg'), weather:g('weather'), sp:g('speaker'), tx:g('text'),
    box:g('dialogBox'), ch:g('choices'), hint:g('hint'), end:g('endcard') };
  function g(id){ return document.getElementById(id); }

  // 设置（玩家本地的偏好优先，其次用工程默认值）
  var SKEY = 'sf_set_' + (PROJECT.id||'game');
  var CKEY = 'sf_con_' + (PROJECT.id||'game');
  var SLOTKEY = function(n){ return 'sf_slot_' + (PROJECT.id||'game') + '_' + n; };
  function readSettings(){
    try { var s = localStorage.getItem(SKEY); if(s) return JSON.parse(s); } catch(e){}
    return null;
  }
  var d = shell.settings;
  var defaults = {
    textSpeed: d.textSpeed, bgmVolume: d.bgmVolume, sfxVolume: d.sfxVolume, autoBgm: d.autoBgm,
    voiceVolume: d.voiceVolume!==undefined ? d.voiceVolume : 80,
    autoPlay: d.autoPlay!==undefined ? d.autoPlay : false,
    autoSpeed: d.autoSpeed!==undefined ? d.autoSpeed : 1500,
    showPortraits: d.showPortraits!==undefined ? d.showPortraits : true,
    subtitleBg: d.subtitleBg!==undefined ? d.subtitleBg : true
  };
  var stored = readSettings();
  var settings = {};
  for(var k in defaults) settings[k] = (stored && stored[k]!==undefined) ? stored[k] : defaults[k];
  function saveSettings(){ try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch(e){} }
  function saveContinue(){ try { localStorage.setItem(CKEY, String(idx)); } catch(e){} }
  function readContinue(){ try { var v = localStorage.getItem(CKEY); if(v!==null) return parseInt(v,10); } catch(e){} return 0; }
  function hasContinue(){ try { return localStorage.getItem(CKEY)!==null; } catch(e){} return false; }

  // 三音轨：BGM / 音效 / 语音
  var bgmAudio = new Audio(); var sfxAudio = new Audio(); var voiceAudio = new Audio();
  function playVoice(card){
    if(!card || !card.voice){ voiceAudio.pause(); return; }
    var src = card.voice;
    if(src.indexOf('data:')!==0 && !/^https?:/.test(src)){
      var t = (PROJECT.audioTracks||[]).filter(function(a){ return a.id===src; })[0];
      if(!t || !t.src){ voiceAudio.pause(); return; }
      src = t.src;
    }
    voiceAudio.volume = ((settings.voiceVolume!==undefined?settings.voiceVolume:80)/100)||0;
    voiceAudio.loop = false;
    voiceAudio.src = src;
    voiceAudio.play().catch(function(){});
  }
  function playAudio(trackId){
    var a = (PROJECT.audioTracks||[]).filter(function(t){ return t.id===trackId; })[0];
    if(a && a.src){
      var isBgm = (a.type==='bgm');
      var node = isBgm ? bgmAudio : sfxAudio;
      var last = isBgm ? lastBgmSrc : lastSfxSrc;
      node.volume = ((isBgm ? settings.bgmVolume : settings.sfxVolume)/100) || 0;
      node.loop = isBgm ? settings.autoBgm : false;
      if(last !== a.src){ if(isBgm) lastBgmSrc=a.src; else lastSfxSrc=a.src; node.src = a.src; }
      node.play().catch(function(){});
    } else { bgmAudio.pause(); sfxAudio.pause(); }
  }

  function setBg(bgId){
    var b = bgs[bgId]; if(!b){ return; }
    el.bg.style.opacity = 0;
    setTimeout(function(){
      el.bg.style.backgroundImage = b.image ? 'url('+b.image+')' : 'linear-gradient(135deg,#2a2140,#1a2740)';
      el.bg.style.opacity = 1;
      setWeather(b.weather);
    }, 250);
  }
  function setWeather(w){
    el.weather.innerHTML='';
    if(!w||w==='none') return;
    var glyph = w==='sakura'?'🌸':w==='snow'?'❄️':w==='rain'?'|':w==='star'?'✦':'';
    var n = w==='rain'?40:24;
    for(var i=0;i<n;i++){
      var dv=document.createElement('div'); dv.className='fall'; dv.textContent=glyph;
      dv.style.left=(Math.random()*100)+'%';
      dv.style.fontSize=(w==='rain'?18:(10+Math.random()*16))+'px';
      dv.style.color = w==='rain'?'rgba(160,200,255,.6)':(w==='star'?'#ffe9a8':'#fff');
      dv.style.animationDuration=(3+Math.random()*4)+'s';
      dv.style.animationDelay=(-Math.random()*6)+'s';
      el.weather.appendChild(dv);
    }
  }
  function clearPortraits(){ document.querySelectorAll('.portrait,#ph-fallback').forEach(function(p){p.remove();}); }
  function showVideo(card){
    var clip = clips[card.video];
    var stage = g('stage');
    var v = g('cgvideo');
    if(!clip){ if(v) v.remove(); return; }
    if(!v){ v=document.createElement('video'); v.id='cgvideo'; v.style.position='absolute'; v.style.left='0'; v.style.top='0';
      v.style.width='100%'; v.style.height='100%'; v.style.objectFit='cover'; v.style.zIndex='1'; stage.insertBefore(v, stage.firstChild); }
    v.src = clip.src; v.loop = (clip.loop!==false); v.muted=true; v.playsInline=true;
    v.play().catch(function(){});
  }
  function hideVideo(){ var v=g('cgvideo'); if(v) v.remove(); }
  function showPortrait(card){
    if(!settings.showPortraits) return;
    var pos = card.position||'center';
    // 单页专属立绘优先
    if(card.portraitOverride){
      var oi=document.createElement('img'); oi.className='portrait '+pos; oi.src=card.portraitOverride; el.box.parentNode.insertBefore(oi, el.box);
      return;
    }
    if(!card.speaker) return;
    var ch = chars[card.speaker];
    var src = ch && ch.portraits ? (ch.portraits[card.expression]||ch.portraits['normal']||Object.values(ch.portraits)[0]) : null;
    if(src){
      var img=document.createElement('img'); img.className='portrait '+pos; img.src=src; el.box.parentNode.insertBefore(img, el.box);
    } else {
      var dv=document.createElement('div'); dv.id='ph-fallback'; dv.className='portrait '+pos;
      dv.style.background = (ch&&ch.color)||'#7c5cff'; el.box.parentNode.insertBefore(dv, el.box);
    }
  }
  // 共享运行库核心封装：applyVarOpsCore / evalConditionCore / visibleChoicesCore
  // 由编辑器同一份源码（shared/runtimeCore.ts）注入，导出游戏与预览行为 100% 一致
  function applyVarOps(card){ applyVarOpsCore(vars, card.variableOps); }
  function visibleChoices(choices){ return visibleChoicesCore(choices, vars); }

  function applySubtitleBg(){ el.box.className = settings.subtitleBg ? '' : 'nobg'; }

  function clearAuto(){ if(autoTimer){ clearTimeout(autoTimer); autoTimer=null; } }
  function scheduleAuto(){
    clearAuto();
    if(!settings.autoPlay) return;
    var card = cards[idx];
    if(!card || card.type==='choice') return;
    autoTimer = setTimeout(function(){ next(); }, settings.autoSpeed||1500);
  }

  function typeText(full){
    if(typeTimer) clearInterval(typeTimer);
    if(skipMode || settings.textSpeed>=10 || !full){ el.tx.textContent=full; typing=false; el.hint.textContent='点击继续 ▶'; scheduleAuto(); return; }
    var delay = Math.max(8, (11-settings.textSpeed)*16);
    typing=true; el.tx.textContent=''; el.hint.textContent='点击跳过 ▶';
    var i=0;
    typeTimer=setInterval(function(){
      i++; el.tx.textContent=full.slice(0,i);
      if(i>=full.length){ clearInterval(typeTimer); typing=false; el.hint.textContent='点击继续 ▶'; scheduleAuto(); }
    }, delay);
  }

  function render(){
    clearAuto();
    if(idx>=cards.length){ el.end.style.display='flex'; hideVideo(); stopSkip(); return; }
    var card = cards[idx];
    if(card.type==='choice') stopSkip();
    // 视频 / 动态 CG：全屏播放，点击或空格继续
    if(card.type==='video'){
      applyVarOps(card); saveContinue();
      clearPortraits(); setWeather('none');
      el.box.style.display='none'; el.ch.style.display='none'; el.hint.style.display='block';
      showVideo(card);
      return;
    }
    hideVideo();
    applyVarOps(card);
    applySubtitleBg();
    if(card.background) setBg(card.background);
    playAudio(card.music);
    saveContinue();
    if(card.type==='dialogue' || card.text){
      clearPortraits(); showPortrait(card);
      el.box.style.display='block';
      // 说话人名牌（用角色颜色渐变）
      if(card.speaker){
        el.sp.textContent = card.speaker;
        el.sp.style.display = 'inline-block';
        var spc = (chars[card.speaker] && chars[card.speaker].color) || '#5cc8ff';
        el.sp.style.background = 'linear-gradient(135deg, '+spc+'e6, '+spc+'99)';
      } else { el.sp.style.display='none'; }
      playVoice(card);
      // 历史记录
      if(card.text){
        var lastH = hist[hist.length-1];
        if(!lastH || lastH.text!==card.text || lastH.speaker!==card.speaker){
          hist.push({ speaker:card.speaker, text:card.text });
          if(hist.length>200) hist.shift();
        }
      }
      typeText(card.text||'');
      el.ch.style.display='none'; el.hint.style.display='block';
    }
    if(card.type==='choice' && card.choices && card.choices.length){
      el.ch.innerHTML=''; el.ch.style.display='flex'; el.hint.style.display='none';
      var vc = visibleChoices(card.choices);
      if(!vc.length){
        var tip=document.createElement('div'); tip.className='choice-empty'; tip.textContent='（当前条件没有可用分支）';
        el.ch.appendChild(tip);
      } else {
        vc.forEach(function(opt){
          var b=document.createElement('button'); b.className='choice-btn'; b.textContent=opt.label;
          b.onclick=function(e){ e.stopPropagation(); goto(opt.goto); };
          el.ch.appendChild(b);
        });
      }
    }
  }
  function goto(id){
    if(id && byId[id]!==undefined){ idx = cards.indexOf(byId[id]); }
    else { idx++; }
    el.ch.style.display='none'; render();
  }
  function next(){
    if(!started) return;
    var card = cards[idx];
    if(card && card.type==='choice') return; // 等待选择
    if(typing){ // 点击先补全文字
      if(typeTimer) clearInterval(typeTimer);
      el.tx.textContent = card ? (card.text||'') : '';
      typing=false; el.hint.textContent='点击继续 ▶'; scheduleAuto();
      return;
    }
    clearAuto();
    if(card && card.goto && byId[card.goto]!==undefined){ idx = cards.indexOf(byId[card.goto]); }
    else { idx++; }
    render();
  }
  g('stage').addEventListener('click', next);
  document.addEventListener('keydown', function(e){ if(e.key===' '||e.key==='Enter') next(); });

  // ---------- 快进 / 历史 / 全屏 ----------
  function stopSkip(){
    skipMode=false;
    if(skipTimer){ clearInterval(skipTimer); skipTimer=null; }
    var b=g('skipBtn'); if(b) b.className='top-btn';
  }
  function startSkip(){
    if(skipMode) return;
    skipMode=true; g('skipBtn').className='top-btn active';
    skipTimer=setInterval(function(){
      if(!started || !skipMode){ stopSkip(); return; }
      var card=cards[idx];
      if(!card || card.type==='choice'){ stopSkip(); return; }
      if(typeTimer) clearInterval(typeTimer);
      typing=false;
      if(card.goto && byId[card.goto]!==undefined){ idx=cards.indexOf(byId[card.goto]); } else { idx++; }
      render();
    }, 140);
  }
  g('skipBtn').addEventListener('click', function(e){ e.stopPropagation(); if(skipMode) stopSkip(); else startSkip(); });
  g('histBtn').addEventListener('click', function(e){ e.stopPropagation(); renderHist(); show('historyPanel'); });
  g('histBack').addEventListener('click', function(){ hide('historyPanel'); });
  function renderHist(){
    var list=g('histList'); list.innerHTML='';
    if(hist.length===0){ list.innerHTML='<div class="panel-sub" style="margin-top:24px">暂无对话记录</div>'; return; }
    hist.forEach(function(h){
      var dv=document.createElement('div'); dv.className='hist-item';
      if(h.speaker){ var w=document.createElement('div'); w.className='who'; w.textContent=h.speaker; dv.appendChild(w); }
      var s=document.createElement('div'); s.className='say'; s.textContent=h.text; dv.appendChild(s);
      list.appendChild(dv);
    });
    list.scrollTop = list.scrollHeight;
  }
  g('fsBtn').addEventListener('click', function(e){
    e.stopPropagation();
    if(document.fullscreenElement){ document.exitFullscreen().catch(function(){}); }
    else { document.documentElement.requestFullscreen().catch(function(){}); }
  });
  document.addEventListener('fullscreenchange', function(){
    g('fsBtn').textContent = document.fullscreenElement ? '🗗' : '⛶';
  });

  // ---------- 开始界面 / 菜单 / 设置 ----------
  function show(id){ g(id).style.display='flex'; }
  function hide(id){ g(id).style.display='none'; }

  function applyAppearance(){
    var ap = shell.start.appearance || {};
    var t = g('startTitle');
    t.style.color = ap.titleColor || '#fff';
    t.style.fontSize = (ap.titleSize || 46) + 'px';
    g('startScreen').className = 'overlay' + (ap.layout==='bottom' ? ' layout-bottom' : ap.layout==='left' ? ' layout-left' : '');
    g('startBg').style.filter = ap.bgBlur ? 'blur(8px)' : 'none';
  }

  function openStart(){
    started=false; clearAuto(); stopSkip(); voiceAudio.pause(); show('startScreen'); hide('inGameMenu'); hide('settingsPanel'); hide('creditsPanel'); hide('savePanel'); hide('historyPanel');
    g('topBtns').style.display='none'; g('autoBadge').style.display='none';
    g('startTitle').textContent = shell.start.title || PROJECT.title;
    g('startSub').textContent = shell.start.subtitle || '';
    applyAppearance();
    var sBg = shell.start.backgroundId ? bgs[shell.start.backgroundId] : null;
    g('startBg').style.backgroundImage = (sBg && sBg.image) ? 'url('+sBg.image+')' : 'none';
    var menu = g('startMenu'); menu.innerHTML='';
    (shell.start.menu||[]).forEach(function(m){
      if(m.action==='continue' && (!shell.start.showContinue || !hasContinue())) return;
      var b=document.createElement('button'); b.className='start-btn'; b.textContent=m.label;
      b.onclick=function(){ handleAction(m.action); };
      menu.appendChild(b);
    });
  }
  function enterGame(at){
    started=true; hide('startScreen'); g('topBtns').style.display='flex';
    g('autoBadge').style.display = settings.autoPlay ? 'block' : 'none';
    idx = at||0; render();
  }
  function handleAction(action){
    if(action==='start'){ enterGame(0); }
    else if(action==='continue'){ enterGame(readContinue()||0); }
    else if(action==='settings'){ show('settingsPanel'); syncSettingsUI(); }
    else if(action==='credits'){ show('creditsPanel'); }
  }

  // 设置面板
  function syncSettingsUI(){
    g('setSpeed').value=settings.textSpeed; g('setSpeedVal').textContent=settings.textSpeed+' / 10';
    g('setBgm').value=settings.bgmVolume; g('setBgmVal').textContent=settings.bgmVolume+'%';
    g('setSfx').value=settings.sfxVolume; g('setSfxVal').textContent=settings.sfxVolume+'%';
    g('setVoice').value=settings.voiceVolume; g('setVoiceVal').textContent=settings.voiceVolume+'%';
    g('setAutoSpeed').value=settings.autoSpeed; g('setAutoVal').textContent=(settings.autoSpeed/1000).toFixed(1)+' s';
    g('setLoop').className = 'switch' + (settings.autoBgm?' on':'');
    g('setAuto').className = 'switch' + (settings.autoPlay?' on':'');
    g('setPortraits').className = 'switch' + (settings.showPortraits?' on':'');
    g('setSubBg').className = 'switch' + (settings.subtitleBg?' on':'');
  }
  g('setSpeed').addEventListener('input', function(){ settings.textSpeed=+this.value; g('setSpeedVal').textContent=this.value+' / 10'; });
  g('setBgm').addEventListener('input', function(){ settings.bgmVolume=+this.value; g('setBgmVal').textContent=this.value+'%'; bgmAudio.volume=this.value/100; });
  g('setSfx').addEventListener('input', function(){ settings.sfxVolume=+this.value; g('setSfxVal').textContent=this.value+'%'; sfxAudio.volume=this.value/100; });
  g('setVoice').addEventListener('input', function(){ settings.voiceVolume=+this.value; g('setVoiceVal').textContent=this.value+'%'; voiceAudio.volume=this.value/100; });
  g('setAutoSpeed').addEventListener('input', function(){ settings.autoSpeed=+this.value; g('setAutoVal').textContent=(this.value/1000).toFixed(1)+' s'; });
  g('setLoop').addEventListener('click', function(){ settings.autoBgm=!settings.autoBgm; this.className='switch'+(settings.autoBgm?' on':''); bgmAudio.loop=settings.autoBgm; });
  g('setAuto').addEventListener('click', function(){ settings.autoPlay=!settings.autoPlay; this.className='switch'+(settings.autoPlay?' on':''); g('autoBadge').style.display=(started&&settings.autoPlay)?'block':'none'; if(settings.autoPlay&&started&&!typing) scheduleAuto(); else clearAuto(); });
  g('setPortraits').addEventListener('click', function(){ settings.showPortraits=!settings.showPortraits; this.className='switch'+(settings.showPortraits?' on':''); clearPortraits(); if(settings.showPortraits&&started&&cards[idx]) showPortrait(cards[idx]); });
  g('setSubBg').addEventListener('click', function(){ settings.subtitleBg=!settings.subtitleBg; this.className='switch'+(settings.subtitleBg?' on':''); applySubtitleBg(); });
  g('setBack').addEventListener('click', function(){ hide('settingsPanel'); });
  g('setSave').addEventListener('click', function(){ saveSettings(); syncSettingsUI(); });

  // AUTO 徽标：点击暂停 / 恢复自动阅读
  g('autoBadge').addEventListener('click', function(e){ e.stopPropagation(); settings.autoPlay=!settings.autoPlay; this.textContent='AUTO '+(settings.autoPlay?'⏸':'▶'); if(settings.autoPlay&&!typing) scheduleAuto(); else clearAuto(); });

  // ---------- 多存档槽 ----------
  function slotData(n){ try { var s=localStorage.getItem(SLOTKEY(n)); if(s) return JSON.parse(s); } catch(e){} return null; }
  function writeSlot(n){
    var card = cards[idx]||{};
    var data = { idx:idx, time:Date.now(), preview:(card.speaker?card.speaker+'：':'')+((card.text||'').slice(0,18)) };
    try { localStorage.setItem(SLOTKEY(n), JSON.stringify(data)); } catch(e){}
    renderSlots();
  }
  function loadSlot(n){ var s=slotData(n); if(!s) return; hide('savePanel'); hide('inGameMenu'); enterGame(s.idx||0); }
  function clearSlot(n){ try { localStorage.removeItem(SLOTKEY(n)); } catch(e){} renderSlots(); }
  function renderSlots(){
    var list=g('slotList'); list.innerHTML='';
    for(var n=1;n<=SLOT_COUNT;n++){
      (function(n){
        var s=slotData(n);
        var row=document.createElement('div'); row.className='slot';
        var info=document.createElement('div'); info.className='info';
        var nm=document.createElement('div'); nm.className='name'; nm.textContent='存档位 '+n;
        var meta=document.createElement('div'); meta.className='meta';
        meta.textContent = s ? (new Date(s.time).toLocaleString()+' · '+(s.preview||'')) : '（空）';
        info.appendChild(nm); info.appendChild(meta);
        var acts=document.createElement('div'); acts.className='acts';
        var bSave=document.createElement('button'); bSave.className='btn-primary'; bSave.textContent='存档';
        bSave.onclick=function(){ writeSlot(n); };
        var bLoad=document.createElement('button'); bLoad.className='btn-ghost'; bLoad.textContent='读档';
        bLoad.disabled=!s; bLoad.style.opacity=s?1:.4; bLoad.onclick=function(){ loadSlot(n); };
        acts.appendChild(bSave); acts.appendChild(bLoad);
        if(s){ var bDel=document.createElement('button'); bDel.className='btn-ghost'; bDel.textContent='清除'; bDel.onclick=function(){ clearSlot(n); }; acts.appendChild(bDel); }
        row.appendChild(info); row.appendChild(acts);
        list.appendChild(row);
      })(n);
    }
    if(SLOT_COUNT===0){ list.innerHTML='<div class="panel-sub">本作未开启多存档槽</div>'; }
  }
  g('saveBack').addEventListener('click', function(){ hide('savePanel'); });

  // 制作名单
  g('creditsTitle').textContent = PROJECT.title || '';
  var brand = OPTS.showBranding!==false ? '使用 <b>StoryForge</b> 创作并导出<br/><br/>' : '';
  g('creditsBody').innerHTML = '编剧 / 导演：'+(PROJECT.title||'作者')+' 的作者<br/>'+brand+'角色 '+(PROJECT.characters?PROJECT.characters.length:0)+' · 场景 '+(PROJECT.backgrounds?PROJECT.backgrounds.length:0)+' · 音轨 '+(PROJECT.audioTracks?PROJECT.audioTracks.length:0);
  g('creditsBack').addEventListener('click', function(){ hide('creditsPanel'); });

  // 游戏内菜单
  g('menuBtn').addEventListener('click', function(){ show('inGameMenu'); });
  g('igResume').addEventListener('click', function(){ hide('inGameMenu'); });
  g('igSave').addEventListener('click', function(){ hide('inGameMenu'); show('savePanel'); renderSlots(); });
  g('igSettings').addEventListener('click', function(){ hide('inGameMenu'); show('settingsPanel'); syncSettingsUI(); });
  g('igCredits').addEventListener('click', function(){ hide('inGameMenu'); show('creditsPanel'); });
  g('igRestart').addEventListener('click', function(){ hide('inGameMenu'); openStart(); });
  if(SLOT_COUNT===0) g('igSave').style.display='none';

  // 启动
  if(shellEnabled){ openStart(); }
  else { enterGame(0); }
})();
`
