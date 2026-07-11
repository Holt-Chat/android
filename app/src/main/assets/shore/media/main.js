// Imports
import * as calls from './calls.js';
import * as push from './push.js';

// Stores
const UserStore = new Map();
const MemberStore = new Map();
const FileStore = new Map();
window.UserStore = UserStore;
window.MemberStore = MemberStore;
window.FileStore = FileStore;

let ChannelNotifStore = new Map();
let PinnedChannelsStore = new Map();
let PKStore = new Map();
let PKVerified = new Set();
const PKChannels = [];
window.ChannelNotifStore = ChannelNotifStore;
window.PinnedChannelsStore = PinnedChannelsStore;
window.PKStore = PKStore;
function syncHoltNotifs(){
  if (!window.HoltNative||!window.HoltNative.syncNotifConfig) return;
  try{
    let muted = (window.channels||[]).filter(ch=>getNotifStateChannel(ch.id, ch.type)==='none').map(ch=>ch.id);
    window.HoltNative.syncNotifConfig(JSON.stringify({ enabled: localStorage.getItem('pnotif')==='true', muted }));
  }catch(e){}
}
window.syncHoltNotifs = syncHoltNotifs;
document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='hidden') syncHoltNotifs(); });
window.PKVerified = PKVerified;

async function saveToDB() {
  let tx = db.transaction(['servers'], 'readwrite');
  let store = tx.objectStore('servers');
  let req = store.get(window.currentServer);
  req.onsuccess = (e)=>{
    let val = e.target.value??{ notifs: {}, public: {}, pinned: {} };
    val.notifs = Object.fromEntries(ChannelNotifStore);
    val.public = Object.fromEntries(PKStore);
    val.verified = Array.from(PKVerified);
    val.pinned = Object.fromEntries(PinnedChannelsStore);
    store.put(val, window.currentServer);
  }
}
window.saveToDB = saveToDB;

const ValidSignature = Symbol('Valid signature');
const InvalidSignature = Symbol('Invalid signature');

// Messages
const messageInput = document.getElementById('input');
window.messageInput = messageInput;
const messageSned = document.getElementById('sned');
const mentionMenu = document.getElementById('mentionmenu');
const imageicon = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 40C0 28.9543 8.95431 20 20 20H236C247.046 20 256 28.9543 256 40V215C256 226.046 247.046 235 236 235H20C8.95431 235 0 226.046 0 215V40ZM78 68C78 81.8071 66.8071 93 53 93C39.1929 93 28 81.8071 28 68C28 54.1929 39.1929 43 53 43C66.8071 43 78 54.1929 78 68ZM150.135 91.8679C153.266 86.7107 160.734 86.7107 163.865 91.8679L234.817 208.76C238.075 214.127 234.22 221 227.952 221H142.029H86.048H26.9705C20.3787 221 16.6463 213.367 20.6525 208.08L78.1821 132.152C81.3664 127.949 87.6335 127.949 90.8179 132.152L110.176 157.7L150.135 91.8679Z"/></svg>';
window.messages = {};
let files = [];
let reply = null;
let ephemeralTTL = null;
const ephemeralOrder = ['10s', '1m', '1h', '24h'];
const ephemeralTtlMs = { '10s': 10000, '1m': 60000, '1h': 3600000, '24h': 86400000 };
function setEphemeralTTL(ttl) {
  ephemeralTTL = ttl;
  document.getElementById('ephemeralpreview').style.display = ttl?'':'none';
  if (ttl) document.querySelector('#ephemeralpreview .ttl').innerText = ttl;
  let ephBtnValue = document.querySelector('#ephemeralbtn .eph-value');
  if (ephBtnValue) ephBtnValue.innerText = ttl??'';
}
window.clearEphemeral = ()=>setEphemeralTTL(null);
messageInput.setAttribute('contenteditable', 'plaintext-only');
getTranslation('message').then(t=>{ if (t) messageInput.setAttribute('data-placeholder', t); });
let mdComposing = false;
function mdEscape(s) { return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function mdInline(h) {
  h = h.replace(/`([^`\n]+?)`/g, (m,c)=>`<span class="md-mk">\`</span><span class="md-c">${c}</span><span class="md-mk">\`</span>`);
  h = h.replace(/\*\*([^\n]+?)\*\*/g, (m,c)=>`<span class="md-mk">**</span><span class="md-b">${c}</span><span class="md-mk">**</span>`);
  h = h.replace(/__([^\n]+?)__/g, (m,c)=>`<span class="md-mk">__</span><span class="md-u">${c}</span><span class="md-mk">__</span>`);
  h = h.replace(/~~([^\n]+?)~~/g, (m,c)=>`<span class="md-mk">~~</span><span class="md-s">${c}</span><span class="md-mk">~~</span>`);
  h = h.replace(/==([^\n]+?)==/g, (m,c)=>`<span class="md-mk">==</span><span class="md-hl">${c}</span><span class="md-mk">==</span>`);
  h = h.replace(/(^|[^*<])\*([^*<\n]+?)\*(?!\*)/g, (m,p,c)=>`${p}<span class="md-mk">*</span><span class="md-i">${c}</span><span class="md-mk">*</span>`);
  h = h.replace(/(^|[^_<])_([^_<\n]+?)_(?!_)/g, (m,p,c)=>`${p}<span class="md-mk">_</span><span class="md-i">${c}</span><span class="md-mk">_</span>`);
  h = h.replace(/&lt;t:(-?\d{1,15}):?[tTdDfFRsS]?&gt;/g, m=>`<span class="md-tok">${m}</span>`);
  return h;
}
function mdHighlight(text) {
  return text.split('\n').map(line=>{
    let h = mdEscape(line);
    let hm = h.match(/^(#{1,3} )(.*)$/);
    if (hm) return `<span class="md-mk">${hm[1]}</span><span class="md-h">${mdInline(hm[2])}</span>`;
    let qm = h.match(/^(&gt; )(.*)$/);
    if (qm) return `<span class="md-mk">${qm[1]}</span><span class="md-q">${mdInline(qm[2])}</span>`;
    return mdInline(h);
  }).join('\n');
}
function mdGetCaret() {
  let sel = window.getSelection();
  if (!sel.rangeCount||!messageInput.contains(sel.anchorNode)) return null;
  let r = sel.getRangeAt(0), pre = r.cloneRange();
  pre.selectNodeContents(messageInput); pre.setEnd(r.startContainer, r.startOffset);
  let s = pre.toString().length;
  return [s, s+r.toString().length];
}
function mdSetCaret(start, end) {
  end = end??start;
  let tw = document.createTreeWalker(messageInput, NodeFilter.SHOW_TEXT), chars = 0, sN, sO = 0, eN, eO = 0, t;
  while ((t = tw.nextNode())) {
    let len = t.nodeValue.length;
    if (sN===undefined&&chars+len>=start) { sN = t; sO = start-chars; }
    if (chars+len>=end) { eN = t; eO = end-chars; break; }
    chars += len;
  }
  let r = document.createRange();
  if (sN) r.setStart(sN, sO); else r.setStart(messageInput, messageInput.childNodes.length);
  if (eN) r.setEnd(eN, eO); else r.setEnd(r.startContainer, r.startOffset);
  let sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function mdRefresh() {
  if (mdComposing) return;
  let max = +(messageInput.getAttribute('maxlength')||0);
  let text = messageInput.textContent;
  if (max&&text.length>max) text = text.slice(0, max);
  let caret = mdGetCaret();
  mdPushHistory();
  messageInput.innerHTML = mdHighlight(text);
  if (caret) mdSetCaret(Math.min(caret[0], text.length), Math.min(caret[1], text.length));
}
Object.defineProperty(messageInput, 'value', { configurable: true, get() { return this.textContent; }, set(v) { this.textContent = v??''; mdRefresh(); mdSetCaret(this.textContent.length); } });
Object.defineProperty(messageInput, 'selectionStart', { configurable: true, get() { return (mdGetCaret()||[this.textContent.length])[0]; } });
Object.defineProperty(messageInput, 'selectionEnd', { configurable: true, get() { let c = mdGetCaret(); return c?c[1]:this.textContent.length; } });
messageInput.setSelectionRange = function(s, e) { this.focus(); mdSetCaret(s, e??s); };
messageInput.oninput = messageInput.onchange = mdRefresh;
messageInput.addEventListener('compositionstart', ()=>{ mdComposing = true; });
messageInput.addEventListener('compositionend', ()=>{ mdComposing = false; mdRefresh(); });
// Rewriting innerHTML on every keystroke (for markdown highlighting) wipes the browser's native
// contenteditable undo stack, so Ctrl+Z is handled with our own history instead of relying on it.
let mdHistory = [{text: '', caret: 0}];
let mdHistoryIndex = 0;
let mdHistoryRestoring = false;
let mdLastPushAt = 0;
function mdPushHistory() {
  if (mdHistoryRestoring||mdComposing) return;
  let text = messageInput.textContent;
  let top = mdHistory[mdHistoryIndex];
  if (top.text===text) return;
  let caret = mdGetCaret()?.[1]??text.length;
  let now = Date.now();
  let boundary = now-mdLastPushAt>500||Math.abs(text.length-top.text.length)>1||/\s/.test(text.slice(-1));
  if (mdHistoryIndex<mdHistory.length-1) mdHistory = mdHistory.slice(0, mdHistoryIndex+1);
  if (boundary||mdHistoryIndex===0) { mdHistory.push({text, caret}); mdHistoryIndex++; }
  else mdHistory[mdHistoryIndex] = {text, caret};
  if (mdHistory.length>200) { mdHistory.shift(); mdHistoryIndex--; }
  mdLastPushAt = now;
}
function mdRestoreHistory() {
  mdHistoryRestoring = true;
  let entry = mdHistory[mdHistoryIndex];
  messageInput.textContent = entry.text;
  messageInput.innerHTML = mdHighlight(entry.text);
  mdSetCaret(Math.min(entry.caret, entry.text.length));
  mdHistoryRestoring = false;
}
function mdUndo() { if (mdHistoryIndex>0) { mdHistoryIndex--; mdRestoreHistory(); } }
function mdRedo() { if (mdHistoryIndex<mdHistory.length-1) { mdHistoryIndex++; mdRestoreHistory(); } }
// Presence + typing
window.presence = window.presence??{};
window.lastSeen = window.lastSeen??{};
window.myStatus = window.myStatus??'online';
window.myShareTyping = window.myShareTyping??true;
window.typingUsers = window.typingUsers??{};
window.activeCalls = window.activeCalls??{};
let lastActivity = Date.now();
let autoIdled = false;
window.typingStrings = {one: '{} is typing', two: '{} and {} are typing', many: '{} people are typing'};
function presenceData(username) {
  if (!username) return '';
  let st = username===window.username?window.myStatus:window.presence[username];
  return ` data-user="${sanitizeMinimChars(username)}"${st?` data-status="${st}"`:''}`;
}
window.presenceData = presenceData;
function applyPresence(username) {
  let st = username===window.username?window.myStatus:window.presence[username];
  document.querySelectorAll(`[data-user="${sanitizeMinimChars(username)}"]`).forEach(el=>{
    if (st) el.dataset.status = st;
    else el.removeAttribute('data-status');
  });
}
window.applyPresence = applyPresence;
function applyMyStatus() {
  let av = document.querySelector('#user .av');
  if (av) av.dataset.user = window.username;
  applyPresence(window.username);
}
window.applyMyStatus = applyMyStatus;
async function setMyStatus(status, auto=false) {
  autoIdled = false;
  window.myStatus = status;
  applyMyStatus();
  document.querySelectorAll('.status-pick').forEach(s=>s.dataset.status = status);
  let f = new FormData();
  f.append('status', status);
  f.append('auto', auto?'1':'0');
  backendfetch('/api/v1/me/status', {method: 'PATCH', body: f});
}
window.setMyStatus = setMyStatus;
function setPrivacyShare(field, value) {
  if (field==='share_typing') window.myShareTyping = value;
  let f = new FormData();
  f.append(field, value?'1':'0');
  backendfetch('/api/v1/me/status', {method: 'PATCH', body: f});
}
function markActive() {
  lastActivity = Date.now();
  if (autoIdled) { autoIdled = false; setMyStatus('online'); }
}
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'focus'].forEach(e=>window.addEventListener(e, markActive, {passive: true}));
setInterval(()=>{
  // Auto-idle after 10 mins of no activity, only from online (never overrides dnd/invisible/manual idle)
  if (window.username&&window.myStatus==='online'&&Date.now()-lastActivity>10*60*1000) { setMyStatus('idle', true); autoIdled = true; }
}, 30000);
window.setPrivacyShare = setPrivacyShare;
let lastTypingSent = 0;
messageInput.addEventListener('input', ()=>{
  if (!window.currentChannel||![1,2].includes(window.currentChannelType)) return;
  if (!window.myShareTyping||window.myStatus==='invisible') return;
  let now = Date.now();
  if (now-lastTypingSent<3500) return;
  lastTypingSent = now;
  backendfetch(`/api/v1/channel/${window.currentChannel}/typing`, {method: 'POST'});
});
function addTyping(channelId, username) {
  if (username===window.username) return;
  if (!window.typingUsers[channelId]) window.typingUsers[channelId] = {};
  if (window.typingUsers[channelId][username]) clearTimeout(window.typingUsers[channelId][username]);
  window.typingUsers[channelId][username] = setTimeout(()=>removeTyping(channelId, username), 6000);
  renderTyping();
}
window.addTyping = addTyping;
function removeTyping(channelId, username) {
  if (window.typingUsers[channelId]&&window.typingUsers[channelId][username]) {
    clearTimeout(window.typingUsers[channelId][username]);
    delete window.typingUsers[channelId][username];
    renderTyping();
  }
}
window.removeTyping = removeTyping;
function renderTyping() {
  let el = document.getElementById('typing');
  if (!el) return;
  let users = Object.keys(window.typingUsers[window.currentChannel]??{});
  if (!users.length) {
    el.innerHTML = '';
    return;
  }
  let names = users.map(u=>sanitizeHTML(UserStore.get(u)?.display??u));
  let maxNames = window.innerWidth<600?1:2;
  let t;
  if (names.length===1) t = window.typingStrings.one.replace('{}', names[0]);
  else if (names.length<=maxNames) t = window.typingStrings.two.replace('{}', names[0]).replace('{}', names[1]);
  else t = window.typingStrings.many.replace('{}', names.length);
  el.innerHTML = `<span class="dots"><i></i><i></i><i></i></span><span class="tname">${t}</span>`;
}
window.renderTyping = renderTyping;
const ccPhoneIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" style="fill:var(--valid);flex-shrink:0"><path d="M248.89 112.906C249.562 113.307 250.137 113.78 250.583 114.424C252.31 116.918 256.509 124.762 255.949 141.5C255.487 155.319 252.998 164.591 251.349 169.317C250.583 171.514 248.265 172.598 246.008 172.03L186.156 156.971C184.662 156.595 183.424 155.551 182.802 154.142L174.338 134.975C173.718 133.57 172.501 132.532 171.008 132.176C163.963 130.496 142.602 125.707 128.147 125.75C113.733 125.793 93.0391 130.499 86.1428 132.17C84.6575 132.53 83.4475 133.565 82.8301 134.963L74.3446 154.179C73.7315 155.567 72.5211 156.602 71.0542 156.991L13.9016 172.17C12.0001 172.675 9.99731 172.007 9.00413 170.308C6.53729 166.09 2.1679 156.786 0.344999 141.5C-1.88619 122.79 7.33098 115.602 10.0451 113.914C10.525 113.615 10.9853 113.354 11.4578 113.044C17.3493 109.176 61.1227 82 128.147 82C194.424 82 241.633 108.573 248.89 112.906Z"/></svg>`;
function renderCallIndicator() {
  let el = document.getElementById('channel-call');
  if (!el) return;
  let chId = window.currentChannel;
  let call = window.activeCalls[chId];
  if (!call||calls.callChannel()===chId) { el.style.display='none'; return; }
  if (call.participants===null) {
    el.innerHTML = `${ccPhoneIcon}<span class="cc-label">${window.callStrings?.ongoing||'Ongoing call'}</span><button class="cc-join" onclick="window.joinChannelCall()">${window.callStrings?.join||'Join'}</button>`;
    el.style.display = '';
    backendfetch(`/api/v1/channel/${chId}/call`).then(res=>{
      if (!res.active) { delete window.activeCalls[chId]; if (window.currentChannel===chId) renderCallIndicator(); return; }
      window.activeCalls[chId].participants = res.participants||[];
      if (window.currentChannel===chId) renderCallIndicator();
    });
    return;
  }
  let parts = call.participants||[];
  let avatarHtml = parts.slice(0,3).map(p=>`<img class="cc-av" src="${p.pfp?pfpById(p.pfp):userToDefaultPfp({display:p.display||p.display_name, username:p.username})}" title="${sanitizeHTML(p.display||p.display_name||p.username)}">`).join('');
  el.innerHTML = `${ccPhoneIcon}<span class="cc-label">${window.callStrings?.ongoing||'Ongoing call'}</span><div class="cc-avatars">${avatarHtml}</div><button class="cc-join" onclick="window.joinChannelCall()">${window.callStrings?.join||'Join'}</button>`;
  el.style.display = '';
}
async function trackCall(type, data) {
  if (type==='start') {
    if (!window.activeCalls[data.channel_id]) window.activeCalls[data.channel_id]={started_by:data.started_by, participants:null};
  } else if (type==='join') {
    if (!window.activeCalls[data.channel_id]) window.activeCalls[data.channel_id]={started_by:'', participants:[]};
    if (!window.activeCalls[data.channel_id].participants) window.activeCalls[data.channel_id].participants=[];
    if (!window.activeCalls[data.channel_id].participants.find(p=>p.id===data.user.id))
      window.activeCalls[data.channel_id].participants.push(data.user);
  } else if (type==='left') {
    let ac = window.activeCalls[data.channel_id];
    if (ac&&ac.participants) {
      ac.participants = ac.participants.filter(p=>p.id!==data.user.id);
      if (!ac.participants.length) delete window.activeCalls[data.channel_id];
    }
  }
  if (data.channel_id===window.currentChannel) renderCallIndicator();
}
let typingResizeTimer;
window.addEventListener("resize", ()=>{ clearTimeout(typingResizeTimer); typingResizeTimer = setTimeout(renderTyping, 150); });
window.statusStrings = {online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline', lastseen: 'last seen {}'};
function presenceText(username) {
  let st = window.presence[username];
  if (!st||st==='offline') {
    let ls = window.lastSeen[username];
    let txt = ls?window.statusStrings.lastseen.replace('{}', formatTime(ls)):window.statusStrings.offline;
    return `<span class="pdot" data-status="offline"></span><span>${sanitizeHTML(txt)}</span>`;
  }
  return `<span class="pdot" data-status="${st}"></span><span>${sanitizeHTML(window.statusStrings[st]??st)}</span>`;
}
window.presenceText = presenceText;
function renderPeerStatus() {
  let el = document.getElementById('peer-status');
  if (!el) return;
  let ch = window.channels?.find(c=>c.id===window.currentChannel);
  if (!ch||ch.type!==1) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = presenceText(ch.username??ch.name);
}
window.renderPeerStatus = renderPeerStatus;
async function loadDynStrings() {
  if (!window.getTranslation) return;
  let g = window.getTranslation;
  window.typingStrings = {
    one: (await g('typing.one'))||'{} is typing',
    two: (await g('typing.two'))||'{} and {} are typing',
    many: (await g('typing.many'))||'{} people are typing'
  };
  window.statusStrings = {
    online: (await g('status.online'))||'Online',
    idle: (await g('status.idle'))||'Idle',
    dnd: (await g('status.dnd'))||'Do not disturb',
    offline: (await g('status.offline'))||'Offline',
    lastseen: (await g('status.lastseen'))||'last seen {}'
  };
  window.callStrings = {
    ongoing: (await g('channel.call.ongoing'))||'Ongoing call',
    join: (await g('channel.call.join'))||'Join'
  };
  window.timeStrings = {
    today: (await g('time.today'))||'today',
    yesterday: (await g('time.yesterday'))||'yesterday',
    tomorrow: (await g('time.tomorrow'))||'tomorrow'
  };
}
loadDynStrings();
window.setLanguage = (lang)=>{
  localStorage.setItem('language', lang);
  window.translate();
  loadDynStrings().then(()=>{ window.renderPeerStatus?.(); window.renderTyping?.(); });
};
async function BasicSend(msg, sign, channel, akey=null, iv=null) {
  let formData = new FormData();
  // Data
  formData.append('content', msg);
  if (akey) {
    formData.append('key', akey);
    formData.append('iv', iv);
  }
  if (reply) formData.append('replied_to', reply);
  if (ephemeralTTL) formData.append('ttl', ephemeralTTL);
  files.forEach(file=>{
    if (window.currentChannelType===3) {
      file.encrypted = false;
      file.iv = null;
    }
    formData.append('files', file.file, file.name);
    formData.append('attachments_meta', JSON.stringify({
      encrypted: file.encrypted,
      iv: file.iv
    }));
  });
  let embedAssetIds = extractEmbedAssetIds(sign);
  if (embedAssetIds.length) formData.append('embed_asset_ids', JSON.stringify(embedAssetIds));
  // Signature
  let sdate = Math.ceil(Date.now()/1000);
  let signat = `${sign}:${channel}:${sdate}`;
  let skey = await getRSAKeyPair();
  let signature = await signRSAString(signat, skey.privateKey);
  formData.append('timestamp', sdate);
  formData.append('signature', signature);
  // Ghost
  if (!window.messages[channel]) window.messages[channel] = [];
  let nonce = Math.floor(Math.random()*16**6).toString(16);
  formData.append('nonce', nonce);
  window.messages[channel].unshift({
    ghost: 1,
    id: 'nonce-'+nonce,
    timestamp: Date.now(),
    content: sign,
    signature,
    signed_timestamp: sdate,
    user: UserStore.get(window.username),
    attachments: files.map(file=>{return {
      id: '',
      filename: file.name,
      size: file.file.size,
      mimetype: file.file.type,
      encrypted: file.encrypted,
      iv: file.iv,
      previewUrl: FileStore.get(file.file)
    }}),
    key: null,
    iv: null,
    edited_at: null,
    replied_to: reply,
    expires_at: ephemeralTTL?Date.now()+ephemeralTtlMs[ephemeralTTL]:null
  });
  window.messages[channel][0].user.hide = shouldHideUser(window.messages[channel], 0, channel);
  messagesContainer.insertAdjacentHTML('afterbegin', await displayMessage(window.messages[channel][0], window.channels.find(ch=>ch.id===channel), 2));
  // Cleanup
  messageInput.value = '';
  messageInput.oninput();
  files = [];
  filePreview();
  reply = null;
  window.closereply();
  setEphemeralTTL(null);
  document.getElementById('messages').scrollTop = 0;
  // In case of fail
  let failed = async()=>{
    let o;
    window.messages[channel] = window.messages[channel]
      .map(msg=>{
        if (msg.id === 'nonce-'+nonce) {
          msg.ghost = 2;
          o = msg;
        }
        return msg;
      });
    if (window.currentChannel===channel) document.getElementById('m-nonce-'+nonce).outerHTML = await displayMessage(o, channel, 2);
  }
  // Send
  backendfetch(`/api/v1/channel/${channel}/messages`, {
    method: 'POST',
    body: formData,
    passstatus: true
  })
    .then(res=>{
      if (res.status.toString().startsWith('2')) return;
      failed();
    })
    .catch(()=>{
      failed();
    });
}
function getChannelAESKey(channel) {
  return new Promise(topResolve=>{
    getCurrentKeyChannel(channel, async()=>{
      let nkey;
      let last = Object.keys(window.keys[channel]).reduce((a, b) => window.keys[channel][a]?.expires_at > window.keys[channel][b]?.expires_at ? a : b, '');
      if (!last || Date.now()>window.keys[channel][last].expires_at) {
        await new Promise((resolve, reject)=>{
          backendfetch(`/api/v1/channel/${channel}/members?pb=true`)
            .then(async(members)=>{
              nkey = await newAESKey();
              let newKey = await AESKeyToBase64(nkey);
              let body = {};
              let discontinue = false;
              for (let i=0; i<members.length; i++) {
                let publicKey;
                if (PKStore.has(members[i].username)) {
                  publicKey = PKStore.get(members[i].username);
                  if (publicKey!==members[i].public) {
                    let conf = await affirm('message.publicChange', members[i].username);
                    if (!discontinue) discontinue = !conf;
                    if (conf) {
                      PKStore.set(members[i].username, members[i].public);
                      publicKey = members[i].public;
                    }
                  }
                } else {
                  publicKey = members[i].public;
                  PKStore.set(members[i].username, publicKey);
                  saveToDB();
                }
                publicKey = await getRSAKeyFromPublic64(publicKey);
                body[members[i].username] = await encryptRSAString(newKey, publicKey);
              }
              if (discontinue) {
                reject();
                return;
              }
              backendfetch(`/api/v1/channel/${channel}/key`, {
                method: 'POST',
                headers: {
                  'content-type': 'application/json'
                },
                body: JSON.stringify(body)
              })
                .then(async(pkey)=>{
                  getKeyContents(channel, pkey.key_id);
                  last = pkey.key_id;
                  resolve();
                });
          });
        });
      } else {
        const privateKey = (await getRSAKeyPair()).privateKey;
        nkey = await base64ToAESKey(await decryptRSAString(window.keys[channel][last].key, privateKey));
      }
      topResolve({ nkey, keyId: last });
    });
  });
}
async function CryptSend(msg, channel) {
  let { nkey, keyId: last } = await getChannelAESKey(channel);
  // Message
  let enc = await encryptAES(msg, nkey);
  // Files
  for (let i=0; i<files.length; i++) {
    if (!files[i].encrypted) continue;
    let orig = files[i].file;
    let encfile = await encryptAES(await files[i].file.arrayBuffer(), nkey)
    files[i].iv = encfile.iv;
    files[i].file = new File(
      [encfile.data],
      files[i].name,
      { type: files[i].file.type }
    );
    FileStore.set(files[i].file, FileStore.get(orig));
  }
  // Send
  BasicSend(enc.data, msg, channel, last, enc.iv);
}
async function MessageSend() {
  let msg = messageInput.value.trim()
  messageInput.value = msg;
  if (msg.length<1&&files.length<1) return;
  if (window.currentChannelType===3) {
    BasicSend(msg, msg, window.currentChannel);
  } else {
    CryptSend(msg, window.currentChannel);
  }
}
let lastMention = '';
let _mentionIdx = -1;
let messageCursorStart = 0;
let messageCursorEnd = 0;
function _mentionNav(dir) {
  let items = [...mentionMenu.querySelectorAll('[data-mention-idx]')];
  if (!items.length) return;
  _mentionIdx = Math.max(0, Math.min(items.length-1, _mentionIdx+dir));
  items.forEach((el,i)=>el.classList.toggle('focused', i===_mentionIdx));
  mentionMenu.querySelector('.focused')?.scrollIntoView({block:'nearest'});
}
function handleMentionMenu() {
  mentionMenu.style.display = 'none';
  _mentionIdx = -1;
  messageCursorStart = messageInput.selectionStart;
  messageCursorEnd = messageInput.selectionEnd;
  if (messageCursorStart===messageCursorEnd) {
    let content = messageInput.value;
    if (!content.includes('@')) return;
    content = content.slice(Math.max(messageCursorStart-20,0), messageCursorStart);
    if (!content.includes('@')) return;
    content = content.split('@').slice(-1)[0];
    if (content && !(/^[a-z0-9\-_]+?$/i).test(content)) return;
    mentionMenu.style.display = '';
    _mentionIdx = -1;
    let _mPool = window.currentChannelType===1?(()=>{let _dc=window.channels?.find(c=>c.id===window.currentChannel);let _u=_dc?.username??_dc?.name;return _u?[{username:_u,display:_dc.name,pfp:_dc.pfp}]:[];})():(MemberStore.get(window.currentChannel)??[]);
    mentionMenu.innerHTML = (content
      ? _mPool
          .map(usr=>{
            let letters = content.split('');
            usr.sim = usr.username.split('').map(l=>letters.includes(l)).reduce((acc,cur)=>acc+cur,0);
            if (usr.username.includes(content)) usr.sim += content.length*1.5;
            return usr;
          })
          .filter(usr=>usr.sim>(usr.username.length/3))
          .toSorted((a,b)=>b.sim-a.sim)
      : [..._mPool].toSorted((a,b)=>a.username.localeCompare(b.username)))
      .map((usr, _mi)=>`<div tabindex="0" role="button" data-mention-idx="${_mi}" onclick="let k=messageInput.value.slice(0,messageInput.selectionStart).split('@').slice(0,-1).join('@').length+1;messageInput.value=messageInput.value.slice(0,k)+'${sanitizeMinimChars(usr.username)} '+messageInput.value.slice(k+${content.length});messageInput.focus();messageInput.setSelectionRange(k+${sanitizeMinimChars(usr.username).length+1},k+${sanitizeMinimChars(usr.username).length+1});messageInput.onkeyup();">
  <img src="${usr.pfp?pfpById(usr.pfp):userToDefaultPfp(usr)}" width="42" height="42" aria-hidden="true" loading="lazy" onerror="this.src='${userToDefaultPfp(usr)}'">
  <div>
    <span>${sanitizeHTML(usr.display??sanitizeMinimChars(usr.username))}</span>
    <span class="small">@${sanitizeMinimChars(usr.username)}</span>
  </div>
</div>`)
      .join('');
    if (mentionMenu.innerHTML.length<3) mentionMenu.style.display = 'none';
  }
}
const slashMenu = document.getElementById('slashmenu');
const slashPanel = document.getElementById('slashpanel');
let slashCmdCache = {};
let slashCacheTimes = {};
let activeSlashCmd = null;
let _slashMenuCmds = [];
let _slashMenuIdx = -1;
function closeSlash() {
  slashMenu.style.display = 'none';
  slashPanel.style.display = 'none';
  slashPanel.innerHTML = '';
  activeSlashCmd = null;
  _slashMenuCmds = [];
  _slashMenuIdx = -1;
}
window.closeSlash = closeSlash;
function _slashNav(dir) {
  _slashMenuIdx = Math.max(0, Math.min(_slashMenuCmds.length-1, _slashMenuIdx+dir));
  slashMenu.querySelectorAll('[data-slash-idx]').forEach(el=>el.classList.toggle('focused', +el.dataset.slashIdx===_slashMenuIdx));
  let focused = slashMenu.querySelector('.focused');
  if (focused) focused.scrollIntoView({block: 'nearest'});
}
async function handleSlashMenu() {
  if (activeSlashCmd) return;
  let val = messageInput.value;
  if (!val.startsWith('/')) { slashMenu.style.display = 'none'; return; }
  let typed = val.slice(1).toLowerCase();
  let now = Date.now();
  if (!slashCmdCache[window.currentChannel]||now-(slashCacheTimes[window.currentChannel]||0)>30000) {
    let res = await backendfetch(`/api/v1/channel/${window.currentChannel}/commands`);
    if (!res||!res.commands) { slashMenu.style.display = 'none'; return; }
    slashCmdCache[window.currentChannel] = res.commands;
    slashCacheTimes[window.currentChannel] = now;
  }
  let cmds = slashCmdCache[window.currentChannel];
  if (!cmds||!cmds.length) { slashMenu.style.display = 'none'; return; }
  let filtered = typed ? cmds.filter(c=>c.name.startsWith(typed)||c.bot_username.startsWith(typed)) : cmds;
  if (!filtered.length) { slashMenu.style.display = 'none'; return; }
  let sameList = _slashMenuCmds.length===filtered.length&&_slashMenuCmds.every((c,i)=>c.id===filtered[i].id);
  if (sameList) { slashMenu.style.display = ''; return; }
  _slashMenuCmds = filtered;
  _slashMenuIdx = -1;
  slashMenu.style.display = '';
  slashMenu.innerHTML = filtered.map((c, i)=>`<div tabindex="0" role="button" data-slash-idx="${i}" onclick="window.selectSlashCommand(${i})"><img src="${c.bot_pfp?pfpById(c.bot_pfp):userToDefaultPfp({username:c.bot_username})}" width="28" height="28" aria-hidden="true" onerror="this.src='${userToDefaultPfp({username:c.bot_username})}'"><div><span>/${sanitizeMinimChars(c.name)}</span><span class="small">@${sanitizeMinimChars(c.bot_username)} — ${sanitizeHTML(c.description)}</span></div></div>`).join('');
}
window.selectSlashCommand = function(idx) {
  let cmd = _slashMenuCmds[idx];
  if (!cmd) return;
  activeSlashCmd = cmd;
  slashMenu.style.display = 'none';
  _slashMenuCmds = [];
  _slashMenuIdx = -1;
  messageInput.value = '';
  renderSlashPanel(cmd);
};
function _slashOptWidget(opt, members) {
  let n = sanitizeMinimChars(opt.name);
  let base = `data-optname="${n}"`;
  if (opt.choices&&opt.choices.length) return `<select ${base}><option value=""></option>${opt.choices.map(c=>`<option value="${sanitizeHTML(String(c.value))}">${sanitizeHTML(c.name)}</option>`).join('')}</select>`;
  if (opt.type==='string') return `<input type="text" ${base}${opt.min_length?` minlength="${opt.min_length}"`:''}${opt.max_length?` maxlength="${opt.max_length}"`:''}>`;
  if (opt.type==='integer') return `<input type="number" step="1" ${base}${opt.min_value!=null?` min="${opt.min_value}"`:''}${opt.max_value!=null?` max="${opt.max_value}"`:''}>`;
  if (opt.type==='number') return `<input type="number" ${base}${opt.min_value!=null?` min="${opt.min_value}"`:''}${opt.max_value!=null?` max="${opt.max_value}"`:''}>`;
  if (opt.type==='boolean') return `<select ${base}><option value=""></option><option value="true">Yes</option><option value="false">No</option></select>`;
  if (opt.type==='user') return `<select ${base}><option value=""></option>${members.map(m=>`<option value="${sanitizeMinimChars(m.id??m.username)}">${sanitizeHTML(m.display??m.username)} (@${sanitizeMinimChars(m.username)})</option>`).join('')}</select>`;
  if (opt.type==='channel') return `<select ${base}><option value=""></option>${(window.channels??[]).map(c=>`<option value="${sanitizeMinimChars(c.id)}">${c.type===1?'@'+sanitizeHTML(c.name):'#'+sanitizeHTML(c.name)}</option>`).join('')}</select>`;
  return `<input type="text" ${base}>`;
}
function renderSlashPanel(cmd) {
  let members = window.currentChannelType===1?[]:(MemberStore.get(window.currentChannel)??[]);
  let hintStr = (opt)=>{
    let h = sanitizeHTML(opt.description);
    if (opt.type==='string'&&opt.max_length) h = `(max ${opt.max_length}) `+h;
    return h;
  };
  slashPanel.style.display = '';
  slashPanel.innerHTML = `<div class="sp-hdr"><span class="sp-cmdname">/${sanitizeMinimChars(cmd.name)}</span><span class="sp-cmddesc">${sanitizeHTML(cmd.description)}</span><button class="sp-close" onclick="window.closeSlash()" aria-label="Close">×</button></div>`
    +(cmd.options.length
      ? `<div class="sp-body">${cmd.options.map(opt=>`<div class="sp-opt"><label>${sanitizeHTML(opt.name)}${opt.required?' <span class="sp-req">*</span>':''}</label>${_slashOptWidget(opt, members)}<span class="sp-hint">${hintStr(opt)}</span></div>`).join('')}</div>`
      : `<div class="sp-nobody"><span tlang="slash.nooptions">No options</span></div>`)
    +`<div class="sp-footer"><span class="sp-err"></span><button class="sp-send" onclick="window.submitSlash()" tlang="slash.send">Send</button></div>`;
  window.translate?.();
  let first = slashPanel.querySelector('input, select');
  if (first) setTimeout(()=>first.focus(), 0);
}
window.submitSlash = async function() {
  if (!activeSlashCmd) return;
  let opts = {};
  let errMsg = null;
  for (let opt of activeSlashCmd.options) {
    let el = slashPanel.querySelector(`[data-optname="${CSS.escape(opt.name)}"]`);
    let val = el?.value?.trim()??'';
    if (!val) {
      if (opt.required) { errMsg = await getTranslation('slash.missingrequired')||'Fill in all required fields'; break; }
      continue;
    }
    if (opt.type==='integer') {
      let n = parseInt(val, 10);
      if (isNaN(n)) { errMsg = await getTranslation('slash.invalid')||'Invalid value'; break; }
      if (opt.min_value!=null&&n<opt.min_value||opt.max_value!=null&&n>opt.max_value) { errMsg = await getTranslation('slash.outofrange')||'Out of range'; break; }
      opts[opt.name] = n;
    } else if (opt.type==='number') {
      let n = parseFloat(val);
      if (isNaN(n)) { errMsg = await getTranslation('slash.invalid')||'Invalid value'; break; }
      if (opt.min_value!=null&&n<opt.min_value||opt.max_value!=null&&n>opt.max_value) { errMsg = await getTranslation('slash.outofrange')||'Out of range'; break; }
      opts[opt.name] = n;
    } else if (opt.type==='string') {
      if (opt.min_length&&val.length<opt.min_length) { errMsg = await getTranslation('slash.tooshort')||'Too short'; break; }
      if (opt.max_length&&val.length>opt.max_length) { errMsg = await getTranslation('slash.toolong')||'Too long'; break; }
      if (opt.choices?.length&&!opt.choices.some(c=>String(c.value)===val)) { errMsg = await getTranslation('slash.notchoice')||'Must be one of the options'; break; }
      opts[opt.name] = val;
    } else if (opt.type==='boolean') {
      opts[opt.name] = val==='true';
    } else {
      opts[opt.name] = val;
    }
  }
  let errEl = slashPanel.querySelector('.sp-err');
  if (errMsg) { if (errEl) errEl.textContent = errMsg; return; }
  if (errEl) errEl.textContent = '';
  let cmd = activeSlashCmd;
  let res = await backendfetch(`/api/v1/channel/${window.currentChannel}/interactions`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({bot_id: cmd.bot_id, command: cmd.name, options: opts})
  });
  if (res?.success) { closeSlash(); return; }
  if (errEl) errEl.textContent = res?.error||await getTranslation('slash.invalid')||'Error';
};
messageInput.onkeydown = (evt)=>{
  if ((evt.ctrlKey||evt.metaKey)&&!evt.shiftKey&&evt.key.toLowerCase()==='z') { evt.preventDefault(); mdUndo(); return; }
  if ((evt.ctrlKey||evt.metaKey)&&(evt.key.toLowerCase()==='y'||(evt.shiftKey&&evt.key.toLowerCase()==='z'))) { evt.preventDefault(); mdRedo(); return; }
  if (mentionMenu.style.display!=='none') {
    if (evt.key==='ArrowDown') { evt.preventDefault(); _mentionNav(1); return; }
    if (evt.key==='ArrowUp') { evt.preventDefault(); _mentionNav(-1); return; }
    if (evt.key==='Tab') { evt.preventDefault(); (mentionMenu.querySelector('.focused')??mentionMenu.querySelector('[data-mention-idx]'))?.click(); return; }
    if (evt.key==='Enter'&&!evt.shiftKey&&_mentionIdx>=0) { evt.preventDefault(); mentionMenu.querySelector('.focused')?.click(); return; }
    if (evt.key==='Escape') { evt.preventDefault(); mentionMenu.style.display='none'; _mentionIdx=-1; lastMention=''; return; }
  }
  if (slashMenu.style.display!=='none') {
    if (evt.key==='ArrowDown') { evt.preventDefault(); _slashNav(1); return; }
    if (evt.key==='ArrowUp') { evt.preventDefault(); _slashNav(-1); return; }
    if ((evt.key==='Tab'||evt.key==='Enter')&&!evt.shiftKey) { evt.preventDefault(); window.selectSlashCommand(_slashMenuIdx>=0?_slashMenuIdx:0); return; }
    if (evt.key==='Escape') { evt.preventDefault(); slashMenu.style.display = 'none'; return; }
  }
  if (evt.key==='Escape'&&slashPanel.style.display!=='none') { evt.preventDefault(); window.closeSlash(); return; }
  if (evt.key!=='Enter'||evt.shiftKey) return;
  evt.preventDefault();
  mentionMenu.style.display = 'none';
  if (activeSlashCmd) { window.submitSlash(); return; }
  MessageSend();
};
messageInput.onkeyup = ()=>{ handleMentionMenu(); handleSlashMenu(); };
messageInput.onmouseup = ()=>{ handleMentionMenu(); handleSlashMenu(); };
// Markdown editor (Discord-style): wrap the selection in tokens, with a selection toolbar and keyboard shortcuts
window.wrapMarkdown = (ta, token, end=token)=>{
  if (!ta) return;
  let s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e);
  ta.value = v.slice(0, s)+token+sel+end+v.slice(e);
  ta.focus();
  ta.setSelectionRange(s+token.length, e+token.length);
  ta.dispatchEvent(new Event('input', {bubbles: true}));
};
const mdShortcutTokens = {b: '**', i: '*', u: '__'};
window.handleMarkdownKeys = (evt)=>{
  if (!(evt.ctrlKey||evt.metaKey)) return;
  let k = evt.key.toLowerCase();
  if (evt.shiftKey&&k==='x') { evt.preventDefault(); window.wrapMarkdown(evt.target, '~~'); }
  else if (!evt.shiftKey&&mdShortcutTokens[k]) { evt.preventDefault(); window.wrapMarkdown(evt.target, mdShortcutTokens[k]); }
};
messageInput.addEventListener('keydown', window.handleMarkdownKeys);
const mdbar = document.getElementById('mdbar');
mdbar.querySelectorAll('button').forEach(btn=>{
  btn.addEventListener('mousedown', (evt)=>evt.preventDefault());
  btn.onclick = ()=>window.wrapMarkdown(messageInput, btn.getAttribute('data-md'));
});
document.addEventListener('selectionchange', ()=>{
  if (document.activeElement===messageInput&&messageInput.selectionStart!==messageInput.selectionEnd) mdbar.classList.add('show');
  else mdbar.classList.remove('show');
});
messageInput.addEventListener('blur', ()=>mdbar.classList.remove('show'));
const MD_RE = /[*_~`^=]|<t:-?\d|(^|\n)\s*([#>]|- )/;
function mdToolbarButtons() { return [['**','bold','<b>B</b>'],['*','italic','<i>I</i>'],['__','underline','<u>U</u>'],['~~','strikethrough','<s>S</s>'],['`','code','<code>&lt;/&gt;</code>']].map(([t,k,g])=>`<button type="button" data-md="${t}" tlang="format.${k}">${g}</button>`).join(''); }
function wireMdBar(bar, textarea) { if (!bar) return; bar.querySelectorAll('button').forEach(btn=>{ btn.addEventListener('mousedown', e=>e.preventDefault()); btn.onclick = ()=>window.wrapMarkdown(textarea, btn.getAttribute('data-md')); }); }
function mdLivePreview(textarea, preview) { if (!preview) return; let upd = ()=>{ let v = textarea.value; if (v.trim()&&MD_RE.test(v)) { preview.innerHTML = renderTimestamps(window.MDParse(v.trim(), MDCustom)); preview.style.display = 'block'; } else { preview.innerHTML = ''; preview.style.display = 'none'; } }; textarea.addEventListener('input', upd); upd(); }
// Clean one-line text for the channel-list last-message preview: strip embeds, render timestamps, strip markdown. Input is already HTML-escaped.
function previewText(s) {
  if (!s||s===imageicon) return s;
  let re = /(^|\n)[ \t]*!\s*(?:embed|diagram|interactive):\s*/g, m, out = '', cur = 0, hadEmbed = false;
  while ((m = re.exec(s))!==null) {
    let st = s.indexOf('{', m.index+m[0].length-1);
    if (st<0) continue;
    let d = 0, e = -1;
    for (let i=st; i<s.length; i++) { let c = s[i]; if (c==='{') d++; else if (c==='}') { d--; if (!d) { e = i+1; break; } } }
    if (e<0) continue;
    out += s.slice(cur, m.index);
    cur = e; re.lastIndex = e; hadEmbed = true;
  }
  out += s.slice(cur);
  out = out.replace(/(?:<|&lt;)t:(-?\d{1,15}):?([tTdDfFRsS]?)(?:>|&gt;)/g, (mm, u, sty)=>{ let dt = new Date(Number(u)*1000); if (isNaN(dt)) return mm; sty = sty||'f'; return sty==='R'?formatRelativeTime(dt):new Intl.DateTimeFormat(uiLocale(), tsStyles[sty]).format(dt); });
  out = out.replace(/(^|\n)\s*(#{1,3}\s|-#\s|&gt;\s)/g, '$1').replace(/`.+?`|\*\*.+?\*\*|\*.+?\*|__.+?__|_.+?_|~~.+?~~|==.+?==|~.+?~|\^.+?\^/g, (m)=>{let n=/^(\*\*|__|~~|==)/.test(m)?2:1;return m.slice(n,-n);}).replace(/\s+/g, ' ').trim();
  return out||(hadEmbed?'[embed]':'');
}
messageSned.onclick = MessageSend;
// Files
const attachAdd = document.getElementById('addattachmentbutton');
const fileInput = document.getElementById('addfile');
function elemfilepreview(file) {
  if (!FileStore.has(file)) FileStore.set(file, URL.createObjectURL(file));
  let type = file.type.split('/')[0];
  switch(type) {
    case 'image':
    case 'video':
    case 'audio':
      return `<${type.replace('age','g')} src="${FileStore.get(file)}" alt="File preview: ${sanitizeAttr(file.name)}" controls loading="lazy"></${type.replace('age','g')}>`;
    default:
      return `<div class="file">${sanitizeHTML(file.name)} · ${formatBytes(file.size)}</div>`;
  }
}
const fileLockIcons = [
  '<svg style="color:var(--invalid)" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path d="M127.5 0C164.779 0 195 30.2208 195 67.5V100H203C214.046 100 223 108.954 223 120V236C223 247.046 214.046 256 203 256H53C41.9543 256 33 247.046 33 236V120C33 108.954 41.9543 100 53 100H171V67.5C171 43.4756 151.524 24 127.5 24C108.827 24 92.9035 35.7654 86.7354 52.2871C84.5438 58.1571 79.4669 62.9998 73.2012 63C66.1356 63 60.4424 56.9668 62.2549 50.1377C69.9161 21.2721 96.2235 0 127.5 0Z"/></svg>',
  '<svg style="color:var(--valid)" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path d="M127.5 0C164.779 0 195 30.2208 195 67.5V100H203C214.046 100 223 108.954 223 120V236C223 247.046 214.046 256 203 256H53C41.9543 256 33 247.046 33 236V120C33 108.954 41.9543 100 53 100H60V67.5C60 30.2208 90.2208 0 127.5 0ZM127.5 24C103.476 24 84 43.4756 84 67.5V100H171V67.5C171 43.4756 151.524 24 127.5 24Z"/></svg>'
];
window.encryptionfile = (i, _this)=>{
  files[i].encrypted = !files[i].encrypted;
  _this.innerHTML = fileLockIcons[Number(files[i].encrypted)];
  _this.setAttribute('tlang', `message.file.${files[i].encrypted?'':'un'}encrypted`);
};
window.editfile = async(i)=>{
  try {
    files[i].name = await ask('message.file.editmenu', 1, 255, files[i].name);
  } catch(_) {
    // Ignore :3
  }
};
window.removefile = (i)=>{
  files.splice(i, 1);
  filePreview();
};
function filePreview() {
  document.getElementById('filepreview').innerHTML = files
    .map((file,i)=>`<div>
  <div class="action">
    ${window.currentChannelType!==3?`<button onclick="window.encryptionfile(${i}, this)" tlang="message.file.${file.encrypted?'':'un'}encrypted">${fileLockIcons[Number(file.encrypted)]}</button>`:''}
    <button onclick="window.editfile(${i})" tlang="message.file.edit"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path d="M207.747 76.6945L78.6819 239.376L25.8919 255.811C23.8543 256.445 21.8251 254.809 22.012 252.684L26.844 197.709L154.989 35.1261L207.747 76.6945ZM181.174 1.90541C182.887 -0.267858 186.04 -0.637017 188.208 1.08216L233.106 36.6876C235.269 38.4035 235.633 41.5486 233.916 43.712L215.969 66.3331L163.157 24.7619L181.174 1.90541Z"/></svg></button>
    <button onclick="window.removefile(${i})" tlang="message.file.remove"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path d="M42.6776 7.32227C32.9145 -2.44063 17.0852 -2.44077 7.32214 7.32227C-2.44082 17.0853 -2.44069 32.9146 7.32214 42.6777L92.2616 127.617L7.32214 212.557C-2.44091 222.32 -2.44083 238.149 7.32214 247.912C17.0852 257.675 32.9145 257.675 42.6776 247.912L127.617 162.973L212.557 247.912C222.32 257.675 238.149 257.675 247.912 247.912C257.675 238.149 257.675 222.32 247.912 212.557L162.973 127.617L247.912 42.6777C257.675 32.9146 257.675 17.0853 247.912 7.32227C238.149 -2.44079 222.32 -2.44068 212.557 7.32227L127.617 92.2617L42.6776 7.32227Z"/></svg></button>
  </div>
  ${elemfilepreview(file.file)}
</div>`)
    .join('');
  window.translate();
}
function addFiles(fils) {
  files = files.concat(fils.map(file=>{
    return {
      file,
      name: file.name,
      encrypted: true
    };
  }));
  files = files.filter(file=>{
    if (file.file.size>window.serverData[getCurrentServerUrl()].max_file_size.attachments) {
      notice('message.attachment.toobig', file.name);
      return false;
    }
    return true;
  });
  if (files.length>window.serverData[getCurrentServerUrl()].messages.max_attachments) {
    files = files.slice(0, window.serverData[getCurrentServerUrl()].messages.max_attachments);
    notice('message.attachment.toomany', window.serverData[getCurrentServerUrl()].messages.max_attachments);
  }
  filePreview();
}
fileInput.onchange = (evt)=>{
  addFiles(Array.from(evt.target.files));
  fileInput.value = '';
};
const recorderModal = document.getElementById('recorder');
let mediaRecorder;
let audioChunks = [];

recorderModal.querySelector('.toggle').onclick = async () => {
  if (mediaRecorder) {
    mediaRecorder.stop();
    recorderModal.querySelector('.toggle').setAttribute('tlang', 'message.voice.record');
    return;
  }
  recorderModal.querySelector('span').innerText = '';
  recorderModal.querySelector('.send').disabled = true;
  recorderModal.querySelector('.send').onclick = ()=>{};
  recorderModal.querySelector('.toggle').setAttribute('tlang', 'message.voice.stop');

  let canvas = recorderModal.querySelector('canvas');
  let ctx = canvas.getContext('2d');

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // View
  let audioContext = new AudioContext();
  let source = audioContext.createMediaStreamSource(stream);
  let analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  let dataArray = new Uint8Array(analyser.fftSize);
  source.connect(analyser);

  let volumes = Array.from({ length: 30 }, _=>0.01);
  let wait = 0;
  function getVolume() {
    if (!mediaRecorder) {
      audioContext.close();
      analyser.disconnect();
      return;
    }
    if (wait<2) {
      wait++;
      requestAnimationFrame(getVolume);
      return;
    }
    wait = 0;

    analyser.getByteTimeDomainData(dataArray);
    let rms = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = Math.min((dataArray[i]-128)/64, 1);
      rms += value * value;
    }
    rms = Math.max(Math.sqrt(rms/dataArray.length), 0.01);
    volumes.push(rms);
    if (volumes.length>30) volumes.shift();

    ctx.clearRect(0, 0, 300, 100);
    volumes.forEach((val,idx)=>{
      ctx.fillStyle = `hsl(${val*160}, 50%, 50%)`;
      ctx.beginPath();
      ctx.roundRect(10*idx+1, 100-val*100, 8, val*100, 10);
      ctx.fill();
    });
    requestAnimationFrame(getVolume);
  }
  // Record
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.start();
  mediaRecorder.ondataavailable = (evt)=>{
    audioChunks.push(evt.data);
  };
  mediaRecorder.onstop = async()=>{
    let blob = new Blob(audioChunks, { type: 'audio/webm' });
    let arrayBuffer = await blob.arrayBuffer();
    let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    recorderModal.querySelector('span').innerText = formatDuration(audioBuffer.duration);
    audioChunks = [];
    mediaRecorder = null;
    stream.getTracks().forEach(track=>track.stop());
    recorderModal.querySelector('.send').disabled = false;
    recorderModal.querySelector('.send').onclick = ()=>{
      addFiles([new File([blob], 'voice.webm', { type: 'audio/webm' })]);
      recorderModal.close();
    };
  };

  getVolume();
};
recorderModal.onclose = ()=>{
  if (mediaRecorder) mediaRecorder.stop();
  recorderModal.querySelector('.toggle').setAttribute('tlang', 'message.voice.record');
};
tippy(attachAdd, {
  allowHTML: true,
  content: `<button tlang="message.file"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M156.333 15.0465C156.333 11.4829 160.642 9.69822 163.162 12.2181L216.505 65.5612C219.025 68.0811 217.24 72.3896 213.677 72.3896H166.333C160.811 72.3896 156.333 67.9125 156.333 62.3896V15.0465Z"/><path d="M52.2895 5C41.6362 5 33 13.6362 33 24.2895V232.616C33 243.269 41.6362 251.905 52.2895 251.905H204.033C214.687 251.905 223.323 243.269 223.323 232.616V94.1579C223.323 87.5305 217.95 82.1579 211.323 82.1579H165.454C154.801 82.1579 146.165 73.5217 146.165 62.8684V17C146.165 10.3726 140.792 5 134.165 5H52.2895Z"/></svg> <span tlang="message.file">File</span></button>
<button tlang="message.voice"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="83" width="90" height="150" rx="45"/><path d="M53 95V105C53 146.421 86.5786 180 128 180C169.421 180 203 146.421 203 105V95" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M128 180V240" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M153 241H103" stroke-width="30" stroke-linecap="round" fill="none"/></svg> <span tlang="message.voice">Voice message</span></button>
<button tlang="message.embed"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M30 26C16.7452 26 6 36.7452 6 50V206C6 219.255 16.7452 230 30 230H226C239.255 230 250 219.255 250 206V50C250 36.7452 239.255 26 226 26H30ZM36 56H100V200H36V56ZM130 70H214V100H130V70ZM130 122H214V152H130V122ZM130 174H190V200H130V174Z"/></svg> <span tlang="message.embed">Build an embed</span></button>
<button tlang="message.diagram"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="10" y="10" width="80" height="50" rx="10"/><rect x="166" y="10" width="80" height="50" rx="10"/><rect x="88" y="196" width="80" height="50" rx="10"/><path d="M50 60V110C50 130 60 140 80 140H176C196 140 206 130 206 110V60" stroke-width="16" fill="none"/><path d="M128 140V196" stroke-width="16"/></svg> <span tlang="message.diagram">Insert diagram</span></button>
<button tlang="message.interactive"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M100 80L52 128L100 176" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M156 80L204 128L156 176" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> <span tlang="message.interactive">Insert interactive content</span></button>
<button id="ephemeralbtn" tlang="message.ephemeral"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M56 0C42.7452 0 32 10.7452 32 24V24C32 37.2548 42.7452 48 56 48H200C213.255 48 224 37.2548 224 24V24C224 10.7452 213.255 0 200 0H56Z"/><path d="M56 256C42.7452 256 32 245.255 32 232V232C32 218.745 42.7452 208 56 208H200C213.255 208 224 218.745 224 232V232C224 245.255 213.255 256 200 256H56Z"/><path d="M52 40H204C204 84 172 108 148 128C172 148 204 172 204 216H52C52 172 84 148 108 128C84 108 52 84 52 40Z"/></svg> <span tlang="message.ephemeral">Disappearing message</span> <span class="eph-value"></span></button>`,
  interactive: true,
  trigger: 'click',
  placement: 'top-start',
  onShow: (instance)=>{
    instance.popper.querySelector('[tlang="message.file"]').onclick = ()=>{
      instance.hide();
      fileInput.click();
    };
    instance.popper.querySelector('[tlang="message.voice"]').onclick = ()=>{
      instance.hide();
      if (mediaRecorder) mediaRecorder.stop();
      audioChunks = [];
      mediaRecorder = null;
      recorderModal.showModal();
    };
    instance.popper.querySelector('[tlang="message.embed"]').onclick = ()=>{
      instance.hide();
      openEmbedModal();
    };
    instance.popper.querySelector('[tlang="message.diagram"]').onclick = ()=>{
      instance.hide();
      openDiagramModal();
    };
    instance.popper.querySelector('[tlang="message.interactive"]').onclick = ()=>{
      instance.hide();
      openInteractiveModal();
    };
    instance.popper.querySelector('#ephemeralbtn').onclick = ()=>{
      let idx = ephemeralOrder.indexOf(ephemeralTTL);
      setEphemeralTTL(idx===ephemeralOrder.length-1?null:ephemeralOrder[idx+1]);
    };
  }
});
messageInput.onpaste = (evt)=>{
  let cd = evt.clipboardData??evt.originalEvent.clipboardData;
  let items = Array.from(cd.items).filter(item=>item.kind==='file').map(item=>item.getAsFile());
  if (items.length) { evt.preventDefault(); addFiles(items); return; }
  let text = cd.getData('text/plain');
  if (text) { evt.preventDefault(); let pos=mdGetCaret()?.[0]??messageInput.textContent.length, end=mdGetCaret()?.[1]??pos, v=messageInput.textContent; messageInput.value=v.slice(0,pos)+text+v.slice(end); messageInput.setSelectionRange(pos+text.length, pos+text.length); }
};
document.body.ondrop = (evt)=>{
  if (document.querySelector('dialog[open]')) return;
  evt.stopPropagation();
  evt.preventDefault();

  if (evt.dataTransfer.items) {
    for (let i = 0; i<evt.dataTransfer.items.length; i++) {
      if (evt.dataTransfer.items[i].kind!=='file') continue;
      addFiles([evt.dataTransfer.items[i].getAsFile()]);
    }
  } else {
    addFiles(evt.dataTransfer.files);
  }
};
document.body.ondragover = (evt)=>{
  if (document.querySelector('dialog[open]')) return;
  evt.preventDefault();
};
const emojiButton = document.getElementById('emoj');
const emojiPicker = document.querySelector('emoji-picker');
let reactionPickerTarget = null;
function closeEmojiPicker() {
  emojiPicker.style.display = 'none';
  reactionPickerTarget = null;
}
emojiButton.onclick = (event)=>{
  event.stopPropagation();
  if (emojiPicker.style.display===''&&!reactionPickerTarget) { closeEmojiPicker(); return; }
  reactionPickerTarget = null;
  emojiPicker.style.display = '';
  let b = emojiButton.getBoundingClientRect();
  emojiPicker.style.left = b.right+'px';
  emojiPicker.style.top = b.top+'px';
};
window.openReactionPicker = (event, el)=>{
  event.stopPropagation();
  if (emojiPicker.style.display===''&&reactionPickerTarget?.messageId===el.dataset.msgId) { closeEmojiPicker(); return; }
  reactionPickerTarget = { channelId: el.dataset.chId, messageId: el.dataset.msgId };
  emojiPicker.style.display = '';
  let b = el.getBoundingClientRect();
  emojiPicker.style.left = Math.min(b.right, window.innerWidth-320)+'px';
  emojiPicker.style.top = Math.min(b.top, window.innerHeight-420)+'px';
};
document.addEventListener('click', (evt)=>{
  if (!evt.target.isConnected) return;
  if (emojiPicker.style.display!=='') return;
  if (emojiPicker.contains(evt.target)) return;
  if (evt.target===emojiButton||evt.target.closest?.('[aria-label="Add reaction"]')) return;
  closeEmojiPicker();
});
emojiPicker.addEventListener('emoji-click', (evt)=>{
  if (reactionPickerTarget) {
    let { channelId, messageId } = reactionPickerTarget;
    let existing = document.querySelector(`.reaction-chip.mine[data-msg-id="${CSS.escape(messageId)}"][data-emoji="${CSS.escape(evt.detail.unicode)}"]`);
    if (existing) window.removeReaction(channelId, messageId, existing.dataset.mineId);
    else window.addReaction(channelId, messageId, evt.detail.unicode);
    closeEmojiPicker();
    return;
  }
  let emoji = `:${evt.detail.emoji.shortcodes.toSorted((a,b)=>a.length-b.length)[0]}:${evt.detail.skinTone!==0&&evt.detail.emoji.skins?`:tone${evt.detail.skinTone}:`:''}`;
  let start = messageInput.value.substring(0, messageCursorStart);
  let end = messageInput.value.substring(messageCursorEnd, messageInput.value.length);
  messageInput.value = start+emoji+end;
  messageCursorStart += emoji.length;
  messageCursorEnd = messageCursorStart;
});
window.toggleReaction = (el)=>{
  if (el.disabled) return;
  let { chId, msgId, emoji, mineId } = el.dataset;
  if (mineId) window.removeReaction(chId, msgId, mineId);
  else window.addReaction(chId, msgId, emoji);
};
window.addReaction = async(channelId, messageId, emoji)=>{
  let ch = window.channels.find(c=>c.id===channelId);
  if (!ch) return;
  let sdate = Math.ceil(Date.now()/1000);
  let signat = `${emoji}:${channelId}:${messageId}:${sdate}`;
  let skey = await getRSAKeyPair();
  let signature = await signRSAString(signat, skey.privateKey);
  let body = { content: emoji, timestamp: sdate, signature };
  if (ch.type!==3) {
    let { nkey, keyId } = await getChannelAESKey(channelId);
    let enc = await encryptAES(emoji, nkey);
    body.content = enc.data;
    body.key = keyId;
    body.iv = enc.iv;
  }
  backendfetch(`/api/v1/channel/${channelId}/message/${messageId}/reactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
};
window.removeReaction = (channelId, messageId, reactionId)=>{
  backendfetch(`/api/v1/channel/${channelId}/message/${messageId}/reactions/${reactionId}`, { method: 'DELETE' });
};
window.insertTimestampToken = ()=>{
  let popover = document.getElementById('tsgenPopover');
  let unix = Math.floor(new Date(popover.querySelector('input').value).getTime()/1000);
  if (isNaN(unix)) return;
  let token = `<t:${unix}:${popover.querySelector('select').value}>`;
  let start = messageInput.value.substring(0, messageCursorStart);
  let end = messageInput.value.substring(messageCursorEnd, messageInput.value.length);
  messageInput.value = start+token+end;
  messageCursorStart += token.length;
  messageCursorEnd = messageCursorStart;
  messageInput.oninput();
  tsgenButton._tippy.hide();
};
const tsgenButton = document.getElementById('tsgen');
tippy(tsgenButton, {
  allowHTML: true,
  content: `<div id="tsgenPopover" class="tsgen">
  <input type="datetime-local">
  <select>
    <option value="R" tlang="message.timestamp.R">Relative</option>
    <option value="t" tlang="message.timestamp.t">Short time</option>
    <option value="T" tlang="message.timestamp.T">Long time</option>
    <option value="d" tlang="message.timestamp.d">Short date</option>
    <option value="D" tlang="message.timestamp.D">Long date</option>
    <option value="f" tlang="message.timestamp.f">Short date & time</option>
    <option value="F" tlang="message.timestamp.F">Long date & time</option>
    <option value="s" tlang="message.timestamp.s">Date & time</option>
    <option value="S" tlang="message.timestamp.S">Date & time (with seconds)</option>
  </select>
  <button onclick="window.insertTimestampToken()" tlang="message.timestamp.insert">Insert</button>
</div>`,
  interactive: true,
  trigger: 'click',
  placement: 'top-end',
  onShow(instance) {
    let input = instance.popper.querySelector('input');
    let now = new Date(Date.now()-(new Date()).getTimezoneOffset()*60000);
    input.value = now.toISOString().slice(0, 16);
    window.translate?.();
  }
});
const embedModal = document.getElementById('embed-modal');
const embedFieldsList = document.getElementById('eb-fields');
const embedPreview = document.getElementById('eb-preview');
function embedFieldRow() {
  let row = document.createElement('div');
  row.className = 'eb-fieldrow';
  row.innerHTML = `<input class="eb-fname" maxlength="256" tlang="embed.field.name" placeholder="Name">
  <input class="eb-fvalue" maxlength="1024" tlang="embed.field.value" placeholder="Value">
  <label class="eb-check"><input class="eb-finline" type="checkbox"><span tlang="embed.field.inline">Inline</span></label>
  <button type="button" class="eb-removefield" aria-label="Remove" tlang="embed.removefield"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><rect y="103" width="256" height="50" rx="25"/></svg></button>`;
  row.querySelector('.eb-removefield').onclick = ()=>{ row.remove(); updateEmbedPreview(); };
  row.querySelectorAll('input').forEach(inp=>{ inp.oninput = inp.onchange = updateEmbedPreview; });
  return row;
}
function buildEmbedObject() {
  let embed = {};
  let title = document.getElementById('eb-title').value.trim();
  let url = document.getElementById('eb-url').value.trim();
  let description = document.getElementById('eb-description').value.trim();
  if (title) embed.title = title;
  if (url) embed.url = url;
  if (description) embed.description = description;
  embed.color = document.getElementById('eb-color').value;
  let author = {};
  let aname = document.getElementById('eb-author-name').value.trim();
  let aurl = document.getElementById('eb-author-url').value.trim();
  if (aname) author.name = aname;
  if (aurl) author.url = aurl;
  if (embedImageAssets['eb-author-icon']) author.icon_url = embedImageAssets['eb-author-icon'];
  if (Object.keys(author).length) embed.author = author;
  let footer = {};
  let ftext = document.getElementById('eb-footer-text').value.trim();
  if (ftext) footer.text = ftext;
  if (embedImageAssets['eb-footer-icon']) footer.icon_url = embedImageAssets['eb-footer-icon'];
  if (Object.keys(footer).length) embed.footer = footer;
  if (embedImageAssets['eb-image']) embed.image = embedImageAssets['eb-image'];
  if (embedImageAssets['eb-thumbnail']) embed.thumbnail = embedImageAssets['eb-thumbnail'];
  if (document.getElementById('eb-timestamp').checked) embed.timestamp = Math.floor(Date.now()/1000);
  let fields = [];
  embedFieldsList.querySelectorAll('.eb-fieldrow').forEach(row=>{
    let name = row.querySelector('.eb-fname').value.trim();
    let value = row.querySelector('.eb-fvalue').value.trim();
    if (!name&&!value) return;
    let field = {};
    if (name) field.name = name;
    if (value) field.value = value;
    if (row.querySelector('.eb-finline').checked) field.inline = true;
    fields.push(field);
  });
  if (fields.length) embed.fields = fields;
  return embed;
}
function updateEmbedPreview() {
  embedPreview.innerHTML = renderEmbed(buildEmbedObject());
}
document.getElementById('eb-addfield').onclick = ()=>{ embedFieldsList.appendChild(embedFieldRow()); window.translate?.(); };
document.getElementById('eb-insert').onclick = ()=>{
  let embed = buildEmbedObject();
  if (!Object.keys(embed).filter(k=>k!=='color').length) { notice('embed.empty'); return; }
  let token = `\n! embed: ${JSON.stringify(embed)}\n`;
  let start = messageInput.value.substring(0, messageCursorStart);
  let end = messageInput.value.substring(messageCursorEnd, messageInput.value.length);
  messageInput.value = start+token+end;
  messageCursorStart += token.length;
  messageCursorEnd = messageCursorStart;
  messageInput.oninput();
  embedModal.close();
};
let embedImageAssets = {};
function openEmbedModal() {
  embedModal.querySelectorAll('input, textarea').forEach(inp=>{
    if (inp.type==='checkbox') inp.checked = false;
    else if (inp.type!=='color') inp.value = '';
  });
  document.getElementById('eb-color').value = '#9d7bff';
  embedFieldsList.innerHTML = '';
  embedImageAssets = {};
  embedModal.querySelectorAll('.eb-clear').forEach(btn=>{ btn.style.display = 'none'; });
  updateEmbedPreview();
  window.translate?.();
  embedModal.showModal();
}
embedModal.querySelectorAll('input:not([type=color]):not([readonly]), textarea').forEach(inp=>{ inp.oninput = updateEmbedPreview; });
document.getElementById('eb-color').oninput = updateEmbedPreview;
const ebImgFile = document.getElementById('eb-imgfile');
let ebImgFileTarget = null;
embedModal.querySelectorAll('.eb-upload').forEach(btn=>{
  btn.onclick = ()=>{ ebImgFileTarget = btn.dataset.for; ebImgFile.click(); };
});
embedModal.querySelectorAll('.eb-clear').forEach(btn=>{
  btn.onclick = ()=>{
    let target = btn.dataset.for;
    delete embedImageAssets[target];
    document.getElementById(target).value = '';
    btn.style.display = 'none';
    updateEmbedPreview();
  };
});
ebImgFile.onchange = async()=>{
  let file = ebImgFile.files[0];
  ebImgFile.value = '';
  if (!file||!ebImgFileTarget) return;
  let target = ebImgFileTarget;
  let field = document.getElementById(target);
  field.value = await getTranslation('embed.uploading');
  try {
    let channel = window.currentChannel;
    let encrypted = window.currentChannelType!==3;
    let formData = new FormData();
    let keyId = null;
    if (encrypted) {
      let key = await getChannelAESKey(channel);
      keyId = key.keyId;
      let enc = await encryptAES(await file.arrayBuffer(), key.nkey);
      formData.append('image', new File([enc.data], file.name, { type: file.type }));
      formData.append('encrypted', '1');
      formData.append('key', keyId);
      formData.append('iv', enc.iv);
    } else {
      formData.append('image', file, file.name);
    }
    let res = await backendfetch(`/api/v1/channel/${channel}/embed-asset`, { method: 'POST', body: formData });
    if (!res.success) { notice('embed.upload.failed'); field.value = ''; return; }
    embedImageAssets[target] = { id: res.id, encrypted: res.encrypted, iv: res.iv, key: res.encrypted?keyId:undefined, mimetype: file.type };
    field.value = file.name;
    embedModal.querySelector(`.eb-clear[data-for="${target}"]`).style.display = '';
    updateEmbedPreview();
  } catch {
    notice('embed.upload.failed');
    field.value = '';
  }
};

const diagramModal = document.getElementById('diagram-modal');
const dgPreview = document.getElementById('dg-preview');
function updateDiagramPreview() {
  let code = document.getElementById('dg-code').value.trim();
  dgPreview.innerHTML = code?renderDiagram({code}):'';
}
document.getElementById('dg-code').oninput = updateDiagramPreview;
document.getElementById('dg-insert').onclick = ()=>{
  let code = document.getElementById('dg-code').value.trim();
  if (!code) { notice('diagram.empty'); return; }
  let token = `\n! diagram: ${JSON.stringify({code})}\n`;
  let start = messageInput.value.substring(0, messageCursorStart);
  let end = messageInput.value.substring(messageCursorEnd, messageInput.value.length);
  messageInput.value = start+token+end;
  messageCursorStart += token.length;
  messageCursorEnd = messageCursorStart;
  messageInput.oninput();
  diagramModal.close();
};
function openDiagramModal() {
  document.getElementById('dg-code').value = '';
  dgPreview.innerHTML = '';
  diagramModal.showModal();
}

const interactiveModal = document.getElementById('interactive-modal');
const iaPreview = document.getElementById('ia-preview');
function updateInteractivePreview() {
  let html = document.getElementById('ia-html').value;
  let css = document.getElementById('ia-css').value;
  let js = document.getElementById('ia-js').value;
  iaPreview.innerHTML = (html||css||js)?renderInteractive({html, css, js}):'';
}
['ia-html','ia-css','ia-js'].forEach(id=>{ document.getElementById(id).oninput = updateInteractivePreview; });
document.getElementById('ia-insert').onclick = ()=>{
  let html = document.getElementById('ia-html').value;
  let css = document.getElementById('ia-css').value;
  let js = document.getElementById('ia-js').value;
  if (!html&&!css&&!js) { notice('interactive.empty'); return; }
  let token = `\n! interactive: ${JSON.stringify({html, css, js})}\n`;
  let start = messageInput.value.substring(0, messageCursorStart);
  let end = messageInput.value.substring(messageCursorEnd, messageInput.value.length);
  messageInput.value = start+token+end;
  messageCursorStart += token.length;
  messageCursorEnd = messageCursorStart;
  messageInput.oninput();
  interactiveModal.close();
};
function openInteractiveModal() {
  document.getElementById('ia-html').value = '';
  document.getElementById('ia-css').value = '';
  document.getElementById('ia-js').value = '';
  iaPreview.innerHTML = '';
  interactiveModal.showModal();
}

async function EditMessage(channel, msg, content, sign, iv=null) {
  let formData = new FormData();
  // Data
  formData.append('content', content);
  if (iv) formData.append('iv', iv);
  let embedAssetIds = extractEmbedAssetIds(sign);
  if (embedAssetIds.length) formData.append('embed_asset_ids', JSON.stringify(embedAssetIds));
  // Signature
  let sdate = Math.ceil(Date.now()/1000);
  let signat = `${sign}:${channel}:${sdate}`;
  let skey = await getRSAKeyPair();
  let signature = await signRSAString(signat, skey.privateKey);
  formData.append('timestamp', sdate);
  formData.append('signature', signature);
  // Send
  backendfetch(`/api/v1/channel/${channel}/message/${msg}`, {
    method: 'PATCH',
    body: formData
  });
}
function CryptEditMessage(channel, msg, content, key) {
  getKeyContents(channel, key, async()=>{
    const privateKey = (await getRSAKeyPair()).privateKey;
    let nkey = await base64ToAESKey(await decryptRSAString(window.keys[channel][key].key, privateKey));
    let enc = await encryptAES(content, nkey);
    EditMessage(channel, msg, enc.data, content, enc.iv);
  });
}

window.replyMessage = (msg, usr)=>{
  reply = msg;
  document.getElementById('replypreview').style.display = '';
  document.querySelector('#replypreview .usr').innerText = usr;
  messageInput.focus();
};
window.closereply = ()=>{
  reply = null;
  document.getElementById('replypreview').style.display = 'none';
};
window.pinMessage = (msg, state=true)=>{
  backendfetch(`/api/v1/channel/${window.currentChannel}/message/${msg}/pin`, {
    method: state?'POST':'DELETE'
  });
};
window.editMessage = (msg, key, elem, cont)=>{
  if (elem.querySelector('.save')) {
    elem.querySelector('textarea').focus();
    return;
  }
  elem.querySelector('.msgbody').outerHTML = `<div class="mdbar editbar show">${mdToolbarButtons()}</div>
<textarea name="message" class="content" maxlength="${window.serverData[getCurrentServerUrl()]?.messages?.max_message_length??2000}"></textarea>
<div class="mdpreview editpreview"></div>
<div>
  <button class="save" tlang="message.edit.save">Save</button>
  <button class="cancel" tlang="message.edit.cancel">Cancel</button>
</div>`;
  elem.querySelector('.actions').style.display = 'none';
  let textarea = elem.querySelector('textarea');
  textarea.addEventListener('keydown', window.handleMarkdownKeys);
  textarea.value = desanitizeAttr(cont);
  wireMdBar(elem.querySelector('.editbar'), textarea);
  mdLivePreview(textarea, elem.querySelector('.editpreview'));
  window.translate?.();
  textarea.focus();
  textarea.oninput = textarea.onchange = ()=>{
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight-4, 16 * 10) + 'px';
  };
  textarea.oninput();
  elem.querySelector('button.save').onclick = async()=>{
    textarea.value = textarea.value.trim();
    if (textarea.value===desanitizeAttr(cont)) {
      elem.querySelector('button.cancel').onclick();
      return;
    }
    if (!textarea.value) {
      if (!await affirm('message.delete.empty')) return;
      window.deleteMessage(msg);
      elem.querySelector('button.cancel').onclick();
      return;
    }
    if (window.currentChannelType===3) {
      EditMessage(window.currentChannel, msg, textarea.value, textarea.value);
    } else {
      CryptEditMessage(window.currentChannel, msg, textarea.value, key);
    }
  };
  elem.querySelector('button.cancel').onclick = async()=>{
    elem.parentElement.outerHTML = await displayMessage(window.messages[window.currentChannel].find(m=>m.id===msg), window.channels.find(ch=>ch.id===window.currentChannel));
  };
  textarea.onkeydown = (evt)=>{
    if (evt.key==='Enter'&&!evt.shiftKey) {
      evt.preventDefault();
      elem.querySelector('button.save').onclick();
    } else if (evt.key==='Escape') {
      elem.querySelector('button.cancel').onclick();
    }
  };
};
window.deleteMessage = (msg)=>{
  backendfetch('/api/v1/channel/'+window.currentChannel+'/message/'+msg, {
    method: 'DELETE'
  });
};
window.mentionUser = (username)=>{
  let pos = messageInput.selectionStart??messageInput.value.length;
  let ins = '@'+username+' ';
  messageInput.value = messageInput.value.slice(0, pos)+ins+messageInput.value.slice(pos);
  messageInput.focus();
  messageInput.setSelectionRange(pos+ins.length, pos+ins.length);
  messageInput.onkeyup();
};
window.previewMessage = (msg)=>{
  let m = document.getElementById(`m-${msg}`);
  if (!m) return;
  m.scrollIntoView({ behavior: 'smooth' });
  m.classList.add('highlight');
  setTimeout(()=>{
    m.classList.remove('highlight');
  }, 500);
};

window.expandMedia = (url)=>{
  let modal = document.getElementById('expandedmedia');
  let img = modal.querySelector('img');
  modal.showModal();
  // Image handeling
  img.src = url;
  let x = 0;
  let y = 0;
  let scale = 1;
  let prevDist = 1;
  let pointers = new Map();
  let setStyle = ()=>{
    scale = Math.max(Math.min(scale, 10), 0.25);
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale*scale})`;
  };
  setStyle();
  modal.onwheel = (evt)=>{
    scale -= evt.deltaY/1000;
    setStyle();
  };
  modal.querySelector('.minus').onclick = ()=>{
    scale -= 0.5;
    setStyle();
  };
  modal.querySelector('.plus').onclick = ()=>{
    scale += 0.5;
    setStyle();
  };
  modal.onpointerdown = (evt)=>{
    if (!['DIALOG','IMG'].includes(evt.target.tagName)) return;
    modal.setPointerCapture(evt.pointerId);
    pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (pointers.size === 2) {
      const [p1, p2] = Array.from(pointers.values());
      prevDist = Math.hypot(p1.x-p2.x, p1.y-p2.y);
    }
  };
  modal.onpointermove = (evt)=>{
    if (!pointers.has(evt.pointerId)) return;
    if (pointers.size===2) {
      pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      const [p1, p2] = Array.from(pointers.values());
      let dist = Math.hypot(p1.x-p2.x, p1.y-p2.y);
      scale *= dist / prevDist;
      prevDist = dist;
    } else {
      let dat = pointers.get(evt.pointerId);
      x += evt.clientX-dat.x;
      y += evt.clientY-dat.y;
      pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    }
    setStyle();
  };
  modal.onpointerup = modal.onpointercancel = (evt)=>{
    if (!pointers.has(evt.pointerId)) return;
    modal.releasePointerCapture(evt.pointerId);
    pointers.delete(evt.pointerId);
  };
  // Cleanup and clear image
  modal.onclose = ()=>{
    pointers = null;
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  };
};

class MediaCom extends HTMLElement {
  constructor() {
    super();
  }
  static observedAttributes = ['load'];
  connectedCallback() {
    let preview = this.getAttribute('data-previewurl');
    if (!preview&&saveData()) {
      this.innerHTML = `<div class="file">
  <span>${sanitizeHTML(desanitizeAttr(this.getAttribute('data-name')))} · ${formatBytes(this.getAttribute('data-size'))}</span>
  <button onclick="this.parentElement.parentElement.setAttribute('load',true)" tlang="message.download" style="margin-top:10px;padding:5px;background-color:var(--bg-2);">Download</button>
</div>`;
    } else {
      this.setAttribute('load',true);
    }
  }
  async attributeChangedCallback() {
    let type = this.getAttribute('type');
    let encrypted = this.getAttribute('data-encrypted')==='true';
    let id = this.getAttribute('data-id');
    let preview = this.getAttribute('data-previewurl')||FileStore.get(id);
    let src = preview??`${getCurrentServerUrl()}/attachment/${id}`;
    let data;
    if (type==='text'||(encrypted&&!preview)) {
      data = await fetch(src);
      data = await data.text();
    }
    if (encrypted&&!preview) {
      const privateKey = (await getRSAKeyPair()).privateKey;
      let nkey = await base64ToAESKey(await decryptRSAString(window.keys[window.currentChannel][this.getAttribute('data-key')].key, privateKey));
      data = await decryptAES(data, nkey, this.getAttribute('data-iv'));
    }
    if (type==='text') {
      if (data instanceof ArrayBuffer) data = (new TextDecoder()).decode(data);
      let rawName = desanitizeAttr(this.getAttribute('data-name'));
      this.innerHTML = `<div class="file">
  <span>${sanitizeHTML(rawName)} · ${formatBytes(this.getAttribute('data-size'))} ${encrypted?'<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path d="M127.5 0C164.779 0 195 30.2208 195 67.5V100H203C214.046 100 223 108.954 223 120V236C223 247.046 214.046 256 203 256H53C41.9543 256 33 247.046 33 236V120C33 108.954 41.9543 100 53 100H60V67.5C60 30.2208 90.2208 0 127.5 0ZM127.5 24C103.476 24 84 43.4756 84 67.5V100H171V67.5C171 43.4756 151.524 24 127.5 24Z"/></svg>':''}<div style="flex:1"></div><button data-id="${sanitizeMinimChars(id)}" data-name="${sanitizeAttr(rawName)}" onclick="window.downloadfile(this.dataset.id, this.dataset.name)" aria-label="Download" tlang="message.download"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M128 190V20" stroke-width="40" stroke-linecap="round" fill="none"/><path d="M127.861 212.999C131.746 213.035 135.642 211.571 138.606 208.607L209.317 137.896C212.291 134.922 213.753 131.011 213.708 127.114C213.708 127.076 213.71 127.038 213.71 127C213.71 118.716 206.994 112 198.71 112H57C48.7157 112 42 118.716 42 127C42 127.045 42.0006 127.089 42.001 127.134C41.961 131.024 43.4252 134.927 46.3936 137.896L117.104 208.607L117.381 208.876C120.312 211.662 124.092 213.037 127.861 212.999Z"/><rect y="226" width="256" height="30" rx="15"/></svg></button></span>
  ${sanitizeHTML(data)}
</div>`;
    } else if (type==='audio') {
      if (!FileStore.has(id)&&data) FileStore.set(id, URL.createObjectURL(new Blob([data], { type: this.getAttribute('data-fulltype') })));
      renderAudioMessage(this, FileStore.get(id)??src, id, desanitizeAttr(this.getAttribute('data-name')));
      window.translate();
    } else {
      if (!FileStore.has(id)&&data) FileStore.set(id, URL.createObjectURL(new Blob([data], { type: this.getAttribute('data-fulltype') })));
      this.outerHTML =`<${type} data-id="${sanitizeMinimChars(id)}" data-fulltype="${sanitizeHTML(this.getAttribute('data-fulltype'))}" src="${FileStore.get(id)??src}" alt="Message attachment: ${sanitizeHTML(this.getAttribute('data-name'))}" controls draggable="false" loading="lazy"${type==='img'?` role="button" tabindex="0" aria-haspopup="dialog" onclick="window.expandMedia('${FileStore.get(id)??src}')" onkeydown="if([' ','Enter'].includes(event.key))window.expandMedia('${FileStore.get(id)??src}');" tlang="message.expandmedia"`:''}></${type}>`.replace('</img>','');
      window.translate();
    }
  }
}
function apFmt(t){t=Math.max(0,t|0);return Math.floor(t/60)+":"+String(t%60).padStart(2,"0")}
async function apPeaks(src, buckets){
  try{
    let ctx = window.__apctx??(window.__apctx=new (window.AudioContext||window.webkitAudioContext)());
    let ab = await ctx.decodeAudioData(await (await fetch(src)).arrayBuffer());
    let ch = ab.getChannelData(0), block = Math.floor(ch.length/buckets)||1, peaks = [], max = 0.0001;
    for (let i=0;i<buckets;i++){ let s=0, o=i*block; for (let j=0;j<block;j++){ let v=Math.abs(ch[o+j]||0); if (v>s) s=v; } peaks.push(s); if (s>max) max=s; }
    return { peaks: peaks.map(p=>Math.max(p/max, 0.06)), duration: ab.duration };
  }catch(e){ return null; }
}
function apDraw(canvas, peaks, progress, accent, muted){
  let ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio||1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w||!h) return;
  if (canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){ canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  let n = peaks.length, bw = w/n, bar = Math.max(bw*0.55, 2);
  for (let i=0;i<n;i++){
    let ph = Math.max((peaks[i]||0)*(h-4), 3), x = i*bw+(bw-bar)/2, y = (h-ph)/2;
    ctx.fillStyle = ((i+0.5)/n)<=progress?accent:muted;
    ctx.beginPath();
    ctx.roundRect(x, y, bar, ph, bar/2);
    ctx.fill();
  }
}
function renderAudioMessage(el, src, id, name){
  let cs = getComputedStyle(document.documentElement);
  let accent = cs.getPropertyValue("--accent").trim()||"#9d7bff", muted = cs.getPropertyValue("--text-3").trim()||"#8a84a1";
  el.innerHTML = `<div class="audioplayer"><button class="ap-play" aria-label="Play"><svg class="ap-i-play" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg><svg class="ap-i-pause" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg></button><canvas class="ap-wave"></canvas><span class="ap-time">0:00</span><button class="ap-dl" data-id="${sanitizeMinimChars(id)}" data-name="${sanitizeAttr(name)}" onclick="window.downloadfile(this.dataset.id,this.dataset.name)" aria-label="Download" tlang="message.download"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path d="M128 190V20" stroke="currentColor" stroke-width="40" stroke-linecap="round" fill="none"/><path d="M42 127H214L128 213Z" fill="currentColor"/><rect y="226" width="256" height="30" rx="15" fill="currentColor"/></svg></button></div>`;
  let root = el.querySelector(".audioplayer"), canvas = root.querySelector(".ap-wave"), playBtn = root.querySelector(".ap-play"), iPlay = root.querySelector(".ap-i-play"), iPause = root.querySelector(".ap-i-pause"), timeEl = root.querySelector(".ap-time");
  let audio = new Audio(src), peaks = Array.from({length:56}, ()=>0.14), dur = 0, raf = 0;
  let redraw = ()=>apDraw(canvas, peaks, dur?audio.currentTime/dur:0, accent, muted);
  let loop = ()=>{ redraw(); timeEl.innerText=apFmt(dur?dur-audio.currentTime:audio.currentTime); if (!audio.paused) raf=requestAnimationFrame(loop); };
  apPeaks(src, 56).then(r=>{ if (r){ peaks=r.peaks; if (r.duration&&isFinite(r.duration)){ dur=r.duration; timeEl.innerText=apFmt(dur); } } redraw(); });
  audio.onloadedmetadata = ()=>{ if (!dur&&isFinite(audio.duration)){ dur=audio.duration; timeEl.innerText=apFmt(dur); } };
  audio.onplay = ()=>{ iPlay.style.display="none"; iPause.style.display=""; playBtn.setAttribute("aria-label","Pause"); cancelAnimationFrame(raf); loop(); };
  audio.onpause = ()=>{ iPlay.style.display=""; iPause.style.display="none"; playBtn.setAttribute("aria-label","Play"); cancelAnimationFrame(raf); redraw(); };
  audio.onended = ()=>{ audio.currentTime=0; timeEl.innerText=apFmt(dur); redraw(); };
  audio.ontimeupdate = ()=>{ if (audio.paused){ redraw(); } };
  playBtn.onclick = ()=>{ if (audio.paused) audio.play(); else audio.pause(); };
  canvas.onclick = (ev)=>{ let rct=canvas.getBoundingClientRect(), x=Math.min(Math.max((ev.clientX-rct.left)/rct.width, 0), 1); if (dur){ audio.currentTime=x*dur; redraw(); } };
  new ResizeObserver(redraw).observe(canvas);
  requestAnimationFrame(redraw);
}
customElements.define('media-com', MediaCom);

async function renderInvitePreviewInfo(res) {
  let memberstr = (await getTranslation('invite.members')).replace('{}', res.member_count);
  return `<img src="${res.pfp?pfpById(res.pfp):userToDefaultPfp(res)}" width="48" height="48" aria-hidden="true" onerror="this.src='${userToDefaultPfp(res)}'"><div class="invite-preview-body"><span class="invite-preview-name">${sanitizeHTML(res.name||'Unknown')}</span><span class="invite-preview-meta">${sanitizeHTML(memberstr)}</span></div>`;
}
window.joinInviteCode = async(code, btn)=>{
  btn.disabled = true;
  let req = await backendfetch('/api/v1/channels/invite/'+encodeURIComponent(code), { method: 'POST', passstatus: true });
  if (req.status===403) { notice('channel.banned'); btn.disabled = false; return; }
  if (req.channel_id) {
    await getChannels();
    loadChannel(req.channel_id);
    btn.setAttribute('tlang', 'invite.joined');
    btn.setAttribute('disabled', true);
    window.translate();
  } else {
    notice('error.generic');
    btn.disabled = false;
  }
};
class InviteCom extends HTMLElement {
  async connectedCallback() {
    let code = this.getAttribute('data-code');
    let res = await backendfetch('/api/v1/channels/invite/'+encodeURIComponent(code), { passstatus: true }).catch(()=>null);
    if (!res||!res.success) { this.remove(); return; }
    this.innerHTML = `${await renderInvitePreviewInfo(res)}${res.is_member?`<button disabled class="invite-preview-btn" tlang="invite.joined">Joined</button>`:`<button class="invite-preview-btn" onclick="window.joinInviteCode('${sanitizeMinimChars(code)}', this)" tlang="invite.join">Join</button>`}`;
    window.translate();
  }
}
customElements.define('invite-com', InviteCom);

window.downloadfile = (id, name)=>{
  fetch(`${getCurrentServerUrl()}/attachment/${id}`)
    .then(res=>res.blob())
    .then(res=>{
      let url = URL.createObjectURL(res);
      let down = document.createElement('a');
      down.href = url;
      down.download = desanitizeAttr(name);
      document.body.appendChild(down);
      down.click();
      URL.revokeObjectURL(url);
    });
};
window.copyAttachment = async(el)=>{
  try {
    let blob = await(await fetch(el.src)).blob();
    try {
      await navigator.clipboard.write([new ClipboardItem({[el.dataset.fulltype||blob.type]: blob})]);
    } catch(err) {
      let bitmap = await createImageBitmap(blob);
      let canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      let png = await new Promise(res=>canvas.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({'image/png': png})]);
    }
  } catch(err) {
    notice('error.generic');
  }
};

let MDCustom = (txt, reserve=(t)=>t)=>{
  // User mentions
  txt = txt
    .replaceAll(/@([a-zA-Z0-9_\-]{3,20}|e)(?=$|\s|\*|\_|\~|<|@)/gi, (match)=>reserve(`<span class="mention">${match}</span>`));
  // Invite mentions
  txt = txt
    .replaceAll(/#([a-zA-Z0-9_\-]{3,20})(?=$|\s|\*|\_|\~|<|#)/g, (match)=>reserve(`<span class="mention">${match}</span>`));
  // Emoji
  txt = txt
    .replaceAll(/:([a-zA-Z0-9_<!%&\?\*\+\.\- ]+?):/g, (match,g1)=>window.emojiShort[g1.toLowerCase()]??match);
  txt = twemoji.parse(txt, twemojiConfig);
  return txt;
};

const textdisplay = ['text/plain','text/html','text/css','text/csv','text/tab-separated-values','text/markdown','text/x-markdown','text/xml','application/xhtml+xml','text/javascript','text/ecmascript','text/x-python','text/x-c','text/x-c++','text/x-java','text/x-java-source','text/x-rustsrc','text/x-go','text/x-php','text/x-perl','text/x-ruby','text/x-lua','text/vcard','text/vcalendar','text/calendar','text/x-vcard','text/x-vcalendar','application/json','application/ld+json','application/xml','application/javascript','application/ecmascript','application/x-www-form-urlencoded','application/yaml','application/x-yaml','text/x-yaml','application/graphql','application/sql','application/toml','application/x-toml','text/x-toml','application/ini','text/x-ini','application/x-sh','application/x-httpd-php'];
function attachToElem(att, key) {
  let data = ` data-fulltype="${sanitizeHTML(att.mimetype)}" data-id="${sanitizeMinimChars(att.id)}" data-name="${sanitizeAttr(att.filename)}" data-size="${sanitizeMinimChars(att.size.toString())}" data-encrypted="${sanitizeMinimChars(att.encrypted.toString())}"${att.encrypted?` data-iv="${(att.iv??'').replaceAll(/[^a-zA-Z0-9\+\/\=]/g,'')}" data-key="${sanitizeMinimChars(key??'')}"`:''}${att.previewUrl?` data-previewurl="${att.previewUrl}"`:''}`;
  if (textdisplay.includes(att.mimetype)) return `<media-com type="text"${data}></media-com>`;
  let type = att.mimetype.split('/')[0];
  switch(type) {
    case 'image':
    case 'video':
    case 'audio':
      return `<media-com type="${type.replace('age','g')}"${data}></media-com>`;
    default:
      return `<div class="file"><span>${sanitizeHTML(att.filename)} · ${formatBytes(att.size)} <button data-id="${sanitizeMinimChars(att.id)}" data-name="${sanitizeAttr(att.filename)}" onclick="window.downloadfile(this.dataset.id, this.dataset.name)" aria-label="Download" tlang="message.download"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M128 190V20" stroke-width="40" stroke-linecap="round" fill="none"/><path d="M127.861 212.999C131.746 213.035 135.642 211.571 138.606 208.607L209.317 137.896C212.291 134.922 213.753 131.011 213.708 127.114C213.708 127.076 213.71 127.038 213.71 127C213.71 118.716 206.994 112 198.71 112H57C48.7157 112 42 118.716 42 127C42 127.045 42.0006 127.089 42.001 127.134C41.961 131.024 43.4252 134.927 46.3936 137.896L117.104 208.607L117.381 208.876C120.312 211.662 124.092 213.037 127.861 212.999Z"/><rect y="226" width="256" height="30" rx="15"/></svg></button></span></div>`;
  }
}
function decodeMessage(msg, ch=window.currentChannel) {
  return new Promise((resolve, reject)=>{
    getKeyContents(ch, msg.key, async()=>{
      try {
        const privateKey = (await getRSAKeyPair()).privateKey;
        let nkey = await base64ToAESKey(await decryptRSAString(window.keys[ch][msg.key].key, privateKey));
        let dec = (new TextDecoder()).decode(await decryptAES(msg.content, nkey, msg.iv));
        resolve(dec);
      } catch(err) {
        // A single undecryptable message (bad key, rotated key, or malformed ciphertext from a
        // misbehaving backend) must not crash rendering with an uncaught rejection.
        console.warn('Could not decrypt message', msg.id, err);
        resolve('...');
      }
    });
  });
}
function decodeReaction(r, ch) {
  if (!(r.content&&r.key&&r.iv)) return Promise.resolve(r.content);
  return new Promise(resolve=>{
    getKeyContents(ch, r.key, async()=>{
      try {
        const privateKey = (await getRSAKeyPair()).privateKey;
        let nkey = await base64ToAESKey(await decryptRSAString(window.keys[ch][r.key].key, privateKey));
        resolve((new TextDecoder()).decode(await decryptAES(r.content, nkey, r.iv)));
      } catch(err) {
        console.warn('Could not decrypt reaction', r.id, err);
        resolve(null);
      }
    });
  });
}
async function buildReactionsHtml(msg, ch) {
  if (!msg.reactions?.length) return '';
  let canReact = hasPerm(ch.permission, Permissions.ADD_REACTIONS);
  let decoded = (await Promise.all(msg.reactions.map(async r=>{
    let content = await decodeReaction(r, ch.id);
    if (content==null) return null;
    let verified = null;
    if (r.signature&&r.user?.username&&PKStore.has(r.user.username)) {
      verified = await verifyRSAString(`${content}:${ch.id}:${msg.id}:${r.signed_timestamp}`, r.signature, await getRSAKeyFromPublic64(PKStore.get(r.user.username)));
    }
    return {...r, decoded: content, verified};
  }))).filter(Boolean);
  if (!decoded.length) return '';
  let groups = new Map();
  for (let r of decoded) {
    if (!groups.has(r.decoded)) groups.set(r.decoded, []);
    groups.get(r.decoded).push(r);
  }
  let chips = [...groups.entries()].map(([emoji, reactions])=>{
    let mine = reactions.find(r=>r.user?.username===window.username);
    let unverified = reactions.some(r=>r.signature&&r.user?.username&&r.verified===false);
    let names = reactions.map(r=>r.user?.display??r.user?.username).filter(Boolean).join(', ');
    return `<button class="reaction-chip${mine?' mine':''}"${canReact?'':' disabled'} data-emoji="${sanitizeAttr(emoji)}" data-msg-id="${sanitizeMinimChars(msg.id)}" data-ch-id="${sanitizeMinimChars(ch.id)}" data-mine-id="${sanitizeMinimChars(mine?.id??'')}" title="${sanitizeAttr(names)}" onclick="window.toggleReaction(this)">${sanitizeHTML(emoji)}<span class="reaction-count">${reactions.length}</span>${unverified?`<span class="reaction-unverified" aria-label="Could not verify one or more of these reactions" title="Could not verify one or more of these reactions" tlang="message.reaction.unverified">!</span>`:''}</button>`;
  }).join('');
  return `<div class="msg-reactions">${chips}</div>`;
}
function uiLocale() {
  return localStorage.getItem('timeUILang')==='true'?localStorage.getItem('language'):navigator.language;
}
function safeEmbedUrl(url) {
  if (typeof url!=='string') return null;
  try {
    let u = new URL(url, location.href);
    return (u.protocol==='http:'||u.protocol==='https:')?sanitizeAttr(u.href):null;
  } catch { return null; }
}
function safeEmbedImage(val) {
  if (!val||typeof val!=='object'||typeof val.id!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(val.id)) return null;
  let encrypted = !!val.encrypted;
  let iv = encrypted&&typeof val.iv==='string'?val.iv:null;
  let key = encrypted&&typeof val.key==='string'?val.key:null;
  if (encrypted&&(!iv||!key)) return null;
  let mimetype = typeof val.mimetype==='string'&&/^image\/[a-z0-9.+-]+$/i.test(val.mimetype)?val.mimetype:'image/png';
  return { id: val.id, encrypted, iv, key, mimetype };
}
function embedImageTag(img, cls, extra) {
  if (!img) return '';
  return `<embed-image-com data-id="${sanitizeAttr(img.id)}" data-encrypted="${img.encrypted}" data-iv="${sanitizeAttr(img.iv||'')}" data-key="${sanitizeAttr(img.key||'')}" data-mimetype="${sanitizeAttr(img.mimetype)}" data-class="${sanitizeAttr(cls||'')}" data-extra="${sanitizeAttr(extra||'')}"></embed-image-com>`;
}
// Scan from the first { matching balanced braces while respecting strings/escapes, returns the raw object slice or null
function extractBalancedObject(text, from) {
  let start = text.indexOf('{', from);
  if (start===-1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i=start; i<text.length; i++) {
    let c = text[i];
    if (esc) { esc = false; continue; }
    if (c==='\\') { esc = true; continue; }
    if (c==='"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c==='{') depth++;
    else if (c==='}') { depth--; if (depth===0) return {start, end: i+1}; }
  }
  return null;
}
// Splits raw content into ordered parts ({text}|{embed}|{diagram}|{interactive}) so blocks render where they appear, plus the stripped body and embed list (max 10 blocks total)
function parseEmbeds(content) {
  let parts = [], embeds = [], body = '', buf = '', cursor = 0, blockCount = 0;
  let re = /(^|\n)[ \t]*!\s*(embed|diagram|interactive):\s*/g, m;
  while ((m = re.exec(content))!==null) {
    let obj = extractBalancedObject(content, m.index+m[0].length-1);
    if (!obj) continue;
    buf += content.slice(cursor, m.index)+(m[1]==='\n'?'\n':'');
    cursor = obj.end;
    re.lastIndex = obj.end;
    if (blockCount>=10) continue;
    let data;
    try { data = JSON.parse(content.slice(obj.start, obj.end)); } catch { continue; }
    let t = buf.trim(); buf = '';
    if (t) { parts.push({ text: t }); body += (body?'\n':'')+t; }
    parts.push({ [m[2]]: data });
    blockCount++;
    if (m[2]==='embed') embeds.push(data);
  }
  buf += content.slice(cursor);
  let tail = buf.trim();
  if (tail) { parts.push({ text: tail }); body += (body?'\n':'')+tail; }
  return { parts, body, embeds };
}
function extractEmbedAssetIds(content) {
  let ids = [];
  for (let embed of parseEmbeds(content).embeds) {
    for (let field of [embed.image, embed.thumbnail, embed.author?.icon_url, embed.footer?.icon_url]) {
      if (field&&typeof field==='object'&&typeof field.id==='string') ids.push(field.id);
    }
  }
  return ids;
}
function renderEmbedField(field) {
  return `<div class="embed-field${field.inline?' inline':''}">${field.name?`<span class="embed-field-name">${window.MDParse(String(field.name), MDCustom)}</span>`:''}${field.value?`<span class="embed-field-value">${window.MDParse(String(field.value), MDCustom)}</span>`:''}</div>`;
}
function renderEmbed(embed) {
  if (!embed||typeof embed!=='object') return '';
  let color = embed.color;
  if (typeof color==='number') color = '#'+(color&0xffffff).toString(16).padStart(6, '0');
  else if (typeof color==='string'&&!(/^#[0-9a-fA-F]{6}$/).test(color)) color = null;
  let authorIcon = safeEmbedImage(embed.author?.icon_url);
  let authorUrl = safeEmbedUrl(embed.author?.url);
  let titleUrl = safeEmbedUrl(embed.url);
  let thumb = safeEmbedImage(embed.thumbnail);
  let image = safeEmbedImage(embed.image);
  let footerIcon = safeEmbedImage(embed.footer?.icon_url);
  let ts = embed.timestamp!=null?new Date(typeof embed.timestamp==='number'?embed.timestamp*1000:embed.timestamp):null;
  let footerParts = [embed.footer?.text?sanitizeHTML(String(embed.footer.text)):'', ts&&!isNaN(ts)?formatTime(ts):''].filter(Boolean);
  return `<div class="embed"${color?` style="border-inline-start-color:${color}"`:''}>
    <div class="embed-grid">
      <div class="embed-main">
        ${embed.author?.name?`<div class="embed-author">${embedImageTag(authorIcon, '', ' width="20" height="20" aria-hidden="true"')}${authorUrl?`<a href="${authorUrl}" target="_blank">${window.MDParse(String(embed.author.name), MDCustom)}</a>`:window.MDParse(String(embed.author.name), MDCustom)}</div>`:''}
        ${embed.title?`<div class="embed-title">${titleUrl?`<a href="${titleUrl}" target="_blank">${window.MDParse(String(embed.title), MDCustom)}</a>`:window.MDParse(String(embed.title), MDCustom)}</div>`:''}
        ${embed.description?`<div class="embed-description">${window.MDParse(String(embed.description), MDCustom)}</div>`:''}
        ${Array.isArray(embed.fields)&&embed.fields.length?`<div class="embed-fields">${embed.fields.map(renderEmbedField).join('')}</div>`:''}
        ${embedImageTag(image, 'embed-image', ' loading="lazy"')}
        ${footerParts.length?`<div class="embed-footer">${embedImageTag(footerIcon, '', ' width="20" height="20" aria-hidden="true"')}<span>${footerParts.join(' · ')}</span></div>`:''}
      </div>
      ${embedImageTag(thumb, 'embed-thumb', ' loading="lazy"')}
    </div>
  </div>`;
}
class EmbedImageCom extends HTMLElement {
  async connectedCallback() {
    let id = this.getAttribute('data-id');
    let encrypted = this.getAttribute('data-encrypted')==='true';
    let cls = this.getAttribute('data-class')||'';
    let extra = this.getAttribute('data-extra')||'';
    let src = `${getCurrentServerUrl()}/attachment/${id}`;
    if (!encrypted||FileStore.has(id)) {
      this.outerHTML = `<img src="${FileStore.get(id)??src}" alt=""${cls?` class="${cls}"`:''}${extra}>`;
      return;
    }
    let channel = window.currentChannel;
    let keyId = this.getAttribute('data-key');
    let iv = this.getAttribute('data-iv');
    let mimetype = this.getAttribute('data-mimetype')||'image/png';
    getKeyContents(channel, keyId, async()=>{
      let keyInfo = window.keys[channel]?.[keyId];
      if (!keyInfo) { this.remove(); return; }
      try {
        const privateKey = (await getRSAKeyPair()).privateKey;
        let nkey = await base64ToAESKey(await decryptRSAString(keyInfo.key, privateKey));
        let res = await fetch(src);
        let ciphertext = await res.text();
        let plain = await decryptAES(ciphertext, nkey, iv);
        let blobUrl = URL.createObjectURL(new Blob([plain], { type: mimetype }));
        FileStore.set(id, blobUrl);
        this.outerHTML = `<img src="${blobUrl}" alt=""${cls?` class="${cls}"`:''}${extra}>`;
      } catch { this.remove(); }
    });
  }
}
customElements.define('embed-image-com', EmbedImageCom);
if (window.mermaid) window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: matchMedia('(prefers-color-scheme: dark)').matches?'dark':'default' });
function renderDiagram(diagram) {
  return `<diagram-com>${sanitizeHTML(String(diagram.code||'').slice(0, 5000))}</diagram-com>`;
}
function buildDiagramDoc(svg) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}body{display:flex;align-items:center;justify-content:center}svg{display:block;max-width:100%;max-height:100%;width:auto;height:auto}.background{fill:transparent!important}</style></head><body>${svg}</body></html>`;
}
class DiagramCom extends HTMLElement {
  async connectedCallback() {
    let code = this.textContent;
    this.innerHTML = '';
    try {
      let { svg } = await window.mermaid.render('mmd-'+Math.random().toString(36).slice(2), code);
      let viewport = document.createElement('div');
      viewport.className = 'diagram-viewport';
      let iframe = document.createElement('iframe');
      iframe.className = 'diagram-frame';
      iframe.setAttribute('sandbox', '');
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.setAttribute('scrolling', 'no');
      iframe.srcdoc = buildDiagramDoc(svg);
      viewport.appendChild(iframe);
      let controls = document.createElement('div');
      controls.className = 'diagram-controls';
      controls.innerHTML = `<button type="button" aria-label="Zoom out">−</button><button type="button" aria-label="Reset zoom">⤢</button><button type="button" aria-label="Zoom in">+</button>`;
      this.appendChild(viewport);
      this.appendChild(controls);
      this.initPanZoom(viewport, iframe, controls);
    } catch {
      this.innerHTML = `<div class="diagram-error" tlang="diagram.error">Invalid diagram</div>`;
      window.translate?.();
    }
  }
  initPanZoom(viewport, iframe, controls) {
    let scale = 1, x = 0, y = 0, lastX = 0, lastY = 0;
    let clamp = s=>Math.min(4, Math.max(0.5, s));
    let apply = ()=>{ iframe.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
    let onMove = e=>{ x += e.clientX-lastX; y += e.clientY-lastY; lastX = e.clientX; lastY = e.clientY; apply(); };
    let onUp = ()=>{
      viewport.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    viewport.addEventListener('mousedown', e=>{
      e.preventDefault();
      lastX = e.clientX; lastY = e.clientY;
      viewport.classList.add('dragging');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    viewport.addEventListener('wheel', e=>{
      e.preventDefault();
      scale = clamp(scale-e.deltaY*0.001);
      apply();
    }, { passive: false });
    viewport.addEventListener('dblclick', ()=>{ scale = 1; x = 0; y = 0; apply(); });
    let [zoomOut, zoomReset, zoomIn] = controls.querySelectorAll('button');
    zoomIn.onclick = ()=>{ scale = clamp(scale+0.2); apply(); };
    zoomOut.onclick = ()=>{ scale = clamp(scale-0.2); apply(); };
    zoomReset.onclick = ()=>{ scale = 1; x = 0; y = 0; apply(); };
  }
}
customElements.define('diagram-com', DiagramCom);
function renderInteractive(interactive) {
  let html = sanitizeHTML(String(interactive.html||'').slice(0, 20000));
  let css = sanitizeHTML(String(interactive.css||'').slice(0, 10000));
  let js = sanitizeHTML(String(interactive.js||'').slice(0, 20000));
  return `<interactive-com><template data-part="html">${html}</template><template data-part="css">${css}</template><template data-part="js">${js}</template></interactive-com>`;
}
function buildInteractiveDoc(html, css, js) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;
}
class InteractiveCom extends HTMLElement {
  connectedCallback() {
    this._html = this.querySelector('template[data-part="html"]')?.content.textContent??'';
    this._css = this.querySelector('template[data-part="css"]')?.content.textContent??'';
    this._js = this.querySelector('template[data-part="js"]')?.content.textContent??'';
    this.innerHTML = `<div class="interactive-card"></div>`;
    this.renderCollapsed();
  }
  renderCollapsed() {
    let card = this.querySelector('.interactive-card');
    card.innerHTML = `<div class="interactive-warn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path d="M148.419 20.5C139.566 5.16667 117.434 5.16667 108.581 20.5L6.8235 196.75C-2.02921 212.083 9.03666 231.25 26.7421 231.25H230.258C247.963 231.25 259.029 212.083 250.177 196.75L148.419 20.5ZM116 72C116 65.9249 120.925 61 127 61H130C136.075 61 141 65.9249 141 72V147C141 153.075 136.075 158 130 158H127C120.925 158 116 153.075 116 147V72ZM141 182.5C141 189.404 135.404 195 128.5 195C121.596 195 116 189.404 116 182.5C116 175.596 121.596 170 128.5 170C135.404 170 141 175.596 141 182.5Z"/></svg><span tlang="interactive.warning">Interactive content — not part of Holt Chat and not verified by it</span></div>
  <button type="button" class="interactive-run" tlang="interactive.run">Click to run</button>`;
    card.querySelector('.interactive-run').onclick = ()=>this.renderRunning();
    window.translate?.();
  }
  renderRunning() {
    let card = this.querySelector('.interactive-card');
    card.innerHTML = `<div class="interactive-warn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path d="M148.419 20.5C139.566 5.16667 117.434 5.16667 108.581 20.5L6.8235 196.75C-2.02921 212.083 9.03666 231.25 26.7421 231.25H230.258C247.963 231.25 259.029 212.083 250.177 196.75L148.419 20.5ZM116 72C116 65.9249 120.925 61 127 61H130C136.075 61 141 65.9249 141 72V147C141 153.075 136.075 158 130 158H127C120.925 158 116 153.075 116 147V72ZM141 182.5C141 189.404 135.404 195 128.5 195C121.596 195 116 189.404 116 182.5C116 175.596 121.596 170 128.5 170C135.404 170 141 175.596 141 182.5Z"/></svg><span tlang="interactive.warning">Interactive content — not part of Holt Chat and not verified by it</span><button type="button" class="interactive-stop" aria-label="Stop" tlang="interactive.stop">×</button></div><iframe class="interactive-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${sanitizeHTML(buildInteractiveDoc(this._html, this._css, this._js))}"></iframe>`;
    card.querySelector('.interactive-stop').onclick = ()=>this.renderCollapsed();
    window.translate?.();
  }
}
customElements.define('interactive-com', InteractiveCom);
const tsStyles = {
  t: { hour: '2-digit', minute: '2-digit' },
  T: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
  d: { year: 'numeric', month: '2-digit', day: '2-digit' },
  D: { year: 'numeric', month: 'long', day: 'numeric' },
  f: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  F: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  s: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
  S: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }
};
function formatRelativeTime(date) {
  let locale = uiLocale();
  let diff = (date.getTime()-Date.now())/1000;
  let abs = Math.abs(diff);
  let rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs<60) return rtf.format(Math.round(diff), 'second');
  if (abs<3600) return rtf.format(Math.round(diff/60), 'minute');
  if (abs<86400) return rtf.format(Math.round(diff/3600), 'hour');
  if (abs<2592000) return rtf.format(Math.round(diff/86400), 'day');
  if (abs<31536000) return rtf.format(Math.round(diff/2592000), 'month');
  return rtf.format(Math.round(diff/31536000), 'year');
}
// Replaces Discord-style <t:unix:style> tokens in already-rendered (sanitized) HTML, leaving malformed tokens as-is
function renderTimestamps(html) {
  return html.replaceAll(/&lt;t:(-?\d{1,15}):?([tTdDfFRsS]?)&gt;/g, (match, unix, style)=>{
    let date = new Date(Number(unix)*1000);
    if (isNaN(date)) return match;
    style = style||'f';
    let full = new Intl.DateTimeFormat(uiLocale(), tsStyles.F).format(date);
    let text = style==='R'?formatRelativeTime(date):new Intl.DateTimeFormat(uiLocale(), tsStyles[style]).format(date);
    return `<span class="ts" title="${sanitizeHTML(full)}">${sanitizeHTML(text)}</span>`;
  });
}
const messagesContainer = document.getElementById('messages');
document.addEventListener('copy', (evt)=>{
  let sel = window.getSelection();
  if (!sel||sel.isCollapsed||sel.rangeCount===0) return;
  if (!messagesContainer.contains(sel.anchorNode)||!messagesContainer.contains(sel.focusNode)) return;
  let els = Array.from(messagesContainer.querySelectorAll('.message')).filter(el=>sel.containsNode(el, true)).reverse();
  if (els.length<2) return;
  let lines = els.map(el=>{
    let msg = (window.messages[window.currentChannel]??[]).find(m=>m.id===el.id.replace(/^m-/, ''));
    if (!msg||msg.content===undefined) return null;
    return `${msg.user.display??msg.user.username??''} — ${formatTime(msg.timestamp)}\n${msg.content}`;
  }).filter(Boolean);
  if (!lines.length) return;
  evt.preventDefault();
  evt.clipboardData.setData('text/plain', lines.join('\n\n'));
});
function renderCallHistoryItem(item) {
  let ended = !!item.ended_at;
  let durStr = '';
  if (ended) {
    let s = Math.round((item.ended_at-item.started_at)/1000);
    let m = Math.floor(s/60);
    durStr = m>0?(m+'m '+(s%60?s%60+'s':'').trim()):s+'s';
  }
  let canDel = window.channels?.find(c=>c.id===window.currentChannel)?.permission;
  let hasMng = canDel&&hasPerm(canDel,Permissions.MANAGE_MESSAGES);
  return `<div class="call-history-item" id="m-chi-${sanitizeMinimChars(item.id)}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path d="M248.89 112.906C249.562 113.307 250.137 113.78 250.583 114.424C252.31 116.918 256.509 124.762 255.949 141.5C255.487 155.319 252.998 164.591 251.349 169.317C250.583 171.514 248.265 172.598 246.008 172.03L186.156 156.971C184.662 156.595 183.424 155.551 182.802 154.142L174.338 134.975C173.718 133.57 172.501 132.532 171.008 132.176C163.963 130.496 142.602 125.707 128.147 125.75C113.733 125.793 93.0391 130.499 86.1428 132.17C84.6575 132.53 83.4475 133.565 82.8301 134.963L74.3446 154.179C73.7315 155.567 72.5211 156.602 71.0542 156.991L13.9016 172.17C12.0001 172.675 9.99731 172.007 9.00413 170.308C6.53729 166.09 2.1679 156.786 0.344999 141.5C-1.88619 122.79 7.33098 115.602 10.0451 113.914C10.525 113.615 10.9853 113.354 11.4578 113.044C17.3493 109.176 61.1227 82 128.147 82C194.424 82 241.633 108.573 248.89 112.906Z"/></svg><span class="chi-label" tlang="${ended?'channel.call.ended':'channel.call.ongoing'}">${ended?'Call ended':'Ongoing call'}</span>${durStr?`<span class="chi-dur">${sanitizeHTML(durStr)}</span>`:''}${item.participant_count>1?`<span class="chi-count">${item.participant_count}</span>`:''}<span class="chi-time">${formatTime(item.started_at)}</span>${hasMng?`<button class="chi-del" onclick="window.deleteCallHistoryItem('${sanitizeMinimChars(item.id)}')" tlang="message.delete" style="color:var(--invalid)" aria-label="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256"><path d="M77.0892 18.9306C79.4013 18.9306 81.5077 17.6021 82.5038 15.5156L88.281 3.41493C89.2771 1.32846 91.3835 0 93.6956 0H162.304C164.617 0 166.723 1.32847 167.719 3.41494L173.496 15.5156C174.492 17.6021 176.599 18.9306 178.911 18.9306H222C226.418 18.9306 230 22.5123 230 26.9306V39C230 43.4183 226.418 47 222 47H34C29.5817 47 26 43.4183 26 39V26.9306C26 22.5123 29.5817 18.9306 34 18.9306H77.0892Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M42.4949 62.0605C39.7335 62.0605 37.4949 64.2991 37.4949 67.0605V241C37.4949 249.284 44.2106 256 52.4949 256H203.505C211.789 256 218.505 249.284 218.505 241V67.0605C218.505 64.2991 216.266 62.0605 213.505 62.0605H42.4949ZM78.8686 87.9194C71.728 87.9194 65.9393 93.708 65.9393 100.849V215.919C65.9393 223.06 71.728 228.849 78.8686 228.849C86.0093 228.849 91.7979 223.06 91.7979 215.919V100.849C91.7979 93.708 86.0093 87.9194 78.8686 87.9194ZM128 87.9194C120.859 87.9194 115.071 93.708 115.071 100.849V215.919C115.071 223.06 120.859 228.849 128 228.849C135.141 228.849 140.929 223.06 140.929 215.919V100.849C140.929 93.708 135.141 87.9194 128 87.9194ZM164.202 100.849C164.202 93.708 169.991 87.9194 177.131 87.9194C184.272 87.9194 190.061 93.708 190.061 100.849V215.919C190.061 223.06 184.272 228.849 177.131 228.849C169.991 228.849 164.202 223.06 164.202 215.919V100.849Z"/></svg></button>`:''}${!ended&&window.activeCalls?.[window.currentChannel]?`<button class="cc-join chi-join" onclick="window.joinChannelCall()" tlang="channel.call.join">Join</button>`:''}</div>`;
}
function renderInteractionHistoryItem(item) {
  let label = sanitizeHTML(item.user_display??sanitizeMinimChars(item.user_username));
  let chPerm = window.channels?.find(c=>c.id===window.currentChannel)?.permission;
  let canDel = item.user_username===window.username||(chPerm&&(hasPerm(chPerm,Permissions.MANAGE_MESSAGES)||hasPerm(chPerm,Permissions.MANAGE_PERMISSIONS)));
  return `<div class="interaction-used" id="m-iact-${sanitizeMinimChars(item.id)}"><span class="iact-icon">/</span><span><b>${label}</b> used <b>/${sanitizeMinimChars(item.command)}</b> <span style="opacity:0.55">@${sanitizeMinimChars(item.bot_username)}</span></span><span class="iact-time">${formatTime(item.timestamp)}</span>${canDel?`<button class="chi-del" onclick="window.deleteInteractionHistoryItem('${sanitizeMinimChars(item.id)}')" tlang="message.delete" style="color:var(--invalid)" aria-label="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256"><path d="M77.0892 18.9306C79.4013 18.9306 81.5077 17.6021 82.5038 15.5156L88.281 3.41493C89.2771 1.32846 91.3835 0 93.6956 0H162.304C164.617 0 166.723 1.32847 167.719 3.41494L173.496 15.5156C174.492 17.6021 176.599 18.9306 178.911 18.9306H222C226.418 18.9306 230 22.5123 230 26.9306V39C230 43.4183 226.418 47 222 47H34C29.5817 47 26 43.4183 26 39V26.9306C26 22.5123 29.5817 18.9306 34 18.9306H77.0892Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M42.4949 62.0605C39.7335 62.0605 37.4949 64.2991 37.4949 67.0605V241C37.4949 249.284 44.2106 256 52.4949 256H203.505C211.789 256 218.505 249.284 218.505 241V67.0605C218.505 64.2991 216.266 62.0605 213.505 62.0605H42.4949ZM78.8686 87.9194C71.728 87.9194 65.9393 93.708 65.9393 100.849V215.919C65.9393 223.06 71.728 228.849 78.8686 228.849C86.0093 228.849 91.7979 223.06 91.7979 215.919V100.849C91.7979 93.708 86.0093 87.9194 78.8686 87.9194ZM128 87.9194C120.859 87.9194 115.071 93.708 115.071 100.849V215.919C115.071 223.06 120.859 228.849 128 228.849C135.141 228.849 140.929 223.06 140.929 215.919V100.849C140.929 93.708 135.141 87.9194 128 87.9194ZM164.202 100.849C164.202 93.708 169.991 87.9194 177.131 87.9194C184.272 87.9194 190.061 93.708 190.061 100.849V215.919C190.061 223.06 184.272 228.849 177.131 228.849C169.991 228.849 164.202 223.06 164.202 215.919V100.849Z"/></svg></button>`:''}</div>`;
}
window.deleteCallHistoryItem = function(id) {
  backendfetch(`/api/v1/channel/${window.currentChannel}/call-history/${id}`, {method: 'DELETE'}).then(()=>{
    if (window.callHistory?.[window.currentChannel]) window.callHistory[window.currentChannel]=window.callHistory[window.currentChannel].filter(h=>h.id!==id);
    showMessages(window.messages[window.currentChannel]||[]);
  });
};
window.deleteInteractionHistoryItem = function(id) {
  backendfetch(`/api/v1/channel/${window.currentChannel}/interaction-history/${id}`, {method: 'DELETE'}).then(res=>{
    if (!res?.success) return;
    if (window.interactionHistory?.[window.currentChannel]) window.interactionHistory[window.currentChannel]=window.interactionHistory[window.currentChannel].filter(h=>h.id!==id);
    document.getElementById('m-iact-'+id)?.remove();
  });
};
window.copyCode = function(btn) {
  let code = btn.closest(".code-block").querySelector("code").textContent;
  navigator.clipboard.writeText(code).then(()=>{ btn.textContent = "Copied!"; setTimeout(()=>{ btn.textContent = "Copy"; }, 2000); });
};
window.clickComponent = function(btn) {
  let msgId=btn.dataset.msgId, customId=btn.dataset.cid;
  backendfetch(`/api/v1/channel/${window.currentChannel}/messages/${msgId}/component`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({custom_id:customId})});
};
window.submitModal = function(interactionId, values, dlg) {
  backendfetch(`/api/v1/interactions/${interactionId}/modal-submit`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({components:values})}).then(res=>{ if (res?.success) dlg.close(); });
};
function expiryBadge(msg) {
  if (!msg.expires_at) return '';
  return `<span class="expiry" data-expires="${msg.expires_at}" tlang="message.ephemeral.badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256"><path d="M56 0C42.7452 0 32 10.7452 32 24V24C32 37.2548 42.7452 48 56 48H200C213.255 48 224 37.2548 224 24V24C224 10.7452 213.255 0 200 0H56Z"/><path d="M56 256C42.7452 256 32 245.255 32 232V232C32 218.745 42.7452 208 56 208H200C213.255 208 224 218.745 224 232V232C224 245.255 213.255 256 200 256H56Z"/><path d="M52 40H204C204 84 172 108 148 128C172 148 204 172 204 216H52C52 172 84 148 108 128C84 108 52 84 52 40Z"/></svg><span class="expiry-countdown"></span></span>`;
}
setInterval(()=>{
  document.querySelectorAll('.expiry[data-expires]').forEach(el=>{
    el.querySelector('.expiry-countdown').innerText = formatDuration(Math.max(0, Math.round((el.dataset.expires-Date.now())/1000)));
  });
}, 1000);
async function displayMessage(msg, ch, limited=0) {
  if (msg._callItem) return renderCallHistoryItem(msg);
  if (msg._interactionItem) return renderInteractionHistoryItem(msg);
  let sendm = hasPerm(ch.permission,Permissions.SEND_MESSAGES);
  let mangm = hasPerm(ch.permission,Permissions.MANAGE_MESSAGES);
  let canreact = hasPerm(ch.permission,Permissions.ADD_REACTIONS);
  // Decrypt
  if (msg.error==='pin_before_join') {
    msg.content = await getTranslation('message.pin.unavailable');
  } else if (msg.key&&msg.iv) {
    msg.content = await decodeMessage(msg);
    msg.iv = null;
  }
  // Signature
  if (msg.signature&&PKStore.has(msg.user.username)&&![ValidSignature,InvalidSignature].includes(msg.signature)) {
    let valid = await verifyRSAString(`${msg.content}:${window.currentChannel}:${msg.signed_timestamp}`, msg.signature, (await getRSAKeyFromPublic64(PKStore.get(msg.user.username))));
    msg.signature = valid?ValidSignature:InvalidSignature;
  }
  // Replies
  if (msg.replied_to) {
    let reply = window.messages[ch.id].find(mes=>mes.id===msg.replied_to);
    msg.reply = (!reply||reply.iv)?Object.fromEntries(Object.entries(reply??{}).concat([['content','...']])):reply;
  }
  let parsed = parseEmbeds(msg.content);
  let bigEmoji = parsed.parts.length===1&&parsed.parts[0].text!==undefined&&(/^(?::[a-zA-Z0-9_<!%&\?\*\+\.\- ]+?:){1,3}$/).test(parsed.parts[0].text);
  let editedHtml = msg.edited_at?`<span class="edited" title="${formatTime(msg.edited_at)}" tlang="message.edited">(Edited)</span>`:'';
  let trailerHtml = editedHtml+expiryBadge(msg);
  let lastText = -1;
  for (let i=0; i<parsed.parts.length; i++) if (parsed.parts[i].text!==undefined) lastText = i;
  let bodyHtml = '', embedRun = [];
  for (let i=0; i<parsed.parts.length; i++) {
    let p = parsed.parts[i];
    if (p.embed!==undefined) { embedRun.push(renderEmbed(p.embed)); continue; }
    if (p.diagram!==undefined) { embedRun.push(renderDiagram(p.diagram)); continue; }
    if (p.interactive!==undefined) { embedRun.push(renderInteractive(p.interactive)); continue; }
    if (embedRun.length) { bodyHtml += `<div class="embeds">${embedRun.join('')}</div>`; embedRun = []; }
    bodyHtml += `<span class="content${bigEmoji?' big-emoji':''}">${renderTimestamps(window.MDParse(p.text, MDCustom))}${i===lastText?trailerHtml:''}</span>`;
  }
  if (embedRun.length) bodyHtml += `<div class="embeds">${embedRun.join('')}</div>`;
  if (lastText===-1&&trailerHtml) bodyHtml += `<span class="content">${trailerHtml}</span>`;
  let inviteCodes = [...new Set([...msg.content.matchAll(/#([a-zA-Z0-9_\-]{3,20})(?=$|\s|\*|\_|\~|<|#)/g)].map(m=>m[1]))].slice(0,3);
  let reactionsHtml = await buildReactionsHtml(msg, ch);
  return `<div class="message${msg.ghost?' ghost-'+msg.ghost:''}${(new RegExp('@('+window.username+'|e)(?![a-zA-Z0-9_\\-])','im')).test(msg.content)||(msg.replied_to&&msg.reply?.user?.username===window.username)?' mention':''}${window.username===msg.user.username?' self':''}${msg.user.hide?' grouped':''}" id="m-${sanitizeMinimChars(msg.id)}">
  ${msg.user.hide?`<span class="time">${formatHour(msg.timestamp)}</span>`:`<div class="avatar"><span class="av"${presenceData(msg.user.username)}><img src="${msg.user.pfp?pfpById(msg.user.pfp):userToDefaultPfp(msg.user)}" width="42" height="42" aria-hidden="true" onerror="this.src='${userToDefaultPfp(msg.user)}'"></span></div>`}
  <div class="inner">
    <div class="actions">
      ${limited===0?`
      ${canreact?`<button data-msg-id="${sanitizeMinimChars(msg.id)}" data-ch-id="${sanitizeMinimChars(ch.id)}" onclick="window.openReactionPicker(event, this)" aria-label="Add reaction" tlang="message.reaction.add"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M108 0H148V108H256V148H148V256H108V148H0V108H108V0Z"/></svg></button>`:''}
      ${sendm?`<button data-id="${sanitizeMinimChars(msg.id)}" data-display="${sanitizeAttr(msg.user.display??sanitizeMinimChars(msg.user.username??''))}" onclick="window.replyMessage(this.dataset.id, desanitizeAttr(this.dataset.display))" aria-label="Reply" tlang="message.reply"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M42 108H196V108C229.137 108 256 134.863 256 168V168V199.85C256 210.896 247.046 219.85 236 219.85V219.85C224.954 219.85 216 210.896 216 199.85V168V168C216 156.954 207.046 148 196 148V148H42V108Z"/><path d="M79.746 41.1778C83.0613 37.8625 87.5578 36 92.2464 36V36C107.996 36 115.883 55.0415 104.747 66.1782L47.2462 123.681C44.9032 126.024 44.9032 129.823 47.2462 132.166L104.747 189.67C115.883 200.806 107.996 219.848 92.2464 219.848V219.848C87.5579 219.848 83.0614 217.985 79.7461 214.67L5.72793 140.652C-1.30151 133.622 -1.30151 122.225 5.72793 115.196L79.746 41.1778Z"/></svg></button>`:''}
      ${msg.user.username===window.username?`<button data-id="${sanitizeMinimChars(msg.id)}" data-key="${sanitizeMinimChars(msg.key??'')}" data-content="${sanitizeAttr(msg.content)}" onclick="window.editMessage(this.dataset.id, this.dataset.key, this.parentElement.parentElement, this.dataset.content)" aria-label="Edit" tlang="message.edit"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M36 198L87 239L213.98 78.9249L162.073 38.0226L36 198ZM170.11 27.8251L222.067 68.7297L239.674 46.5333C241.391 44.3698 241.028 41.2246 238.864 39.5086L194.819 4.5744C192.651 2.85464 189.498 3.22334 187.785 5.397L170.11 27.8251Z M35.1323 255.15C33.0948 255.784 31.0651 254.148 31.252 252.023L36 198L87.0001 239L35.1323 255.15Z"/></svg></button>`:''}
      ${ch.type===1||mangm?`<button onclick="window.pinMessage('${sanitizeMinimChars(msg.id)}', true)" aria-label="Pin" tlang="message.pin"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M117.4 6.28699C118.758 0.114336 126.401 -2.11969 130.87 2.34949L253.649 125.126C258.118 129.595 255.883 137.239 249.71 138.597L206.755 148.044C204.89 148.454 203.182 149.39 201.832 150.74L181.588 170.983C180.637 171.934 179.889 173.067 179.386 174.313L154.115 236.957C151.434 243.603 142.838 245.354 137.771 240.287L95.5138 198.03L10.2823 254.884C7.65962 256.633 4.16588 256.288 1.93663 254.058C-0.292345 251.829 -0.63778 248.336 1.11143 245.714L57.964 160.48L15.7091 118.225C10.642 113.158 12.3932 104.562 19.0392 101.881L81.6827 76.6112C82.9295 76.1083 84.0621 75.3587 85.0128 74.4081L105.257 54.1649C106.607 52.8149 107.542 51.1066 107.952 49.2421L117.4 6.28699Z"/></svg></button>`:''}
      ${msg.user.username===window.username||mangm?`<button onclick="window.deleteMessage('${sanitizeMinimChars(msg.id)}')" aria-label="Delete" tlang="message.delete" style="color:var(--invalid)"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M77.0892 18.9306C79.4013 18.9306 81.5077 17.6021 82.5038 15.5156L88.281 3.41493C89.2771 1.32846 91.3835 0 93.6956 0H162.304C164.617 0 166.723 1.32847 167.719 3.41494L173.496 15.5156C174.492 17.6021 176.599 18.9306 178.911 18.9306H222C226.418 18.9306 230 22.5123 230 26.9306V39C230 43.4183 226.418 47 222 47H34C29.5817 47 26 43.4183 26 39V26.9306C26 22.5123 29.5817 18.9306 34 18.9306H77.0892Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M42.4949 62.0605C39.7335 62.0605 37.4949 64.2991 37.4949 67.0605V241C37.4949 249.284 44.2106 256 52.4949 256H203.505C211.789 256 218.505 249.284 218.505 241V67.0605C218.505 64.2991 216.266 62.0605 213.505 62.0605H42.4949ZM78.8686 87.9194C71.728 87.9194 65.9393 93.708 65.9393 100.849V215.919C65.9393 223.06 71.728 228.849 78.8686 228.849C86.0093 228.849 91.7979 223.06 91.7979 215.919V100.849C91.7979 93.708 86.0093 87.9194 78.8686 87.9194ZM128 87.9194C120.859 87.9194 115.071 93.708 115.071 100.849V215.919C115.071 223.06 120.859 228.849 128 228.849C135.141 228.849 140.929 223.06 140.929 215.919V100.849C140.929 93.708 135.141 87.9194 128 87.9194ZM164.202 100.849C164.202 93.708 169.991 87.9194 177.131 87.9194C184.272 87.9194 190.061 93.708 190.061 100.849V215.919C190.061 223.06 184.272 228.849 177.131 228.849C169.991 228.849 164.202 223.06 164.202 215.919V100.849Z"/></svg></button>`:''}
      <button class="more" username="${sanitizeMinimChars(msg.user.username??'')}" data-id="${sanitizeMinimChars(msg.id)}" aria-label="More" tlang="message.more"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path fill-rule="evenodd" clip-rule="evenodd" d="M128 158C111.431 158 98 144.569 98 128C98 111.431 111.431 98 128 98C144.569 98 158 111.431 158 128C158 144.569 144.569 158 128 158ZM128 60C111.432 60 98.0001 46.5685 98.0001 30C98.0001 13.4315 111.432 -5.87112e-07 128 -1.31135e-06C144.569 -2.03558e-06 158 13.4315 158 30C158 46.5685 144.569 60 128 60ZM98 226C98 242.569 111.431 256 128 256C144.569 256 158 242.569 158 226C158 209.431 144.569 196 128 196C111.431 196 98 209.431 98 226Z"/></svg></button>
      `:(limited===1&&(ch.type===1||mangm)?`
      <button onclick="window.pinMessage('${sanitizeMinimChars(msg.id)}', false);window.pinsPanel()" aria-label="Unpin" tlang="message.unpin" style="color:var(--invalid)"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M117.925 15.287C119.283 9.11438 126.925 6.88031 131.394 11.3495L244.087 124.041C248.556 128.51 246.321 136.153 240.148 137.511L201.418 146.029C199.553 146.439 197.845 147.375 196.495 148.724L177.921 167.299C176.97 168.249 176.222 169.382 175.719 170.629L152.677 227.748C149.996 234.394 141.4 236.146 136.332 231.078L97.7987 192.545L18.5585 245.401C16.1203 247.027 12.8731 246.706 10.8007 244.634C8.72831 242.561 8.40702 239.314 10.0331 236.876L62.8886 157.636L24.3564 119.103C19.2888 114.036 21.0402 105.44 27.6864 102.759L84.8066 79.7167C86.0533 79.2137 87.186 78.465 88.1366 77.5145L106.71 58.9403C108.06 57.5903 108.996 55.882 109.406 54.0174L117.925 15.287Z"/><path d="M20 20L236 236" stroke-width="40" stroke-linecap="round"/></svg></button>
      `:'')}
    </div>
    ${msg.replied_to?`<span class="reply" onclick="previewMessage('${sanitizeMinimChars(msg.reply?.id??'')}')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256"><path d="M256 132C256 120.954 247.046 112 236 112H60V112C26.8629 112 0 138.863 0 172V172V236C0 247.046 8.95431 256 20 256V256C31.0457 256 40 247.046 40 236V172V172C40 160.954 48.9543 152 60 152V152H236C247.046 152 256 143.046 256 132V132Z"/></svg>${msg.reply?`${sanitizeHTML((msg.reply.user?.display??sanitizeMinimChars(msg.reply.user?.username??''))||'...')}: ${sanitizeHTML(msg.reply.content)||imageicon}`:'Cannot load message'}</span>`:''}
    ${msg.user.hide?'':`<span class="topper"><span class="author"${msg.user.username?` onclick="window.mentionUser('${sanitizeMinimChars(msg.user.username)}')"`:''}>${sanitizeHTML(msg.user.display??sanitizeMinimChars(msg.user.username))}</span>${msg.user.is_bot?'<span class="bot-tag">BOT</span>':''}${!msg.user.nockeck&&msg.signature!==ValidSignature?'<span style="display:inline-flex" aria-label="Could not verify the author of this message" title="Could not verify the author of this message" tlang="message.unverified"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256"><path fill-rule="evenodd" clip-rule="evenodd" d="M148.419 20.5C139.566 5.16667 117.434 5.16667 108.581 20.5L6.8235 196.75C-2.02921 212.083 9.03666 231.25 26.7421 231.25H230.258C247.963 231.25 259.029 212.083 250.177 196.75L148.419 20.5ZM116 72C116 65.9249 120.925 61 127 61H130C136.075 61 141 65.9249 141 72V147C141 153.075 136.075 158 130 158H127C120.925 158 116 153.075 116 147V72ZM141 182.5C141 189.404 135.404 195 128.5 195C121.596 195 116 189.404 116 182.5C116 175.596 121.596 170 128.5 170C135.404 170 141 175.596 141 182.5Z"/></svg></span>':''}<span class="time">${formatTime(msg.timestamp)}</span></span>`}
    <div class="msgbody">${bodyHtml}</div>
    ${inviteCodes.length?`<div class="invites">${inviteCodes.map(code=>`<invite-com data-code="${sanitizeMinimChars(code)}"></invite-com>`).join('')}</div>`:''}
    <div class="fileList">
      ${msg.attachments.map(att=>attachToElem(att, msg.key??'')).join('')}
    </div>
    ${msg.components?.length?`<div class="msg-components">${msg.components.filter(r=>r.type===1).map(r=>`<div class="action-row">${r.components.filter(b=>b.type===2).map(b=>{let s=['','primary','secondary','success','danger','link'][b.style]||'secondary';return b.style===5?`<a href="${sanitizeAttr(b.url)}" target="_blank" class="comp-btn link">${sanitizeHTML(b.label)}</a>`:`<button class="comp-btn ${s}"${b.disabled?' disabled':''} data-msg-id="${sanitizeMinimChars(msg.id)}" data-cid="${sanitizeMinimChars(b.custom_id)}" onclick="window.clickComponent(this)">${sanitizeHTML(b.label)}</button>`;}).join('')}</div>`).join('')}</div>`:''}
    ${reactionsHtml}
  </div>
</div>`;
}
async function showMessages(messages) {
  let ch = window.channels.find(ch=>ch.id===window.currentChannel);
  if (localStorage.getItem('pcallhist')!=='false'&&window.callHistory?.[window.currentChannel]?.length) {
    let oldestTs = messages.length?messages[messages.length-1].timestamp:0;
    let hist = window.callHistory[window.currentChannel].filter(h=>h.started_at>=oldestTs).map(h=>({...h, _callItem:true, timestamp:h.started_at}));
    if (hist.length) { messages = [...messages, ...hist].sort((a, b)=>b.timestamp-a.timestamp); }
  }
  if (window.interactionHistory?.[window.currentChannel]?.length) {
    let oldestTs = messages.length?messages[messages.length-1].timestamp:0;
    let iact = window.interactionHistory[window.currentChannel].filter(h=>h.timestamp>=oldestTs);
    if (iact.length) { messages = [...messages, ...iact].sort((a, b)=>b.timestamp-a.timestamp); }
  }
  // Pre
  for (let i=0; i<messages.length; i++) {
    if (messages[i]._callItem||messages[i]._interactionItem) { messages[i].user = {hide: false}; continue; }
    // Populate user
    if (!messages[i].user) {
      if (window.currentChannelType!==3) {
        messages[i].user = DummyUser;
      } else {
        messages[i].user = {
          display: ch.name,
          username: 'e',
          pfp: ch.pfp,
          nocheck: true
        };
      }
    } else {
      if (messages[i].user.username!==null) messages[i].user = Object.merge(messages[i].user, UserStore.get(messages[i].user.username));
    }
    // Hide author?
    messages[i].user.hide = shouldHideUser(messages, i);
  }
  // Show
  let message = '';
  for (let i=0; i<messages.length; i++) {
    message += await displayMessage(messages[i], ch);
  }
  messagesContainer.innerHTML = message;
  Array.from(document.querySelectorAll('.message .more')).forEach(btn=>{
    let id = btn.getAttribute('data-id');
    tippy(btn, {
      allowHTML: true,
      content: (btn.getAttribute('username')&&window.username!==btn.getAttribute('username')&&btn.getAttribute('username')!=='e'&&!window.serverData[getCurrentServerUrl()]?.disable_channel_creation?`<button onclick="window.createChannel(1, '${btn.getAttribute('username')}')" tlang="member.message">Message</button>`:'')+
(window.username!==btn.getAttribute('username')&&btn.getAttribute('username').length!==0?`<button onclick="window.blockmember('${btn.getAttribute('username')}')" class="danger" tlang="member.block">Block</button>`:'')+
`<button onclick="navigator.clipboard.writeText(window.messages[window.currentChannel].find(m=>m.id==='${id}').content)" tlang="message.copy">Copy Contents</button>
<button onclick="navigator.clipboard.writeText('${id}')" tlang="settings.copyid">Copy id</button>`,
      interactive: true,
      trigger: 'click',
      placement: 'bottom-end',
      sticky: true
    });
  });
  showChannels(window.channels);
  // Load more listener
  let more = false;
  function setList() {
    messagesContainer.onscroll = ()=>{
      if (!more && (messagesContainer.scrollHeight-messagesContainer.clientHeight+messagesContainer.scrollTop)<101) {
        more = true;
        backendfetch(`/api/v1/channel/${window.currentChannel}/messages?before_message_id=${(window.messages[window.currentChannel]??[]).slice(-1)[0]?.id}`)
          .then(res=>{
            if (res.length<1) return;
            window.messages[window.currentChannel] = window.messages[window.currentChannel].concat(res);
            let missingKeys = Array.from(new Set(window.messages[window.currentChannel].map(msg=>msg.key).filter(key=>!window.keys[window.currentChannel][key])));
            getKeysBatch(window.currentChannel, missingKeys, ()=>{
              showMessages(window.messages[window.currentChannel]);
              setList();
              more = false;
            });
          });
      }
    };
  }
  setList();
  messagesContainer.onscroll();
  // Ack
  let idx = window.channels.findIndex(ch=>ch.id===window.currentChannel);
  if (messages.length>0&&window.channels[idx].unread_count>0) {
    window.channels[idx].unread_count = 0;
    showChannels(window.channels);
    backendfetch(`/api/v1/channel/${window.currentChannel}/messages/ack`, { method: 'POST' });
  }
}

// Yes function keys go up to 24 and yes there a bunch of weird keys that exist
const NonFocusKeys = 'Alt,AltGraph,AudioVolumeDown,AudioVolumeMute,AudioVolumeUp,BrowserBack,BrowserFavorites,BrowserForward,BrowserHome,BrowserRefresh,BrowserSearch,BrowserStop,CapsLock,Clear,ContextMenu,Control,End,Escape,F1,F10,F11,F12,F13,F14,F15,F16,F17,F18,F19,F2,F20,F21,F22,F23,F24,F3,F4,F5,F6,F7,F8,F9,Help,Home,Insert,LaunchApplication1,LaunchApplication2,LaunchCalculator,LaunchMail,LaunchMediaPlayer,MediaPlayPause,MediaTrackNext,MediaTrackPrevious,Meta,NumLock,OS,PageDown,PageUp,PrintScreen,ScrollLock,Shift,Tab,Unidentified'.split(',');
window.onkeydown = (evt)=>{
  // Arrow up for quick edit
  if (evt.key==='ArrowUp'&&(['body'].includes(document.activeElement.tagName.toLowerCase())||(document.activeElement===messageInput&&messageInput.value.length<1))) {
    let msg = window.messages[window.currentChannel].find(msg=>msg.user.username===window.username);
    if (msg) {
      evt.preventDefault();
      let m = document.getElementById('m-'+msg.id);
      m.scrollIntoView({ behavior: 'smooth' });
      window.editMessage(sanitizeMinimChars(msg.id), sanitizeMinimChars(msg.key??''), m.querySelector('.inner'), sanitizeAttr(msg.content));
      return;
    }
  }
  // Focus
  if (['body'].includes(document.activeElement.tagName.toLowerCase())) {
    if (NonFocusKeys.includes(evt.key)) return;
    if (evt.ctrlKey) return;
    messageInput.focus();
  }
};

// Channels
window.channels = [];
function displayChannel(ch) {
  let lstmsgcnt;
  if (ch.last_message) {
    lstmsgcnt = ch.last_message.content;
    if (ch.last_message.key&&ch.last_message.content!==imageicon) {
      if (ch.last_message.decrypted!==undefined) {
        lstmsgcnt = ch.last_message.decrypted;
      } else if (window.keys[ch.id]&&window.keys[ch.id][ch.last_message.key]&&messages[ch.id]) {
        let msg = messages[ch.id].find(msg=>msg.id===ch.last_message.id);
        if (msg) lstmsgcnt = msg.content;
      } else {
        lstmsgcnt = '...';
      }
    }
  }
  let isPinned = PinnedChannelsStore.has(ch.id);
  return `<span data-id="${sanitizeMinimChars(ch.id)}"${ch.id===window.currentChannel?' selected':''}>
  ${isPinned?'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" class="pin-indicator"><path d="M117.4 6.28699C118.758 0.114336 126.401 -2.11969 130.87 2.34949L253.649 125.126C258.118 129.595 255.883 137.239 249.71 138.597L206.755 148.044C204.89 148.454 203.182 149.39 201.832 150.74L181.588 170.983C180.637 171.934 179.889 173.067 179.386 174.313L154.115 236.957C151.434 243.603 142.838 245.354 137.771 240.287L95.5138 198.03L10.2823 254.884C7.65962 256.633 4.16588 256.288 1.93663 254.058C-0.292345 251.829 -0.63778 248.336 1.11143 245.714L57.964 160.48L15.7091 118.225C10.642 113.158 12.3932 104.562 19.0392 101.881L81.6827 76.6112C82.9295 76.1083 84.0621 75.3587 85.0128 74.4081L105.257 54.1649C106.607 52.8149 107.542 51.1066 107.952 49.2421L117.4 6.28699Z"/></svg>':''}
  <button onclick="window.loadChannel('${ch.id}')">
    <span class="av"${ch.type===1?presenceData(ch.username??ch.name):''}><img src="${ch.pfp?pfpById(ch.pfp):userToDefaultPfp(ch)}" width="30" height="30" aria-hidden="true" loading="lazy" onerror="this.src='${userToDefaultPfp(ch)}'"></span>
    <span class="div">
      <span class="name"${ch.name.length>7||(ch.type===1&&ch.username)?` title="${sanitizeHTML(ch.username??ch.name)}"`:''}><span class="ch-nm">${sanitizeHTML(ch.name)}</span>${ch.is_bot?'<span class="bot-tag">BOT</span>':''}</span>
      ${ch.last_message?`<span class="msg">${ch.last_message.author.length?ch.last_message.author+': ':''}${previewText(lstmsgcnt).replaceAll(/:([a-zA-Z0-9_<!%&\?\*\+\.\- ]+?):/g,(match,g1)=>window.emojiShort[g1.toLowerCase()]??match)}</span>`:''}
    </span>
    ${(ch.unread_count??0)>0?`<span class="unread">${ch.unread_count}</span>`:''}
  </button>
  ${ch.type!==1&&hasPerm(ch.permission,Permissions.MANAGE_CHANNEL)?`<button class="other" onclick="window.changeChannel('${sanitizeMinimChars(ch.id)}')" aria-label="Edit" tlang="channel.edit"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path fill-rule="evenodd" clip-rule="evenodd" d="M128.601 218.743C178.384 218.743 218.742 178.385 218.742 128.602C218.742 78.8184 178.384 38.4609 128.601 38.4609C78.8175 38.4609 38.4601 78.8184 38.4601 128.602C38.4601 178.385 78.8175 218.743 128.601 218.743ZM128.601 167.062C149.842 167.062 167.061 149.843 167.061 128.602C167.061 107.361 149.842 90.1415 128.601 90.1415C107.36 90.1415 90.1408 107.361 90.1408 128.602C90.1408 149.843 107.36 167.062 128.601 167.062Z"></path><path d="M101.001 11.0292C101.507 4.79869 106.711 0 112.962 0H143.038C149.289 0 154.493 4.79868 154.999 11.0292L158 48H98L101.001 11.0292Z"></path><path d="M101.001 244.971C101.507 251.201 106.711 256 112.962 256H143.038C149.289 256 154.493 251.201 154.999 244.971L158 208H98L101.001 244.971Z"></path><path d="M244.971 101.001C251.201 101.507 256 106.711 256 112.962L256 143.038C256 149.289 251.201 154.493 244.971 154.999L208 158L208 98L244.971 101.001Z"></path><path d="M11.0292 101.001C4.79869 101.507 -3.80751e-07 106.711 -6.5399e-07 112.962L-1.96869e-06 143.038C-2.24193e-06 149.289 4.79868 154.493 11.0292 154.999L48 158L48 98L11.0292 101.001Z"></path><path d="M192.883 25.8346C197.645 21.7687 204.733 22.0477 209.16 26.4753L229.71 47.025C234.137 51.4526 234.416 58.5404 230.351 63.3023L205.964 91.8642L164.321 50.2213L192.883 25.8346Z"></path><path d="M26.135 192.008C22.0807 196.77 22.3646 203.849 26.7873 208.271L47.7285 229.212C52.1512 233.635 59.2294 233.919 63.9921 229.865L92.2857 205.78L50.2198 163.714L26.135 192.008Z"></path><path d="M229.879 191.979C233.94 196.742 233.658 203.825 229.233 208.25L208.673 228.811C204.247 233.236 197.164 233.517 192.402 229.457L164.137 205.358L205.78 163.715L229.879 191.979Z"></path><path d="M63.9921 26.1356C59.2293 22.0813 52.1512 22.3652 47.7284 26.7879L26.7874 47.7289C22.3647 52.1517 22.0808 59.2298 26.1351 63.9926L50.22 92.2862L92.2857 50.2205L63.9921 26.1356Z"></path></svg></button>`:''}
  <button class="other" onclick="window.togglePinChannel('${sanitizeMinimChars(ch.id)}')" tlang="channel.${isPinned?'un':''}pin"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M117.4 6.28699C118.758 0.114336 126.401 -2.11969 130.87 2.34949L253.649 125.126C258.118 129.595 255.883 137.239 249.71 138.597L206.755 148.044C204.89 148.454 203.182 149.39 201.832 150.74L181.588 170.983C180.637 171.934 179.889 173.067 179.386 174.313L154.115 236.957C151.434 243.603 142.838 245.354 137.771 240.287L95.5138 198.03L10.2823 254.884C7.65962 256.633 4.16588 256.288 1.93663 254.058C-0.292345 251.829 -0.63778 248.336 1.11143 245.714L57.964 160.48L15.7091 118.225C10.642 113.158 12.3932 104.562 19.0392 101.881L81.6827 76.6112C82.9295 76.1083 84.0621 75.3587 85.0128 74.4081L105.257 54.1649C106.607 52.8149 107.542 51.1066 107.952 49.2421L117.4 6.28699Z"/>${isPinned?'<path d="M20 20L236 236" stroke-width="40" stroke-linecap="round"/>':''}</svg></button>
  ${window.serverData[getCurrentServerUrl()]?.disable_channel_deletion?'':`<button class="other" onclick="window.confirmLeaveChannel('${sanitizeMinimChars(ch.id)}')" aria-label="Leave" tlang="channel.leave"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256"><path d="M219.856 5.85765C227.666 -1.95251 240.33 -1.95258 248.14 5.85765L250.141 7.85961C257.951 15.6701 257.951 28.3334 250.141 36.1438L158.285 127.999L250.141 219.857C257.952 227.667 257.952 240.33 250.141 248.141L248.14 250.142C240.33 257.952 227.666 257.952 219.856 250.142L127.999 158.285L36.143 250.142C28.3326 257.952 15.6693 257.952 7.85884 250.142L5.85786 248.141C-1.95262 240.33 -1.95262 227.667 5.85786 219.857L97.7133 127.999L5.85786 36.1438C-1.95262 28.3333 -1.95261 15.6701 5.85786 7.85961L7.85884 5.85765C15.6693 -1.95245 28.3327 -1.95266 36.143 5.85765L127.999 97.7141L219.856 5.85765Z"/></svg></button>`}
</span>`;
}
function showChannels(channels) {
  if (channels.length<1) {
    document.getElementById('channels').innerHTML = '<p tlang="channel.listempty"></p>';
    window.translate();
    return;
  }
  document.getElementById('channels').innerHTML = channels
    .toSorted((a,b)=>PinnedChannelsStore.has(b.id)-PinnedChannelsStore.has(a.id))
    .map(displayChannel)
    .join('');
}
// Right click context menus (channels + messages), reusing the existing permission-gated actions
function closeCtxMenu() {
  let m = document.getElementById('ctx-menu');
  if (m) m.remove();
  document.removeEventListener('click', closeCtxMenu, true);
  document.removeEventListener('scroll', closeCtxMenu, true);
  window.removeEventListener('resize', closeCtxMenu);
}
function showCtxMenu(x, y, buttons) {
  closeCtxMenu();
  if (!buttons.length) return;
  let menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';
  menu.style.visibility = 'hidden';
  buttons.forEach(b=>{ let prev = b.onclick; b.onclick = (e)=>{ closeCtxMenu(); if (prev) prev.call(b, e); }; menu.appendChild(b); });
  document.body.appendChild(menu);
  if (window.translate) window.translate();
  requestAnimationFrame(()=>{
    let r = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(x, window.innerWidth-r.width-6))+'px';
    menu.style.top = Math.max(6, Math.min(y, window.innerHeight-r.height-6))+'px';
    menu.style.visibility = '';
  });
  setTimeout(()=>{ document.addEventListener('click', closeCtxMenu, true); document.addEventListener('scroll', closeCtxMenu, true); window.addEventListener('resize', closeCtxMenu); }, 0);
}
function ctxButton(tlang, onclick, danger) {
  let b = document.createElement('button');
  if (danger) b.className = 'danger';
  b.innerHTML = `<span tlang="${tlang}"></span>`;
  b.onclick = onclick;
  return b;
}
function ctxFromButton(srcBtn) {
  let t = srcBtn.getAttribute('tlang');
  let b = document.createElement('button');
  if (srcBtn.style.color) b.style.color = srcBtn.style.color;
  b.innerHTML = srcBtn.innerHTML+(t?`<span tlang="${t}"></span>`:'');
  b.onclick = ()=>srcBtn.click();
  return b;
}
function buildMessageMenu(msgEl, target) {
  let out = [];
  let media = target?.closest?.('.fileList img');
  if (media&&media.getAttribute('data-id')) out.push(ctxButton('message.copyattachment', ()=>window.copyAttachment(media)));
  let actions = msgEl.querySelector('.actions');
  if (actions) Array.from(actions.children).forEach(btn=>{ if (!btn.classList.contains('more')) out.push(ctxFromButton(btn)); });
  let more = actions?.querySelector('.more');
  let id = more?.getAttribute('data-id')??msgEl.id.replace(/^m-/, '');
  let uname = more?.getAttribute('username');
  let msg = (window.messages[window.currentChannel]??[]).find(m=>m.id===id);
  if (uname&&uname!==window.username&&uname!=='e'&&!window.serverData[getCurrentServerUrl()]?.disable_channel_creation) out.push(ctxButton('member.message', ()=>window.createChannel(1, uname)));
  if (uname&&uname!==window.username) out.push(ctxButton('member.block', ()=>window.blockmember(uname), true));
  if (msg&&msg.content) out.push(ctxButton('message.copy', ()=>navigator.clipboard.writeText(msg.content)));
  if (id) out.push(ctxButton('settings.copyid', ()=>navigator.clipboard.writeText(id)));
  return out;
}
function buildChannelMenu(span) {
  let out = [];
  let id = span.getAttribute('data-id');
  Array.from(span.querySelectorAll('button.other')).forEach(btn=>out.push(ctxFromButton(btn)));
  let ch = window.channels?.find(c=>c.id===id);
  // For a DM the peer's username is ch.username, or ch.name when they have no display name (same expression used for DM presence/title).
  let dmPeer = ch&&ch.type===1?(ch.username??ch.name):null;
  if (dmPeer) out.push(ctxButton('member.verify', ()=>{ document.getElementById('verify-modal').showModal(); window.renderVerify(dmPeer); }));
  if (id) out.push(ctxButton('settings.copyid', ()=>navigator.clipboard.writeText(id)));
  return out;
}
function buildMemberMenu(btn) {
  let out = [];
  let uname = sanitizeMinimChars(btn.getAttribute('username')??'');
  if (!uname) return out;
  let ch = window.channels.find(ch=>ch.id===window.currentChannel);
  if (uname===window.username) {
    if (hasPerm(ch?.permission, Permissions.MANAGE_PERMISSION)) out.push(ctxButton('member.changeperms', ()=>window.permmember(uname)));
  } else {
    if (!window.serverData[getCurrentServerUrl()]?.disable_channel_creation) out.push(ctxButton('member.message', ()=>window.createChannel(1, uname)));
    out.push(ctxButton('member.verify', ()=>{ document.getElementById('verify-modal').showModal(); window.renderVerify(uname); }));
    out.push(ctxButton('member.block', ()=>window.blockmember(uname), true));
    if (hasPerm(ch?.permission, Permissions.MANAGE_PERMISSION)) out.push(ctxButton('member.changeperms', ()=>window.permmember(uname)));
    if (hasPerm(ch?.permission, Permissions.MANAGE_MEMBERS)) {
      out.push(ctxButton('member.kick', ()=>window.kickmember(uname)));
      out.push(ctxButton('member.ban', ()=>window.banmember(uname), true));
    }
  }
  out.push(ctxButton('member.copyusername', ()=>navigator.clipboard.writeText('@'+uname)));
  return out;
}
document.addEventListener('contextmenu', (evt)=>{
  let msgEl = evt.target.closest?.('.message');
  if (msgEl&&document.getElementById('messages')?.contains(msgEl)) {
    let sel = window.getSelection();
    let selText = sel&&!sel.isCollapsed?sel.toString():'';
    let btns = buildMessageMenu(msgEl, evt.target);
    if (selText) btns.unshift(ctxButton('message.copyselection', ()=>navigator.clipboard.writeText(selText)));
    evt.preventDefault();
    showCtxMenu(evt.clientX, evt.clientY, btns);
    return;
  }
  let chSpan = evt.target.closest?.('#channels > span');
  if (chSpan) { evt.preventDefault(); showCtxMenu(evt.clientX, evt.clientY, buildChannelMenu(chSpan)); return; }
  let memBtn = evt.target.closest?.('.lateral button:not(.mobile)');
  if (memBtn) { evt.preventDefault(); showCtxMenu(evt.clientX, evt.clientY, buildMemberMenu(memBtn)); }
});
async function getChannels() {
  let res = await backendfetch('/api/v1/channels');
  if (!Array.isArray(res)) return;
  res = res.map(ch=>{
    let perm = Number(ch.permissions)&OwnerAlt;
    if (hasPerm(perm,Permissions.OWNER)) perm = OwnerAlt;
    if (hasPerm(perm,Permissions.ADMIN)&&!hasPerm(perm,Permissions.OWNER)) perm = AdminAlt;
    let chperm = Number(ch.channel_permissions)&OwnerAlt;
    if (hasPerm(chperm,Permissions.OWNER)) chperm = OwnerAlt;
    if (hasPerm(chperm,Permissions.ADMIN)&&!hasPerm(chperm,Permissions.OWNER)) chperm = AdminAlt;
    return {
      id: sanitizeMinimChars(ch.id),
      type: Number(ch.type),
      name: ch.name??'',
      username: sanitizeMinimChars(ch.username??'')||null,
      pfp: ch.pfp?sanitizeMinimChars(ch.pfp):null,
      permission: perm,
      base_permissions: chperm,
      unread_count: Number(ch.unread_count)||0,
      member_count: Number(ch.member_count)||1,
      last_message: ch.last_message?{
        id: sanitizeMinimChars(ch.last_message?.id||''),
        content: sanitizeHTML(ch.last_message?.content||'')||imageicon,
        author: sanitizeHTML(ch.last_message?.user?.display??sanitizeMinimChars(ch.last_message?.user?.username||'')),
        key: ch.last_message.key?sanitizeMinimChars(ch.last_message.key):null,
        iv: ch.last_message.iv?ch.last_message.iv.replaceAll(/[^A-Za-z0-9+/=]/g,''):null
      }:null
    };
  });
  window.channels = res;
  if (!window.currentChannel && localStorage.getItem('prc')==='true') {
    let lastCh = localStorage.getItem(window.currentServer+'-lc');
    if (lastCh&&res.find(ch=>ch.id===lastCh)) loadChannel(lastCh);
  }
  showChannels(res);
  loadChannelPreviews();
}
async function loadChannelPreviews() {
  // Decrypt the sidebar last-message previews up front so they show without opening each channel: bulk-fetch every
  // needed channel key in one /keys call, then decrypt each preview and re-render. Keys already cached are reused.
  let chans = (window.channels||[]).filter(c=>c.last_message&&c.last_message.key&&c.last_message.iv&&c.last_message.content&&c.last_message.content!==imageicon);
  if (!chans.length) return;
  let needed = Array.from(new Set(chans.filter(c=>!window.keys[c.id]?.[c.last_message.key]).map(c=>c.last_message.key)));
  if (needed.length) {
    let data = await backendfetch('/api/v1/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(needed) });
    if (Array.isArray(data)) data.forEach(k=>{ if (k.expires_at.toString().length===10) k.expires_at*=1000; chans.forEach(c=>{ if (c.last_message.key===k.key_id) { if (!window.keys[c.id]) window.keys[c.id] = {}; window.keys[c.id][k.key_id] = k; } }); });
  }
  let changed = false;
  let privateKey = (await getRSAKeyPair()).privateKey;
  for (let i=0;i<chans.length;i++) {
    let c = chans[i];
    if (c.last_message.decrypted!==undefined) continue;
    let keyObj = window.keys[c.id]?.[c.last_message.key];
    try {
      if (!keyObj) throw new Error('no key');
      let nkey = await base64ToAESKey(await decryptRSAString(keyObj.key, privateKey));
      c.last_message.decrypted = sanitizeHTML((new TextDecoder()).decode(await decryptAES(c.last_message.content, nkey, c.last_message.iv)));
    } catch(err) { c.last_message.decrypted = '...'; }
    changed = true;
  }
  if (changed&&window.channels) showChannels(window.channels);
}
function showMembers(id) {
  if (!MemberStore.has(id)) MemberStore.set(id, []);
  let ch = window.channels.find(ch=>ch.id===id);
  document.querySelector('.lateral').innerHTML = `<button class="mobile" onclick="document.querySelector('main').style.display='';document.querySelector('side').style.display='none';document.querySelector('.lateral').style.display='none';" aria-label="Close member list"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="12" y="21" width="88" height="216"></rect><rect width="232" height="232" rx="20" stroke-width="24" fill="none" x="12" y="12"></rect></svg></button>`+
  MemberStore.get(id)
    .map(usr=>Object.merge(usr, UserStore.get(usr.username)))
    .toSorted((a,b)=>{
      if ((a.display??a.username)!==(b.display??b.username)) return (a.display??a.username).localeCompare(b.display??b.username);
      return b.joined_at - a.joined_at;
    })
    .map(mem=>`<button username="${sanitizeMinimChars(mem.username)}"><span class="av"${presenceData(mem.username)}><img src="${mem.pfp?pfpById(mem.pfp):userToDefaultPfp(mem)}" width="30" height="30" aria-hidden="true" loading="lazy" onerror="this.src='${userToDefaultPfp(mem)}'"></span><span title="${sanitizeMinimChars(mem.username)}">${sanitizeHTML(mem.display??mem.username)}</span>${mem.is_bot?'<span class="bot-tag">BOT</span>':''}${window.PKVerified?.has(mem.username)?`<span class="verified-badge" tlang="member.verified"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256"><path d="M128 16L160 44L200 40L208 80L240 104L224 144L240 184L200 200L184 240L144 224L104 240L88 200L48 184L40 144L16 104L48 80L56 40L96 44L128 16Z"/><path d="M108 160L80 132L96 116L108 128L160 76L176 92L108 160Z" fill="var(--bg, #fff)"/></svg></span>`:''}</button>`)
    .join('');
  document.querySelectorAll('.lateral button:not(.mobile)').forEach(btn=>{
    let content = (window.username===btn.getAttribute('username'))?
(hasPerm(ch.permission,Permissions.MANAGE_PERMISSION)?`<button onclick="window.permmember('${btn.getAttribute('username')}')" tlang="member.changeperms">Change permissions</button>`:''):
(window.serverData[getCurrentServerUrl()]?.disable_channel_creation?'':`<button onclick="window.createChannel(1, '${btn.getAttribute('username')}')" tlang="member.message">Message</button>`)+
`<button onclick="window.blockmember('${btn.getAttribute('username')}')" class="danger" tlang="member.block">Block</button>`+
(hasPerm(ch.permission,Permissions.MANAGE_PERMISSION)||hasPerm(ch.permission,Permissions.MANAGE_MEMBERS)?`<hr style="width:90%">`:'')+
(hasPerm(ch.permission,Permissions.MANAGE_PERMISSION)?`<button onclick="window.permmember('${btn.getAttribute('username')}')" tlang="member.changeperms">Change permissions</button>`:'')+
(hasPerm(ch.permission,Permissions.MANAGE_MEMBERS)?`<button onclick="window.kickmember('${btn.getAttribute('username')}')" tlang="member.kick">Kick</button>
<button onclick="window.banmember('${btn.getAttribute('username')}')" tlang="member.ban">Ban</button>`:'');
    // No applicable actions (e.g. clicking yourself with no permissions) means no popover instead of an empty box.
    if (!content) return;
    tippy(btn, {
      allowHTML: true,
      content,
      interactive: true,
      trigger: 'click',
      placement: smallScreen()?'bottom-start':'left-start',
      sticky: true
    });
  });
  window.translate();
}
window.blockmember = (id)=>{
  backendfetch('/api/v1/me/block/'+id, {
    method: 'POST'
  });
};
window.unblockmember = (id)=>{
  backendfetch('/api/v1/me/block/'+id, {
    method: 'DELETE'
  })
    .then(()=>{ if (document.getElementById('blocks-modal').open) window.renderBlocks(); });
};
window.permmember = (id)=>{
  let perm = Number(MemberStore.get(window.currentChannel).find(mem=>mem.username===id).permissions)??0;
  if (hasPerm(perm,Permissions.OWNER)) perm = OwnerAlt;
  if (hasPerm(perm,Permissions.ADMIN)&&!hasPerm(perm,Permissions.OWNER)) perm = AdminAlt;
  let ch = window.channels.find(ch=>ch.id===window.currentChannel);
  let modal = document.getElementById('permModal');
  modal.showModal();
  modal.querySelector('div').innerHTML = Object.entries(Permissions)
    .map(k=>`<div class="permrow"><label for="pu-${k[0]}" tlang="permission.${k[0].toLowerCase()}">${k[0].toLowerCase()}</label><input id="pu-${k[0]}" data-weight="${k[1]}" type="checkbox"${hasPerm(ch.permission,k[1])?'':' disabled'}${hasPerm(perm,k[1])?' checked':''}></div>`)
    .join('');
  modal.querySelector('button.set').onclick = ()=>{
    backendfetch( '/api/v1/channel/'+window.currentChannel+'/member/'+id, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        permissions: Array.from(modal.querySelectorAll('input')).map(i=>i.checked?Number(i.getAttribute('data-weight')):0).reduce((a, b)=>a+b,0)
      })
    })
      .then(modal.close);
  };
  modal.querySelector('button.sync').style.display = '';
  modal.querySelector('button.sync').onclick = ()=>{
    backendfetch( '/api/v1/channel/'+window.currentChannel+'/member/'+id, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ permissions: null })
    })
      .then(modal.close);
  };
};
window.kickmember = (id)=>{
  backendfetch(`/api/v1/channel/${window.currentChannel}/member/${id}`, {
    method: 'DELETE'
  })
    .then(()=>{
      MemberStore.set(window.currentChannel, MemberStore.get(window.currentChannel).filter(usr=>usr.username!==id));
    });
};
window.banmember = async(id)=>{
  let formData = new FormData();
  formData.append('reason', await ask('member.ban.reason', 0, 100)??'');
  backendfetch(`/api/v1/channel/${window.currentChannel}/bans/${id}`, {
    method: 'POST',
    body: formData
  })
    .then(()=>{
      MemberStore.set(window.currentChannel, MemberStore.get(window.currentChannel).filter(usr=>usr.username!==id));
    });
};
window.unbanmember = async(id)=>{
  backendfetch(`/api/v1/channel/${window.currentChannel}/bans/${id}`, {
    method: 'DELETE'
  })
    .then(window.bansPanel);
};
function getMembers(id, page=1) {
  if (!MemberStore.has(id)) MemberStore.set(id, []);
  if (MemberStore.get(id).length>0&&page===1) {
    showMembers(id);
    return;
  }
  let ch = window.channels.find(ch=>ch.id===id);
  backendfetch(`/api/v1/channel/${id}/members?page=${page}`)
    .then(res=>{
      if (!Array.isArray(res)) return;
      MemberStore.set(id, MemberStore.get(id).concat(res));
      res.forEach(mem=>{UserStore.set(mem.username, Object.merge(UserStore.get(mem.username), mem))});
      if (ch.member_count>MemberStore.get(id).length&&res.length>0) getMembers(id, page+1);
      showMembers(id);
    });
}
function loadChannel(id) {
  closeSlash();
  let ch = window.channels.find(ch=>ch.id===id);
  window.currentChannel = id;
  window.currentChannelType = ch.type;
  document.querySelectorAll('#channels > span[selected]').forEach(s=>s.removeAttribute('selected'));
  let selSpan = document.querySelector(`#channels > span[data-id="${CSS.escape(id)}"]`);
  if (selSpan) selSpan.setAttribute('selected', '');
  if (localStorage.getItem('prc')==='true') localStorage.setItem(window.currentServer+'-lc', id);
  renderTyping();
  renderPeerStatus();
  renderCallIndicator();
  // Lateral
  document.querySelector('.lateraltoggle').style.display = 'none';
  if (smallScreen()) {
    document.querySelector('side').style.display = 'none';
    document.querySelector('main').style.display = '';
  }
  // Labels & Buttons
  document.querySelector('.top .name').innerHTML = '<span>'+sanitizeHTML(ch.name+(ch.type===1&&ch.username?' ('+ch.username+')':''))+'</span>'+(ch.is_bot?'<span class="bot-tag">BOT</span>':'');
  document.querySelector('.top .type').outerHTML = TypeIcons[ch.type];
  document.getElementById('callsButton').style.display = (ch.type!==3&&(window.serverData[getCurrentServerUrl()]?.calls?.enabled||false))?'':'none';
  document.getElementById('integrateButton').style.display = 'none';
  document.getElementById('bansButton').style.display = 'none';
  document.getElementById('inviteButton').style.display = 'none';
  document.getElementById('notifButton').style.display = localStorage.getItem('pnotif')==='true'?'':'none';
  document.querySelector('.lateral').style.display = 'none';
  if (ch.type===2||(ch.type===3&&(hasPerm(ch.permission,Permissions.MANAGE_CHANNEL)||hasPerm(ch.permission,Permissions.MANAGE_MEMBERS)))) {
    if (smallScreen()) {
      document.querySelector('.lateraltoggle').style.display = '';
    } else {
      document.querySelector('.lateral').style.display = '';
    }
    showMembers(id);
    getMembers(id);
    if (hasPerm(ch.permission,Permissions.MANAGE_MEMBERS)) document.getElementById('bansButton').style.display = '';
    if (hasPerm(ch.permission,Permissions.MANAGE_CHANNEL)) {
      if (ch.type===3&&(window.serverData[getCurrentServerUrl()]?.webhooks?.enabled||false)) document.getElementById('integrateButton').style.display = '';
      document.getElementById('inviteButton').style.display = '';
    }
  }
  rebuildSplit();
  // Get public keys
  if (!PKChannels.includes(id)) {
    PKChannels.push(id);
    backendfetch(`/api/v1/channel/${id}/members?pb=true`)
      .then(members=>{
        let changed = false;
        for (let i=0; i<members.length; i++) {
          if (!PKStore.has(members[i].username)) {
            PKStore.set(members[i].username, members[i].public);
            changed = true;
          }
        }
        if (changed) saveToDB();
        // Keys often arrive after the messages have already rendered (showing a "could not verify" sign); re-render so
        // signatures verify against the now-present keys instead of only after the user reopens the channel.
        if (changed&&window.currentChannel===id&&window.messages[id]) showMessages(window.messages[id]);
      });
  }
  // Messages
  let canSendMsgs = hasPerm(ch.permission,Permissions.SEND_MESSAGES);
  document.querySelector('.bar').style.display = canSendMsgs?'':'none';
  document.querySelector('.bar.fake').style.display = canSendMsgs?'none':'';
  filePreview();
  if (!window.callHistory) window.callHistory = {};
  if (!window.callHistory[id]&&localStorage.getItem('pcallhist')!=='false') {
    backendfetch(`/api/v1/channel/${id}/call-history`).then(res=>{
      if (!res?.history) return;
      window.callHistory[id] = res.history;
      if (window.currentChannel===id&&window.messages[id]) showMessages(window.messages[id]);
    });
  }
  if (!window.interactionHistory) window.interactionHistory = {};
  if (!window.interactionHistory[id]) {
    backendfetch(`/api/v1/channel/${id}/interaction-history`).then(res=>{
      if (!res?.history) return;
      window.interactionHistory[id] = res.history.map(h=>({...h, _interactionItem:true}));
      if (window.currentChannel===id&&window.messages[id]) showMessages(window.messages[id]);
    });
  }
  if (window.messages[id]) {
    showMessages(window.messages[id]);
  } else {
    showMessages([]);
    backendfetch(`/api/v1/channel/${id}/messages`)
      .then(res=>{
        if (!Array.isArray(res)) return;
        window.messages[id] = res;
        res.forEach(msg=>{
          if (!msg.user) return;
          UserStore.set(msg.user.username, Object.merge(UserStore.get(msg.user.username), msg.user))
        });
        if (!window.keys[id]) window.keys[id]={};
        let missingKeys = Array.from(new Set(window.messages[id].map(msg=>msg.key).filter(key=>!window.keys[id][key])));
        getKeysBatch(id, missingKeys, ()=>{
          showMessages(res);
        });
      });
  }
}
window.loadChannel = loadChannel;
function permchannel(id) {
  let ch = window.channels.find(ch=>ch.id===id);
  let perm = Number(ch.base_permissions)??0;
  if (hasPerm(perm,Permissions.OWNER)) perm = OwnerAlt;
  if (hasPerm(perm,Permissions.ADMIN)&&!hasPerm(perm,Permissions.OWNER)) perm = AdminAlt;
  let modal = document.getElementById('permModal');
  modal.showModal();
  modal.querySelector('div').innerHTML = Object.entries(Permissions)
    .map(k=>`<div class="permrow"><label for="pu-${k[0]}" tlang="permission.${k[0].toLowerCase()}">${k[0].toLowerCase()}</label><input id="pu-${k[0]}" data-weight="${k[1]}" type="checkbox"${hasPerm(ch.permission,k[1])?'':' disabled'}${hasPerm(perm,k[1])?' checked':''}></div>`)
    .join('');
  modal.querySelector('button.set').onclick = ()=>{
    let formData = new FormData();
    formData.append('permissions', Array.from(modal.querySelectorAll('input')).map(i=>i.checked?Number(i.getAttribute('data-weight')):0).reduce((a, b)=>a+b,0));
    backendfetch( '/api/v1/channel/'+id, {
      method: 'PATCH',
      body: formData
    })
      .then(modal.close);
  };
  modal.querySelector('button.sync').style.display = 'none';
}
function changeChannel(id) {
  const modal = document.getElementById('edit-channel');
  modal.showModal();
  let channel = window.channels.find(ch=>ch.id===id);
  modal.querySelector('.name').innerText = channel.name;
  modal.querySelector('.name').setAttribute('title', channel.name);
  document.getElementById('ce-name').value = channel.name;
  modal.querySelector('.img').src = channel.pfp?pfpById(channel.pfp):userToDefaultPfp(channel);
  modal.querySelector('.img').onerror = (evt)=>evt.target.src=userToDefaultPfp(channel);
  document.getElementById('ce-ttl').value = Object.keys(ephemeralTtlMs).find(k=>ephemeralTtlMs[k]===channel.default_ttl)??'off';
  document.getElementById('cec-ttl').onclick = ()=>{
    let formData = new FormData();
    formData.append('ttl', document.getElementById('ce-ttl').value);
    backendfetch('/api/v1/channel/'+id, {
      method: 'PATCH',
      body: formData
    });
  };

  document.getElementById('cec-name').onclick = ()=>{
    let formData = new FormData();
    formData.append('name', document.getElementById('ce-name').value);
    backendfetch('/api/v1/channel/'+id, {
      method: 'PATCH',
      body: formData
    })
      .then(res=>{
        modal.querySelector('.name').innerText = res.updated_channel.name;
        modal.querySelector('.img').src = res.updated_channel.pfp?pfpById(res.updated_channel.pfp):userToDefaultPfp(res.updated_channel);
        modal.querySelector('.img').onerror = (evt)=>evt.target.src=userToDefaultPfp(res.updated_channel);
      });
  };
  document.getElementById('ce-imginp').onchange = async(evt)=>{
    if (!evt.target.files[0]) return;
    if (!evt.target.files[0].type.startsWith('image/')) return;
    let img = await processImageToPfp(evt.target.files[0]);
    let formData = new FormData();
    formData.append('pfp', img, 'pfp.webp');
    backendfetch('/api/v1/channel/'+id, {
      method: 'PATCH',
      body: formData
    })
      .then(res=>{
        modal.querySelector('.name').innerText = res.updated_channel.name;
        modal.querySelector('.img').src = res.updated_channel.pfp?pfpById(res.updated_channel.pfp):userToDefaultPfp(res.updated_channel);
        modal.querySelector('.img').onerror = (evt)=>evt.target.src=userToDefaultPfp(res.updated_channel);
      });
  }
  document.getElementById('cec-img').onclick = ()=>{
    document.getElementById('ce-imginp').click();
  };
  document.getElementById('cec-copyid').onclick = ()=>{
    navigator.clipboard.writeText(id);
  }
  document.getElementById('cec-editperms').onclick = ()=>{
    permchannel(id);
  }
  document.getElementById('cec-delete').onclick = ()=>{
    window.leaveChannel(id, true);
    modal.close();
  }
}
window.changeChannel = changeChannel;
function leaveChannel(id, del=false) {
  backendfetch('/api/v1/channel/'+id+(del?'?delete=true':''), {
    method: 'DELETE'
  });
}
window.leaveChannel = leaveChannel;
window.confirmLeaveChannel = async(id)=>{
  let ch = window.channels.find(c=>c.id===id);
  let ok = await affirm('channel.leave.confirm', sanitizeHTML(ch?.name||id));
  if (ok) leaveChannel(id);
};
function togglePinChannel(id) {
  PinnedChannelsStore[PinnedChannelsStore.has(id)?'delete':'set'](id, true);
  saveToDB();
  showChannels(window.channels);
}
window.togglePinChannel = togglePinChannel;
async function createChannel(type, data) {
  if (!data) {
    try {
      data = await ask('channel.new.'+(type===1?'user':'name'), (type===1?3:1), (type===1?20:50));
      if (type===1) data = data.toLowerCase();
    } catch(err) {
      return;
    }
  }
  let formData = new FormData();
  formData.append('type', type);
  formData.append(type===1?'target_user':'name', data);

  let req = await backendfetch('/api/v1/channels', {
    method: 'POST',
    body: formData,
    passstatus: true
  });
  if (!req.channel_id) {
    let e = (req.error||'').toLowerCase();
    if (e.includes('not found')) notice('error.usernotfound');
    else if (e.includes('blocked')) notice('error.blocked');
    else if (e.includes('yourself')) notice('error.selfdm');
    else if (e.includes('maximum number of channels')) notice('error.maxchannels');
    else if (e.includes('disabled')) notice('error.creationdisabled');
    else notice('error.generic');
    return;
  }
  await getChannels();
  // Open the chat right away: works for a freshly created group/broadcast/DM and for an existing DM (the backend returns its id).
  if (window.channels.find(c=>c.id===req.channel_id)) loadChannel(req.channel_id);
  return req.channel_id;
}
window.createChannel = createChannel;
const joinModal = document.getElementById('joinModal');
const joinCodeInput = document.getElementById('join-code');
const joinPreview = document.getElementById('join-preview');
const joinSubmit = document.getElementById('join-submit');
let joinDebounce, joinSeq = 0;
joinCodeInput.oninput = ()=>{
  let code = joinCodeInput.value.trim();
  let seq = ++joinSeq;
  joinSubmit.disabled = true;
  clearTimeout(joinDebounce);
  if (code.length<3) { joinPreview.innerHTML = ''; return; }
  joinDebounce = setTimeout(()=>{
    backendfetch('/api/v1/channels/invite/'+encodeURIComponent(code), { passstatus: true }).then(async res=>{
      if (seq!==joinSeq) return;
      if (!res.success) { joinPreview.innerHTML = `<span class="invite-notfound" tlang="invite.notfound">Invite not found</span>`; window.translate(); return; }
      joinPreview.innerHTML = await renderInvitePreviewInfo(res);
      joinSubmit.disabled = !!res.is_member;
    });
  }, 300);
};
joinSubmit.onclick = async()=>{
  let code = joinCodeInput.value.trim();
  if (!code) return;
  joinSubmit.disabled = true;
  let req = await backendfetch('/api/v1/channels/invite/'+encodeURIComponent(code), {
    method: 'POST',
    passstatus: true
  });
  if (req.status===403) {
    notice('channel.banned');
    joinSubmit.disabled = false;
    return;
  }
  if (req.channel_id) {
    await getChannels();
    loadChannel(req.channel_id);
    joinModal.close();
  } else {
    notice('error.generic');
    joinSubmit.disabled = false;
  }
};
function joinChannel() {
  joinCodeInput.value = '';
  joinPreview.innerHTML = '';
  joinSubmit.disabled = true;
  joinModal.showModal();
  joinCodeInput.focus();
}
window.joinChannel = joinChannel;
let last = '';
document.getElementById('search').onkeyup = (evt)=>{
  let query = evt.target.value.toLowerCase();
  if (last===query) return;
  last = query;
  showChannels(window.channels.filter(ch=>ch.name.toLowerCase().includes(query)));
}
window.startCall = ()=>{
  backendfetch(`/api/v1/channel/${window.currentChannel}/call`)
    .then(res=>{
      calls.startCall(window.currentChannel, (res.participants?true:false));
    });
};
window.endCall = ()=>{
  calls.leaveCall();
};
window.joinChannelCall = ()=>{
  let el = document.getElementById('channel-call');
  if (el) el.style.display='none';
  calls.startCall(window.currentChannel, true);
};
window.integratePanel = ()=>{
  let modal = document.getElementById('integrateModal');
  modal.showModal();
  function show() {
    backendfetch(`/api/v1/channel/${window.currentChannel}/webhooks`)
      .then(res=>{
        let list = modal.querySelector('.list');
        list.innerHTML = res.length<1?
        '<p tlang="channel.webhooks.empty">No webhooks, create one!</p>':
        res.toReversed().map(webhook=>`<div>
  ${sanitizeHTML(webhook.name)}
  <div style="flex:1"></div>
  <button tlang="channel.webhooks.copy" onclick="navigator.clipboard.writeText('${webhook.url}?token=${sanitizeMinimChars(webhook.token)}')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M163.964 45.2633C184.843 24.3845 218.694 24.3846 239.573 45.2633C260.452 66.1422 260.451 99.9932 239.573 120.872L180.935 179.51C160.056 200.389 126.205 200.389 105.326 179.511C84.4472 158.632 84.4471 124.78 105.326 103.901L107.73 101.497C112.417 96.8107 120.015 96.8107 124.701 101.497V101.497C129.387 106.183 129.387 113.781 124.701 118.468L122.296 120.872C110.79 132.378 110.79 151.034 122.296 162.54C133.803 174.046 152.458 174.046 163.964 162.539L222.602 103.901C234.108 92.3952 234.109 73.7401 222.603 62.2339C211.096 50.7278 192.441 50.7277 180.935 62.2339L175.179 67.9895C170.493 72.6758 162.895 72.6758 158.208 67.9895V67.9895C153.522 63.3032 153.522 55.7052 158.208 51.0189L163.964 45.2633Z"/><path d="M74.331 76.2582C95.2098 55.3794 129.062 55.3794 149.94 76.2582C170.819 97.137 170.818 130.988 149.94 151.867L147.535 154.271C142.849 158.958 135.251 158.958 130.565 154.271V154.271C125.878 149.585 125.878 141.987 130.565 137.301L132.969 134.896C144.475 123.39 144.476 104.735 132.97 93.2288C121.464 81.7226 102.808 81.7225 91.3016 93.2288L32.6635 151.867C21.1574 163.373 21.1574 182.029 32.6635 193.535C44.1697 205.041 62.8248 205.04 74.331 193.534L80.0866 187.779C84.7729 183.092 92.3709 183.092 97.0572 187.779V187.779C101.743 192.465 101.743 200.063 97.0572 204.749L91.3016 210.505C70.4228 231.384 36.5717 231.384 15.6929 210.506C-5.18579 189.627 -5.18573 155.775 15.6929 134.896L74.331 76.2582Z"/></svg></button>
  <button tlang="channel.webhooks.delete" class="delete" data-id="${sanitizeMinimChars(webhook.id)}" data-token="${sanitizeMinimChars(webhook.token)}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M42.6776 7.32227C32.9145 -2.44063 17.0852 -2.44077 7.32214 7.32227C-2.44082 17.0853 -2.44069 32.9146 7.32214 42.6777L92.2616 127.617L7.32214 212.557C-2.44091 222.32 -2.44083 238.149 7.32214 247.912C17.0852 257.675 32.9145 257.675 42.6776 247.912L127.617 162.973L212.557 247.912C222.32 257.675 238.149 257.675 247.912 247.912C257.675 238.149 257.675 222.32 247.912 212.557L162.973 127.617L247.912 42.6777C257.675 32.9146 257.675 17.0853 247.912 7.32227C238.149 -2.44079 222.32 -2.44068 212.557 7.32227L127.617 92.2617L42.6776 7.32227Z"/></svg></button>
</div>
<span class="small">
  ${webhook.last_used_at?`<span tlang="channel.webhooks.used">Used:</span> ${formatTime(webhook.last_used_at)} | `:''}
  <span tlang="channel.webhooks.created">Created:</span> ${formatTime(webhook.created_at)} <span tlang="channel.webhooks.by">by</span> ${sanitizeHTML(webhook.created_by_display??sanitizeMinimChars(webhook.created_by_username??''))}
</span>`).join('');
        window.translate();
        list.querySelectorAll('.delete').forEach(btn=>{
          btn.onclick = ()=>{
            backendfetch(`/api/v1/channel/${window.currentChannel}/webhooks/${btn.getAttribute('data-id')}?token=${btn.getAttribute('data-token')}`, { method: 'DELETE' })
              .then(show);
          };
        });
      });
  }
  modal.querySelector('.create').onclick = async()=>{
    let name;
    try {
      name = await ask('channel.webhooks.create', 1, 50, 'Webhook');
    } catch(_) {
      return;
    }
    backendfetch( `/api/v1/channel/${window.currentChannel}/webhooks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    })
      .then(show);
  };
  show();
};
window.bansPanel = ()=>{
  document.getElementById('bansModal').showModal();
  backendfetch(`/api/v1/channel/${window.currentChannel}/bans`)
    .then(res=>{
      let target = document.querySelector('#bansModal div');
      if (!Array.isArray(res)||res.length===0) {
        target.innerHTML = '<span class="empty" tlang="bans.empty">No one is banned</span>';
        window.translate();
        return;
      }
      target.innerHTML = res
        .map(ban=>`<div class="ban">
  <img src="${ban.pfp?pfpById(ban.pfp):userToDefaultPfp(ban)}" width="30" height="30" aria-hidden="true" loading="lazy" onerror="this.src='${userToDefaultPfp(ban)}'">
  <span>
    <b>${sanitizeHTML(ban.display??sanitizeMinimChars(ban.username))}</b>
    <span class="small">by: ${sanitizeHTML(ban.banned_by_display??sanitizeMinimChars(ban.banned_by_username))}</span>
    <span>${sanitizeHTML(ban.reason??'')}</span>
  </span>
  <button onclick="window.unbanmember('${sanitizeMinimChars(ban.username)}')">x</button>
</div>`)
        .join('');
    });
};
window.invitePanel = ()=>{
  document.getElementById('inviteModal').showModal();
  backendfetch(`/api/v1/channel/${window.currentChannel}/invite`)
    .then(res=>{
      document.querySelector('#inviteModal .cur').innerText = sanitizeMinimChars(res.invite_code??'None');
    });
  document.querySelector('#inviteModal .rand').onclick = ()=>{
    backendfetch(`/api/v1/channel/${window.currentChannel}/invite`, {
      method: 'POST'
    })
      .then(window.invitePanel);
  };
  document.querySelector('#inviteModal .rem').onclick = ()=>{
    backendfetch(`/api/v1/channel/${window.currentChannel}/invite`, {
      method: 'DELETE'
    })
      .then(window.invitePanel);
  };
  document.querySelector('#inviteModal .set').onclick = ()=>{
    let formData = new FormData();
    formData.append('invite_code', document.getElementById('invitenew').value);

    backendfetch(`/api/v1/channel/${window.currentChannel}/invite`, {
      method: 'POST',
      body: formData
    })
      .then(window.invitePanel);
  };
};
window.notifPanel = ()=>{
  let modal = document.getElementById('notifModal');
  modal.show();
  let button = document.getElementById('notifButton');
  let bb = button.getBoundingClientRect();
  modal.style.top = bb.bottom+10+'px';
  modal.style.setProperty('--left', bb.right+'px');
  let select = document.getElementById('ce-notifs');
  select.value = getNotifStateChannel(window.currentChannel, window.currentChannelType);
  select.onchange = ()=>{
    ChannelNotifStore.set(window.currentChannel, select.value);
    saveToDB();
    syncHoltNotifs();
  };
};
window.pinsPanel = ()=>{
  let modal = document.getElementById('pinsModal');
  modal.show();
  let button = document.getElementById('pinsButton');
  let bb = button.getBoundingClientRect();
  modal.style.top = bb.bottom+10+'px';
  modal.style.setProperty('--left', bb.right+'px');
  backendfetch(`/api/v1/channel/${window.currentChannel}/pins`)
    .then(async(messages)=>{
      if (messages.length<1) {
        document.querySelector('#pinsModal div').innerText = '';
        document.querySelector('#pinsModal div').setAttribute('tlang','message.nopins');
        return;
      }
      document.querySelector('#pinsModal div').removeAttribute('tlang');
      let ch = window.channels.find(ch=>ch.id===window.currentChannel);
      // Show
      let message = '';
      for (let i=0; i<messages.length; i++) {
        message += await displayMessage(messages[i], ch, 1);
      }
      document.querySelector('#pinsModal div').innerHTML = message;
    });
};

// Stream
window.stream = null;
function startStream() {
  if (window.stream) return;
  window.stream = new EventSource(`${getCurrentServerUrl()}/api/v1/stream?authorization=Bearer ${localStorage.getItem(window.currentServer+'-sessionToken')}`);
  window.stream.addEventListener('open', ()=>{ window.streamConnectedAt = Date.now(); });
  window.stream.addEventListener('error', (event)=>{
    if (!event.data) return;
    let data = JSON.parse(event.data);
    console.log('Stream error:', data.error);
    window.stream.close();
    window.stream = null;
    startStream();
  });
  // Presence + typing
  window.stream.addEventListener('presence_update', (event)=>{
    let data = JSON.parse(event.data);
    window.presence[data.username] = data.status;
    if (data.last_seen) window.lastSeen[data.username] = data.last_seen;
    else if (data.status!=='offline') delete window.lastSeen[data.username];
    applyPresence(data.username);
    renderPeerStatus();
  });
  window.stream.addEventListener('presence_remove', (event)=>{
    let data = JSON.parse(event.data);
    delete window.presence[data.username];
    delete window.lastSeen[data.username];
    applyPresence(data.username);
    renderPeerStatus();
  });
  window.stream.addEventListener('typing', (event)=>{
    let data = JSON.parse(event.data);
    addTyping(data.channel_id, data.username);
  });
  // Channels
  window.stream.addEventListener('channel_added', (event)=>{
    let data = JSON.parse(event.data);
    if (window.channels.find(ch=>ch.id===sanitizeMinimChars(data.channel.id))) return;
    window.channels.unshift({});
    if (data.channel.created) data.channel.permissions = OwnerAlt;
    let perm = Number(data.channel.permissions)&OwnerAlt;
    if (hasPerm(perm,Permissions.OWNER)) perm = OwnerAlt;
    if (hasPerm(perm,Permissions.ADMIN)&&!hasPerm(perm,Permissions.OWNER)) perm = AdminAlt;
    let chperm = Number(data.channel.channel_permissions)&OwnerAlt;
    if (hasPerm(chperm,Permissions.OWNER)) chperm = OwnerAlt;
    if (hasPerm(chperm,Permissions.ADMIN)&&!hasPerm(chperm,Permissions.OWNER)) chperm = AdminAlt;
    window.channels[0].id = sanitizeMinimChars(data.channel.id);
    window.channels[0].type = Number(data.channel.type)??1;
    window.channels[0].name = data.channel.name??'';
    window.channels[0].pfp = data.channel.pfp?sanitizeMinimChars(data.channel.pfp):null;
    window.channels[0].permission = perm;
    window.channels[0].base_permissions = chperm;
    window.channels[0].last_message = null;
    window.channels[0].member_count = Number(data.channel.member_count)??1;
    window.channels[0].unread_count = 0;
    showChannels(window.channels);
    if (window.currentChannel==='') window.loadChannel(sanitizeMinimChars(data.channel.id));
  });
  window.stream.addEventListener('channel_edited', (event)=>{
    let data = JSON.parse(event.data);
    let idx = window.channels.findIndex(ch=>ch.id===data.channel_id);
    let chperm = Number(data.channel.channel_permissions)&OwnerAlt;
    if (hasPerm(chperm,Permissions.OWNER)) chperm = OwnerAlt;
    if (hasPerm(chperm,Permissions.ADMIN)&&!hasPerm(chperm,Permissions.OWNER)) chperm = AdminAlt;
    window.channels[idx].name = data.channel.name??'';
    window.channels[idx].pfp = data.channel.pfp?sanitizeMinimChars(data.channel.pfp):null;
    window.channels[idx].base_permissions = chperm;
    window.channels[idx].default_ttl = data.channel.default_ttl??null;
    showChannels(window.channels);
  });
  window.stream.addEventListener('channel_deleted', (event)=>{
    let data = JSON.parse(event.data);
    window.channels = window.channels.filter(ch=>ch.id!==data.channel_id);
    MemberStore.delete(data.channel_id);
    showChannels(window.channels);
  });
  // Members
  window.stream.addEventListener('member_join', (event)=>{
    let data = JSON.parse(event.data);
    if (window.keys[data.channel_id]) {
      let last = Object.keys(window.keys[data.channel_id]).reduce((a, b) => window.keys[data.channel_id][a]?.expires_at > window.keys[data.channel_id][b]?.expires_at ? a : b, '');
      if (last) window.keys[data.channel_id][last].expires_at = Date.now();
    }
    if (!MemberStore.has(data.channel_id)) return;
    let prev = MemberStore.get(data.channel_id);
    prev.push(data.user);
    let perm = Number(data.permissions)&OwnerAlt;
    if (hasPerm(perm,Permissions.OWNER)) perm = OwnerAlt;
    if (hasPerm(perm,Permissions.ADMIN)&&!hasPerm(perm,Permissions.OWNER)) perm = AdminAlt;
    prev[prev.length-1].permissions = perm;
    MemberStore.set(data.channel_id, prev);
    if (window.currentChannel===data.channel_id) showMembers(data.channel_id);
  });
  window.stream.addEventListener('member_perms_changed', (event)=>{
    let data = JSON.parse(event.data);
    if (data.username===window.username) {
      let idx2 = window.channels.findIndex(ch=>ch.id===data.channel_id);
      let perm = Number(data.permissions)&OwnerAlt;
      if (hasPerm(perm,Permissions.OWNER)) perm = OwnerAlt;
      if (hasPerm(perm,Permissions.ADMIN)&&!hasPerm(perm,Permissions.OWNER)) perm = AdminAlt;
      window.channels[idx2].permission = perm;
      if (window.currentChannel===data.channel_id) loadChannel(data.channel_id);
    }
    let prev = MemberStore.get(data.channel_id);
    if (!prev||prev.length<1) return;
    let idx = prev.findIndex(mem=>mem.username===data.username);
    prev[idx].permissions = data.permissions;
    MemberStore.set(data.channel_id, prev);
  });
  window.stream.addEventListener('member_leave', (event)=>{
    let data = JSON.parse(event.data);
    if (data.user.username===window.username) {
      window.channels = window.channels.filter(ch=>ch.id!==data.channel_id);
      MemberStore.delete(data.channel_id);
      showChannels(window.channels);
      return;
    }
    if (window.keys[data.channel_id]) {
      let last = Object.keys(window.keys[data.channel_id]).reduce((a, b) => window.keys[data.channel_id][a]?.expires_at > window.keys[data.channel_id][b]?.expires_at ? a : b, '');
      if (last) window.keys[data.channel_id][last].expires_at = Date.now();
    }
    if (!MemberStore.has(data.channel_id)) return;
    MemberStore.set(data.channel_id, MemberStore.get(data.channel_id).filter(usr=>usr.username!==data.user.username));
    if (window.currentChannel===data.channel_id) showMembers(data.channel_id);
  });
  window.stream.addEventListener('member_info_changed', async(event)=>{
    let data = JSON.parse(event.data);
    let newUser = data.user;
    let oldName = data.old_username||newUser.username;
    // Username changed (anonymization): drop the stale cache key and its presence, since clients key users by username
    if (data.old_username&&data.old_username!==newUser.username) {
      UserStore.delete(data.old_username);
      delete window.presence[data.old_username];
      delete window.lastSeen[data.old_username];
      applyPresence(data.old_username);
    }
    UserStore.set(newUser.username, Object.merge(UserStore.get(newUser.username), newUser));
    (data.channels||[]).forEach(chId=>{
      let members = MemberStore.get(chId);
      if (members) {
        let idx = members.findIndex(mem=>mem.username===oldName);
        if (idx>-1) { members[idx].username = newUser.username; members[idx].display = newUser.display; members[idx].pfp = newUser.pfp; MemberStore.set(chId, members); }
      }
      let msgs = window.messages[chId];
      if (msgs) msgs.forEach(m=>{ if (m.user&&m.user.username===oldName) { m.user.username = newUser.username; m.user.display = newUser.display; m.user.pfp = newUser.pfp; } });
    });
    if ((data.channels||[]).includes(window.currentChannel)) {
      showMembers(window.currentChannel);
      if (window.messages[window.currentChannel]) showMessages(window.messages[window.currentChannel]);
    }
  });
  // Messages
  window.stream.addEventListener('message_sent', async(event)=>{
    let data = JSON.parse(event.data);
    if (data.message?.user?.username) removeTyping(data.channel_id, data.message.user.username);
    // Move channel
    let idx = window.channels.findIndex(ch=>ch.id===data.channel_id);
    window.channels.unshift(window.channels.splice(idx,1)[0]);
    // Handle message
    if (!window.messages[data.channel_id]) window.messages[data.channel_id] = [];
    window.messages[data.channel_id].unshift(data.message);
    if (data.message.key&&data.message.iv) {
      window.messages[data.channel_id][0].content = await decodeMessage(data.message, data.channel_id);
      window.messages[data.channel_id][0].iv = null;
    }
    // Unread, ghost and other
    if (data.message.user.username===window.username) {
      window.channels[0].unread_count = 0;
      window.messages[data.channel_id] = window.messages[data.channel_id]
        .filter(m=>m.id!=='nonce-'+data.message.nonce);
      if (window.currentChannel===data.channel_id) document.getElementById('m-nonce-'+data.message.nonce)?.remove();
    } else {
      window.channels[0].unread_count += 1;
      if (window.currentChannel===data.channel_id&&document.hasFocus()) {
        playSFX('message');
        window.channels[0].unread_count = 0;
        backendfetch(`/api/v1/channel/${data.channel_id}/messages/ack`, { method: 'POST' });
      } else {
        let notifstate = getNotifStateChannel(window.channels[0].id, window.channels[0].type);
        let willNotify = localStorage.getItem('pnotif')==='true'&&(notifstate==='all'||(notifstate==='mentions'&&(new RegExp('@('+window.username+'|e)(?![a-zA-Z0-9_\\-])','im')).test(window.messages[data.channel_id][0].content)));
        if (document.hasFocus()||willNotify) playSFX('message');
        if (willNotify) notify('message', window.messages[data.channel_id][0], data.channel_id);
      }
    }
    // Show
    window.messages[data.channel_id][0].user.hide = shouldHideUser(window.messages[data.channel_id], 0, data.channel_id);
    if (window.currentChannel===data.channel_id) {
      messagesContainer.insertAdjacentHTML('afterbegin', await displayMessage(window.messages[data.channel_id][0], window.channels[0]));
      tippy(document.querySelector('.message .more'), {
        allowHTML: true,
        content: (window.username!==window.messages[data.channel_id][0].user.username&&window.messages[data.channel_id][0].user.username!==null&&window.messages[data.channel_id][0].user.username!=='e'&&!window.serverData[getCurrentServerUrl()]?.disable_channel_creation?`<button onclick="window.createChannel(1, '${sanitizeMinimChars(window.messages[data.channel_id][0].user.username)}')" tlang="member.message">Message</button>`:'')+
(window.username!==window.messages[data.channel_id][0].user.username&&window.messages[data.channel_id][0].user.username!==null?`<button onclick="window.blockmember('${sanitizeMinimChars(window.messages[data.channel_id][0].user.username)}')" class="danger" tlang="member.block">Block</button>`:'')+
  `<button onclick="navigator.clipboard.writeText(window.messages['${sanitizeMinimChars(data.channel_id)}'].find(m=>m.id==='${sanitizeMinimChars(window.messages[data.channel_id][0].id)}').content)" tlang="message.copy">Copy Contents</button>
  <button onclick="navigator.clipboard.writeText('${sanitizeMinimChars(window.messages[data.channel_id][0].id)}')" tlang="settings.copyid">Copy id</button>`,
        interactive: true,
        trigger: 'click',
        placement: 'bottom-end',
        sticky: true
      });
    }
    // Save last
    window.channels[0].last_message = {
      id: sanitizeMinimChars(data.message.id),
      content: sanitizeHTML(data.message.content||'')||imageicon,
      author: sanitizeHTML(data.message.user.display??sanitizeMinimChars(data.message.user.username||'')),
      key: data.message.key?sanitizeMinimChars(data.message.key):null,
      iv: data.message.iv?sanitizeMinimChars(data.message.iv):null
    };
    showChannels(window.channels);
  });
  window.stream.addEventListener('message_edited', async(event)=>{
    let data = JSON.parse(event.data);
    let idxc = window.channels.findIndex(ch=>ch.id===data.channel_id);
    if (window.channels[idxc].last_message?.id===data.message.id) {
      window.channels[idxc].last_message.content = sanitizeHTML(data.message.content||'')||imageicon;
      window.channels[idxc].last_message.key = data.message.key?sanitizeMinimChars(data.message.key):null;
      window.channels[idxc].last_message.iv = data.message.iv?sanitizeMinimChars(data.message.iv):null;
      delete window.channels[idxc].last_message.decrypted;
      showChannels(window.channels);
      loadChannelPreviews();
    }
    if (!window.messages[data.channel_id]) return;
    let idx = window.messages[data.channel_id].findIndex(msg=>msg.id===data.message.id);
    window.messages[data.channel_id][idx].content = data.message.content;
    window.messages[data.channel_id][idx].key = data.message.key;
    window.messages[data.channel_id][idx].iv = data.message.iv;
    window.messages[data.channel_id][idx].edited_at = data.message.edited_at;
    window.messages[data.channel_id][idx].components = data.message.components??null;
    if (window.currentChannel===data.channel_id) {
      document.getElementById('m-'+data.message.id).outerHTML = await displayMessage(window.messages[data.channel_id][idx], window.channels[idxc]);
      tippy(document.getElementById('m-'+data.message.id).querySelector('.more'), {
        allowHTML: true,
        content: (window.username!==data.message.user.username&&data.message.user.username!==null&&data.message.user.username!=='e'&&!window.serverData[getCurrentServerUrl()]?.disable_channel_creation?`<button onclick="window.createChannel(1, '${sanitizeMinimChars(data.message.user.username)}')" tlang="member.message">Message</button>`:'')+
(window.username!==data.message.user.username&&data.message.user.username!==null?`<button onclick="window.blockmember('${sanitizeMinimChars(data.message.user.username)}')" class="danger" tlang="member.block">Block</button>`:'')+
`<button onclick="navigator.clipboard.writeText(window.messages['${sanitizeMinimChars(data.channel_id)}'].find(m=>m.id==='${sanitizeMinimChars(data.message.id)}').content)" tlang="message.copy">Copy Contents</button>
<button onclick="navigator.clipboard.writeText('${sanitizeMinimChars(data.message.id)}')" tlang="settings.copyid">Copy id</button>`,
        interactive: true,
        trigger: 'click',
        placement: 'bottom-end',
        sticky: true
      });
    }
  });
  window.stream.addEventListener('message_deleted', async(event)=>{
    let data = JSON.parse(event.data);
    let idxc = window.channels.findIndex(ch=>ch.id===data.channel_id);
    if (window.messages[data.channel_id]) {
      let delIdx = window.messages[data.channel_id].findIndex(msg=>msg.id===data.message_id);
      window.messages[data.channel_id] = window.messages[data.channel_id].filter(msg=>msg.id!==data.message_id);
      if (window.currentChannel===data.channel_id) document.getElementById('m-'+data.message_id)?.remove();
      // The message right after the deleted one (newer, rendered below it) may have been grouped under its avatar
      if (delIdx>0) {
        let newerMsg = window.messages[data.channel_id][delIdx-1];
        let newHide = shouldHideUser(window.messages[data.channel_id], delIdx-1, data.channel_id);
        if (newerMsg&&newerMsg.user.hide!==newHide) {
          newerMsg.user.hide = newHide;
          if (window.currentChannel===data.channel_id) {
            let el = document.getElementById('m-'+newerMsg.id);
            if (el) {
              el.outerHTML = await displayMessage(newerMsg, window.channels[idxc]);
              tippy(document.getElementById('m-'+newerMsg.id).querySelector('.more'), {
                allowHTML: true,
                content: (window.username!==newerMsg.user.username&&newerMsg.user.username!==null&&newerMsg.user.username!=='e'&&!window.serverData[getCurrentServerUrl()]?.disable_channel_creation?`<button onclick="window.createChannel(1, '${sanitizeMinimChars(newerMsg.user.username)}')" tlang="member.message">Message</button>`:'')+
(window.username!==newerMsg.user.username&&newerMsg.user.username!==null?`<button onclick="window.blockmember('${sanitizeMinimChars(newerMsg.user.username)}')" class="danger" tlang="member.block">Block</button>`:'')+
`<button onclick="navigator.clipboard.writeText(window.messages['${sanitizeMinimChars(data.channel_id)}'].find(m=>m.id==='${sanitizeMinimChars(newerMsg.id)}').content)" tlang="message.copy">Copy Contents</button>
<button onclick="navigator.clipboard.writeText('${sanitizeMinimChars(newerMsg.id)}')" tlang="settings.copyid">Copy id</button>`,
                interactive: true,
                trigger: 'click',
                placement: 'bottom-end',
                sticky: true
              });
            }
          }
        }
      }
    }
    if (idxc>-1&&window.channels[idxc].last_message?.id===data.message_id) {
      let nm = window.messages[data.channel_id]?.[0];
      window.channels[idxc].last_message = nm ? {
        id: sanitizeMinimChars(nm.id),
        content: sanitizeHTML(nm.content||'')||imageicon,
        author: sanitizeHTML(nm.user?.display??sanitizeMinimChars(nm.user?.username||'')),
        key: nm.key?sanitizeMinimChars(nm.key):null,
        iv: nm.iv?sanitizeMinimChars(nm.iv):null
      } : null;
      showChannels(window.channels);
    }
  });
  window.stream.addEventListener('reaction_add', async(event)=>{
    let data = JSON.parse(event.data);
    if (!window.messages[data.channel_id]) return;
    let msg = window.messages[data.channel_id].find(m=>m.id===data.message_id);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = [];
    if (!msg.reactions.some(r=>r.id===data.reaction.id)) msg.reactions.push(data.reaction);
    if (window.currentChannel===data.channel_id) {
      let el = document.getElementById('m-'+data.message_id);
      if (el) {
        let ch = window.channels.find(c=>c.id===data.channel_id);
        el.querySelector('.msg-reactions')?.remove();
        el.querySelector('.inner').insertAdjacentHTML('beforeend', await buildReactionsHtml(msg, ch));
      }
    }
  });
  window.stream.addEventListener('reaction_remove', async(event)=>{
    let data = JSON.parse(event.data);
    if (!window.messages[data.channel_id]) return;
    let msg = window.messages[data.channel_id].find(m=>m.id===data.message_id);
    if (!msg||!msg.reactions) return;
    msg.reactions = msg.reactions.filter(r=>r.id!==data.reaction_id);
    if (window.currentChannel===data.channel_id) {
      let el = document.getElementById('m-'+data.message_id);
      if (el) {
        let ch = window.channels.find(c=>c.id===data.channel_id);
        el.querySelector('.msg-reactions')?.remove();
        el.querySelector('.inner').insertAdjacentHTML('beforeend', await buildReactionsHtml(msg, ch));
      }
    }
  });
  window.stream.addEventListener('call_start', (event)=>{
    let data = JSON.parse(event.data);
    // Replayed on every SSE connect for calls that were already active before we loaded.
    // Don't ring for those — only ring if the call started after our connection opened.
    if (data.timestamp&&window.streamConnectedAt&&data.timestamp<window.streamConnectedAt) { trackCall('start', data); return; }
    calls.event('start', data);
    trackCall('start', data);
  });
  window.stream.addEventListener('call_join', (event)=>{
    let data = JSON.parse(event.data);
    calls.event('join', data);
    trackCall('join', data);
  });
  window.stream.addEventListener('call_left', (event)=>{
    let data = JSON.parse(event.data);
    calls.event('left', data);
    trackCall('left', data);
    setTimeout(()=>{
      if (!window.activeCalls?.[data.channel_id]&&localStorage.getItem('pcallhist')!=='false') {
        backendfetch(`/api/v1/channel/${data.channel_id}/call-history`).then(res=>{
          if (!res?.history) return;
          if (!window.callHistory) window.callHistory = {};
          window.callHistory[data.channel_id] = res.history;
          if (window.currentChannel===data.channel_id&&window.messages[data.channel_id]) showMessages(window.messages[data.channel_id]);
        });
      }
    }, 0);
  });
  window.stream.addEventListener('call_signal', (event)=>{
    let data = JSON.parse(event.data);
    if (data.from_user===window.myId) return;
    calls.signal(data);
  });
  window.stream.addEventListener('interaction_used', async(event)=>{
    let data = JSON.parse(event.data);
    if (!window.interactionHistory) window.interactionHistory = {};
    if (!window.interactionHistory[data.channel_id]) window.interactionHistory[data.channel_id] = [];
    let item = {id: data.interaction_id, _interactionItem: true, channel_id: data.channel_id, user_username: data.user.username, user_display: data.user.display, command: data.command, bot_username: data.bot_username, timestamp: data.timestamp??Date.now()};
    window.interactionHistory[data.channel_id].unshift(item);
    if (window.currentChannel!==data.channel_id) return;
    if (window.messages[data.channel_id]?.length) {
      let top = window.messages[data.channel_id][0];
      let newHide = shouldHideUser(window.messages[data.channel_id], 0, data.channel_id);
      if (newHide!==top.user.hide) {
        top.user.hide = newHide;
        let topEl = messagesContainer.querySelector('.message');
        if (topEl) {
          topEl.outerHTML = await displayMessage(top, window.channels.find(ch=>ch.id===data.channel_id));
          tippy(document.querySelector('.message .more'), {
            allowHTML: true,
            content: (window.username!==top.user.username&&top.user.username!==null&&top.user.username!=='e'&&!window.serverData[getCurrentServerUrl()]?.disable_channel_creation?`<button onclick="window.createChannel(1, '${sanitizeMinimChars(top.user.username)}')" tlang="member.message">Message</button>`:'')+
(window.username!==top.user.username&&top.user.username!==null?`<button onclick="window.blockmember('${sanitizeMinimChars(top.user.username)}')" class="danger" tlang="member.block">Block</button>`:'')+
  `<button onclick="navigator.clipboard.writeText(window.messages['${sanitizeMinimChars(data.channel_id)}'].find(m=>m.id==='${sanitizeMinimChars(top.id)}').content)" tlang="message.copy">Copy Contents</button>
  <button onclick="navigator.clipboard.writeText('${sanitizeMinimChars(top.id)}')" tlang="settings.copyid">Copy id</button>`,
            interactive: true,
            trigger: 'click',
            placement: 'bottom-end',
            sticky: true
          });
        }
      }
    }
    messagesContainer.insertAdjacentHTML('afterbegin', renderInteractionHistoryItem(item));
  });
  window.stream.addEventListener('interaction_modal', (event)=>{
    let data = JSON.parse(event.data);
    let dlg = document.getElementById('iact-modal-dlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'iact-modal-dlg'; document.body.appendChild(dlg); }
    let fields = data.components.flatMap(r=>r.type===1?r.components.filter(c=>c.type===4):[]);
    dlg.innerHTML = `<h3>${sanitizeHTML(data.title)}</h3><form method="dialog">${fields.map(f=>`<label>${sanitizeHTML(f.label||'')}${f.style===2?`<textarea name="${sanitizeMinimChars(f.custom_id)}" placeholder="${sanitizeAttr(f.placeholder||'')}"${f.required?' required':''}${f.min_length?` minlength="${f.min_length}"`:''} ${f.max_length?`maxlength="${f.max_length}"`:''} >${sanitizeHTML(f.value||'')}</textarea>`:`<input name="${sanitizeMinimChars(f.custom_id)}" placeholder="${sanitizeAttr(f.placeholder||'')}"${f.required?' required':''}${f.min_length?` minlength="${f.min_length}"`:''} ${f.max_length?`maxlength="${f.max_length}"`:''} value="${sanitizeAttr(f.value||'')}">`}</label>`).join('')}<div class="modal-actions"><button type="button" onclick="this.closest('dialog').close()">Cancel</button><button type="submit" class="primary">Submit</button></div></form>`;
    dlg.dataset.iid = sanitizeMinimChars(data.interaction_id);
    dlg.querySelector('form').onsubmit = function(e) { e.preventDefault(); window.submitModal(dlg.dataset.iid, Object.fromEntries(new FormData(this)), dlg); };
    dlg.showModal();
  });
}

// User
window.deletesession = (id)=>{
  backendfetch('/api/v1/me/session/'+id, {
    method: 'DELETE'
  })
    .then(()=>{ if (document.getElementById('sessions-modal').open) window.renderSessions(); });
};
window.useredit = ()=>{
  let modal = document.getElementById('edit-user');
  modal.showModal();
  backendfetch('/api/v1/me', { passstatus: true })
    .then(showuserdata);
  document.getElementById('ue-display').onchange = ()=>{
    let formData = new FormData();
    formData.append('display', document.getElementById('ue-display').value);
    backendfetch('/api/v1/me', {
      method: 'PATCH',
      body: formData
    })
      .then(window.useredit);
  };
  document.getElementById('ue-imginp').onchange = async(evt)=>{
    if (!evt.target.files[0]) return;
    if (!evt.target.files[0].type.startsWith('image/')) return;
    let img = await processImageToPfp(evt.target.files[0]);
    let formData = new FormData();
    formData.append('pfp', img, 'pfp.webp');
    backendfetch('/api/v1/me', {
      method: 'PATCH',
      body: formData
    })
      .then(window.useredit);
  }
  document.getElementById('ue-img').onclick = ()=>{
    document.getElementById('ue-imginp').click();
  };
  document.getElementById('ue-img-remove').onclick = ()=>{
    let formData = new FormData();
    formData.append('remove_pfp', '1');
    backendfetch('/api/v1/me', { method: 'PATCH', body: formData }).then(window.useredit);
  };
  modal.querySelector('button[tlang="user.blocks"]').onclick = ()=>{ document.getElementById('blocks-modal').showModal(); window.renderBlocks(); };
  modal.querySelector('button[tlang="user.sessions"]').onclick = ()=>{ document.getElementById('sessions-modal').showModal(); window.renderSessions(); };
  modal.querySelector('button[tlang="user.connectedapps"]').onclick = ()=>{ document.getElementById('connected-apps-modal').showModal(); window.renderConnectedApps(); };
  modal.querySelector('button[tlang="user.bots"]').onclick = ()=>{ document.getElementById('bots-modal').showModal(); window.renderBots(); };
  modal.querySelector('button[tlang="user.oauthapps"]').onclick = ()=>{ document.getElementById('oauth-apps-modal').showModal(); window.renderOAuthApps(); };
  modal.querySelector('button[tlang="user.verify"]').onclick = ()=>{ document.getElementById('verify-modal').showModal(); window.renderVerify(); };
  modal.querySelector('button[tlang="user.devicelink"]').onclick = ()=>{ document.getElementById('devicelink-modal').showModal(); window.renderDeviceLink(); };
};
window.renderBlocks = ()=>{
  let m = document.getElementById('blocks-modal');
  m.querySelector('button.add').onclick = async()=>{
    let mem = await ask('user.blockask', 3);
    if (!mem) return;
    window.blockmember(mem);
    setTimeout(window.renderBlocks, 100);
  };
  backendfetch('/api/v1/me/blocks')
    .then(res=>{
      m.querySelector('.list').innerHTML = res
        .map(usr=>`<div class="block">
  <img src="${usr.pfp?pfpById(usr.pfp):userToDefaultPfp(usr)}" width="30" height="30" aria-hidden="true" loading="lazy" onerror="this.src='${userToDefaultPfp(usr)}'">
  <span>
    <span>${sanitizeHTML(usr.display??sanitizeMinimChars(usr.username))}</span>
    <span class="small">${formatTime(Math.floor(usr.blocked_at*1000))}</span>
  </span>
  <button onclick="window.unblockmember('${sanitizeMinimChars(usr.username)}')">x</button>
</div>`)
        .join('')||'<span tlang="user.noblocks">No blocked users</span>';
      window.translate();
    });
};
window.renderSessions = ()=>{
  let m = document.getElementById('sessions-modal');
  m.querySelector('button.danger').onclick = logoutall;
  backendfetch('/api/v1/me/sessions')
    .then(async(res)=>{
      let key = (await getRSAKeyPair()).privateKey;
      res.sort((a,b)=>b.logged_in_at-a.logged_in_at);
      for (let i = 0; i<res.length; i++) {
        res[i].browser = await decryptRSAString(res[i].browser, key);
        res[i].device = await decryptRSAString(res[i].device, key);
      }
      m.querySelector('.list').innerHTML = res
        .map(ses=>`<div class="session">
  <span>
    <span>${sanitizeHTML(ses.browser)} · ${sanitizeHTML(ses.device)}</span>
    <span class="small">${formatTime(Math.floor(ses.logged_in_at*1000))}</span>
  </span>
  ${ses.current?'<span tlang="user.currentsession">(current)</span>':`<button onclick="window.deletesession('${sanitizeMinimChars(ses.id)}')">x</button>`}
</div>`)
        .join('');
      window.translate();
    });
};
window.renderConnectedApps = ()=>{
  let m = document.getElementById('connected-apps-modal');
  backendfetch('/api/v1/me/oauth-consents')
    .then(res=>{
      m.querySelector('.list').innerHTML = (Array.isArray(res)?res:[])
        .map(c=>`<div class="session">
  <span>
    <span>${sanitizeHTML(c.app_name)}</span>
    <span class="small">${formatTime(Math.floor(c.granted_at*1000))}</span>
  </span>
  <button onclick="window.revokeConnectedApp('${sanitizeMinimChars(c.app_id)}')">x</button>
</div>`)
        .join('')||'<span tlang="oauthconsent.none">No connected apps</span>';
      window.translate();
    });
};
window.revokeConnectedApp = async(id)=>{
  await backendfetch('/api/v1/me/oauth-consents/'+id, { method: 'DELETE' });
  window.renderConnectedApps();
};
let _botPfpId = null;
window.renderBots = ()=>{
  let m = document.getElementById('bots-modal');
  m.querySelector('button.create').onclick = ()=>window.createbot();
  document.getElementById('bot-pfp-inp').onchange = async(evt)=>{
    if (!evt.target.files[0]||!_botPfpId) return;
    if (!evt.target.files[0].type.startsWith('image/')) return;
    let img = await processImageToPfp(evt.target.files[0]);
    let fd = new FormData();
    fd.append('pfp', img, 'pfp.webp');
    await backendfetch('/api/v1/bot/'+_botPfpId, { method: 'PATCH', body: fd });
    evt.target.value = '';
    _botPfpId = null;
    window.renderBots();
  };
  backendfetch('/api/v1/bots')
    .then(res=>{
      m.querySelector('.list').innerHTML = (Array.isArray(res)?res:[])
        .map(bot=>`<div class="bot">
  <div class="bot-head">
    <span class="bot-av" tabindex="0" role="button" onclick="window.editbotpfp('${sanitizeMinimChars(bot.id)}')" title="Change photo">
      <img src="${bot.pfp?pfpById(bot.pfp):userToDefaultPfp(bot)}" width="30" height="30" aria-hidden="true" loading="lazy" onerror="this.src='${userToDefaultPfp(bot)}'">
      ${bot.pfp?`<button class="rm-pfp" onclick="event.stopPropagation();window.removebotpfp('${sanitizeMinimChars(bot.id)}')" title="Remove photo" aria-label="Remove photo">×</button>`:''}
    </span>
    <span>
      <span>${sanitizeHTML(bot.display??sanitizeMinimChars(bot.username))}</span>
      <span class="small">@${sanitizeMinimChars(bot.username)}</span>
    </span>
  </div>
  <div class="bot-actions">
    <button onclick="window.addbottochannel('${sanitizeMinimChars(bot.id)}','${sanitizeMinimChars(bot.username)}')" tlang="bot.addchannel">Add to channel</button>
    <button onclick="window.togglebotprivacy('${sanitizeMinimChars(bot.id)}',${bot.private?0:1})" tlang="bot.${bot.private?'private':'public'}">${bot.private?'Private':'Public'}</button>
    <button onclick="window.copybotlink('${sanitizeMinimChars(bot.username)}')" tlang="bot.copylink">Copy add link</button>
    <button onclick="window.editbot('${sanitizeMinimChars(bot.id)}')" tlang="bot.editdisplay">Display</button>
    <button onclick="window.regenbot('${sanitizeMinimChars(bot.id)}','${sanitizeMinimChars(bot.username)}','${sanitizeAttr(bot.display??bot.username)}')" tlang="bot.regen">Token</button>
    <button class="danger" onclick="window.deletebot('${sanitizeMinimChars(bot.id)}','${sanitizeAttr(bot.display??bot.username)}')">x</button>
  </div>
</div>`)
        .join('')||'<span tlang="bot.none">No bots</span>';
      window.translate();
    });
};
let verifyStream = null;
let verifyLoop = null;
let verifyTarget = null;
function verifyStopCamera() {
  if (verifyLoop) { clearInterval(verifyLoop); verifyLoop = null; }
  if (verifyStream) { verifyStream.getTracks().forEach(t=>t.stop()); verifyStream = null; }
  let v = document.querySelector('#verify-modal .verify-video');
  if (v) { v.style.display = 'none'; v.srcObject = null; }
}
async function verifyHandleCode(raw) {
  let parts = (raw??'').trim().split(':');
  if (parts.length!==4||parts[0]!=='holt'||parts[1]!=='vkey'||!parts[2]||!parts[3]) { notice('verify.invalid'); return false; }
  let uname = parts[2];
  let scanned = parts[3];
  verifyStopCamera();
  // The code parsed fine but is for someone other than the person this dialog is verifying; say so clearly.
  if (verifyTarget&&uname!==verifyTarget) { notice('verify.wronguser', uname); return true; }
  let known = PKStore.get(uname);
  if (known&&known!==scanned) {
    if (!await affirm('message.publicChange', uname)) return true;
    PKStore.set(uname, scanned);
  } else if (!known) {
    PKStore.set(uname, scanned);
  }
  PKVerified.add(uname);
  saveToDB();
  if (window.currentChannel) showMembers(window.currentChannel);
  notice('verify.success', uname);
  return true;
}
async function verifyStartScan() {
  let m = document.getElementById('verify-modal');
  let v = m.querySelector('.verify-video');
  // The paste field is always shown for code-based verification; this just adds camera scanning on top when available.
  try {
    verifyStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    notice('verify.nocamera');
    return;
  }
  v.srcObject = verifyStream;
  v.style.display = '';
  await v.play();
  // BarcodeDetector is missing on desktop Linux Chrome, so decode frames with jsQR when it isn't available.
  let formats = [];
  try { if ('BarcodeDetector' in window) formats = await BarcodeDetector.getSupportedFormats(); } catch (e) {}
  let detector = (!window.HoltNative && formats.includes('qr_code'))?new BarcodeDetector({ formats: ['qr_code'] }):null;
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  verifyLoop = setInterval(async()=>{
    if (!v.videoWidth) return;
    try {
      if (detector) {
        let codes = await detector.detect(v);
        if (codes.length) await verifyHandleCode(codes[0].rawValue);
      } else {
        let scale = Math.min(1, 640/Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth*scale);
        canvas.height = Math.round(v.videoHeight*scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        let img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let code = jsQR(img.data, img.width, img.height);
        if (code) await verifyHandleCode(code.data);
      }
    } catch (e) {}
  }, 300);
}
window.renderVerify = async(targetUsername)=>{
  verifyTarget = targetUsername??null;
  let m = document.getElementById('verify-modal');
  verifyStopCamera();
  m.onclose = ()=>verifyStopCamera();
  m.querySelector('.verify-scan').onclick = ()=>verifyStartScan();
  let myPub = localStorage.getItem(window.currentServer+'-publicKey');
  let myCode = `holt:vkey:${window.username}:${myPub}`;
  let qr = qrcode(0, 'M');
  qr.addData(myCode);
  qr.make();
  m.querySelector('.verify-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8 });
  m.querySelector('.verify-copy').onclick = ()=>navigator.clipboard.writeText(myCode);
  let paste = m.querySelector('.verify-paste');
  paste.value = '';
  paste.onkeydown = (ev)=>{ if (ev.key==='Enter') verifyHandleCode(paste.value); };
  // Pasting a full code (the 4-part holt:vkey:user:key string) verifies immediately without needing to press Enter.
  paste.oninput = ()=>{ if (paste.value.trim().split(':').length>=4) verifyHandleCode(paste.value); };
  let digest = await crypto.subtle.digest('SHA-256', base64ToBuffer(myPub));
  let fp = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  let fpEl = m.querySelector('.verify-fp');
  // Set the text directly (and drop the tlang) so a later translate() pass can't reset it back to the raw "{}" template.
  fpEl.removeAttribute('tlang');
  fpEl.innerText = (await getTranslation('verify.fingerprint')).replace('{}', fp);
  if (targetUsername) verifyStartScan();
};
let deviceLinkPoll = null;
let deviceLinkCode = null;
function deviceLinkStop() {
  if (deviceLinkPoll) { clearInterval(deviceLinkPoll); deviceLinkPoll = null; }
  deviceLinkCode = null;
}
async function deviceLinkFingerprint(b64) {
  let digest = await crypto.subtle.digest('SHA-256', base64ToBuffer(b64));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
window.renderDeviceLink = async()=>{
  let m = document.getElementById('devicelink-modal');
  deviceLinkStop();
  m.onclose = ()=>deviceLinkStop();
  let wait = m.querySelector('.dl-wait');
  let req = m.querySelector('.dl-request');
  wait.style.display = '';
  req.style.display = 'none';
  m.querySelector('.dl-status').setAttribute('tlang', 'devicelink.waiting');
  window.translate();
  let res = await backendfetch('/api/v1/devicelink/start', { method: 'POST' });
  if (!res||!res.code) { notice('error.generic'); return; }
  deviceLinkCode = res.code;
  let qr = qrcode(0, 'M');
  qr.addData(`holt:link:${res.code}`);
  qr.make();
  m.querySelector('.dl-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8 });
  let codeText = m.querySelector('.dl-codetext');
  codeText.innerText = res.code;
  let copyCode = ()=>navigator.clipboard.writeText(res.code);
  codeText.style.cursor = 'pointer';
  codeText.onclick = copyCode;
  m.querySelector('.dl-copy').onclick = copyCode;
  deviceLinkPoll = setInterval(async()=>{
    if (!deviceLinkCode) return;
    let status = await backendfetch('/api/v1/devicelink/status?code='+encodeURIComponent(deviceLinkCode));
    if (status.status==='expired') { deviceLinkStop(); m.querySelector('.dl-status').setAttribute('tlang', 'devicelink.expired'); window.translate(); return; }
    if (status.status!=='claimed') return;
    clearInterval(deviceLinkPoll);
    deviceLinkPoll = null;
    wait.style.display = 'none';
    req.style.display = '';
    m.querySelector('.dl-device').innerText = `${sanitizeHTML(status.browser??'?')} · ${sanitizeHTML(status.device??'?')}`;
    let fp = await deviceLinkFingerprint(status.public);
    let fpEl = m.querySelector('.dl-fp');
    fpEl.removeAttribute('tlang');
    fpEl.innerText = (await getTranslation('devicelink.fingerprint')).replace('{}', fp);
    m.querySelector('.dl-reject').onclick = ()=>{ let f = new FormData(); f.append('code', deviceLinkCode); backendfetch('/api/v1/devicelink/reject', { method: 'POST', body: f }); deviceLinkStop(); m.close(); };
    m.querySelector('.dl-approve').onclick = async()=>{
      let privB64 = localStorage.getItem(window.currentServer+'-privateKey');
      let aes = await newAESKey();
      let enc = await encryptAES(new TextEncoder().encode(privB64), aes);
      let encKey = await encryptRSAString(await AESKeyToBase64(aes), await getRSAKeyFromPublic64(status.public));
      let blob = JSON.stringify({ k: encKey, d: enc.data, iv: enc.iv });
      let formData = new FormData();
      formData.append('code', deviceLinkCode);
      formData.append('blob', blob);
      let result = await backendfetch('/api/v1/devicelink/approve', { method: 'POST', body: formData });
      deviceLinkStop();
      if (result&&result.success) { notice('devicelink.approved'); m.close(); }
      else notice('error.generic');
    };
  }, 2000);
};
window.editbot = async(id)=>{
  let display = await ask('bot.display', 1, 25);
  if (!display) return;
  let formData = new FormData();
  formData.append('display', display);
  await backendfetch('/api/v1/bot/'+id, {
    method: 'PATCH',
    body: formData
  });
  if (document.getElementById('bots-modal').open) window.renderBots();
};
window.editbotpfp = (id)=>{
  _botPfpId = id;
  document.getElementById('bot-pfp-inp').click();
};
window.removebotpfp = async(id)=>{
  let fd = new FormData();
  fd.append('remove_pfp', '1');
  await backendfetch('/api/v1/bot/'+id, { method: 'PATCH', body: fd });
  if (document.getElementById('bots-modal').open) window.renderBots();
};
window.regenbot = async(id, username, label)=>{
  let conf = await affirm('bot.regen', label);
  if (!conf) return;
  let res = await backendfetch('/api/v1/bot/'+id+'/token', { method: 'POST', passstatus: true });
  if (res.status!==201||!res.token) {
    notice('bot.error');
    return;
  }
  revealBotCreds(username, res.token, null);
};
window.deletebot = async(id, name)=>{
  let conf = await affirm('bot.delete', name);
  if (!conf) return;
  await backendfetch('/api/v1/bot/'+id, { method: 'DELETE' });
  if (document.getElementById('bots-modal').open) window.renderBots();
};
function fillPermCheckboxes(preChecked) {
  document.getElementById('ab-perms').innerHTML = ['SEND_MESSAGES','MANAGE_MESSAGES','MANAGE_MEMBERS','MANAGE_CHANNEL','MANAGE_PERMISSION'].map(k=>`<label class="ab-permrow"><input type="checkbox" value="${Permissions[k]}"${hasPerm(preChecked, Permissions[k])?' checked':''}><span tlang="permission.${k.toLowerCase()}">${k}</span></label>`).join('');
  window.translate();
}
window.addbottochannel = async(id, username)=>{
  let manageable = (window.channels||[]).filter(ch=>ch.type!==1&&hasPerm(ch.permission, Permissions.MANAGE_MEMBERS));
  if (!manageable.length) { notice('bot.nomanage'); return; }
  let dialog = document.getElementById('addbot-modal');
  let title = document.getElementById('ab-title');
  let select = document.getElementById('ab-channel');
  let confirm = document.getElementById('ab-confirm');
  title.removeAttribute('tlang');
  select.innerHTML = manageable.map(ch=>`<option value="${sanitizeMinimChars(ch.id)}">${sanitizeHTML(ch.name??'')}</option>`).join('');
  window.getTranslation('bot.addtitle').then(t=>{ title.innerText = t.replace('{}', '@'+username); });
  fillPermCheckboxes(Permissions.SEND_MESSAGES);
  dialog.showModal();
  confirm.onclick = async()=>{
    let chosen = select.value;
    if (!chosen) return;
    let permbits = [...document.querySelectorAll('#ab-perms input:checked')].reduce((a, cb)=>a|parseInt(cb.value), 0);
    let fd = new FormData();
    fd.append('bot', id);
    fd.append('permissions', permbits||Permissions.SEND_MESSAGES);
    let res = await backendfetch(`/api/v1/channel/${chosen}/bot`, { method: 'POST', body: fd, passstatus: true });
    if (res.success) { dialog.close(); notice('bot.added'); return; }
    let e = (res.error||'').toLowerCase();
    if (e.includes('permission')) notice('bot.addperm');
    else if (e.includes('already')) notice('bot.addalready');
    else notice('error.generic');
  };
};
window.togglebotprivacy = async(id, makePrivate)=>{
  let fd = new FormData();
  fd.append('private', makePrivate?'1':'0');
  await backendfetch('/api/v1/bot/'+id, { method: 'PATCH', body: fd });
  if (document.getElementById('bots-modal').open) window.renderBots();
};
window.copybotlink = (username)=>{
  let link = `${location.origin}${location.pathname}?addBot=${encodeURIComponent(username)}&permissions=${Permissions.SEND_MESSAGES}`;
  navigator.clipboard.writeText(link);
  notice('bot.linkcopied');
};
window.handleAddBotLink = ()=>{
  let params = new URLSearchParams(location.search);
  let botName = params.get('addBot');
  if (!botName) return;
  let perms = parseInt(params.get('permissions'))||Permissions.SEND_MESSAGES;
  history.replaceState(null, '', location.pathname);
  let manageable = (window.channels||[]).filter(ch=>ch.type!==1&&hasPerm(ch.permission, Permissions.MANAGE_MEMBERS));
  if (!manageable.length) { notice('bot.nomanage'); return; }
  let dialog = document.getElementById('addbot-modal');
  let title = document.getElementById('ab-title');
  let select = document.getElementById('ab-channel');
  let confirm = document.getElementById('ab-confirm');
  title.removeAttribute('tlang');
  select.innerHTML = manageable.map(ch=>`<option value="${sanitizeMinimChars(ch.id)}">${sanitizeHTML(ch.name??'')}</option>`).join('');
  window.getTranslation('bot.addtitle').then(t=>{ title.innerText = t.replace('{}', '@'+botName); });
  fillPermCheckboxes(perms);
  dialog.showModal();
  confirm.onclick = async()=>{
    let chosen = select.value;
    if (!chosen) return;
    let permbits = [...document.querySelectorAll('#ab-perms input:checked')].reduce((a, cb)=>a|parseInt(cb.value), 0);
    let fd = new FormData();
    fd.append('bot', botName);
    fd.append('permissions', permbits||Permissions.SEND_MESSAGES);
    let res = await backendfetch(`/api/v1/channel/${chosen}/bot`, { method: 'POST', body: fd, passstatus: true });
    if (res.success) {
      dialog.close();
      notice('bot.added');
      loadChannel(chosen);
      return;
    }
    let e = (res.error||'').toLowerCase();
    if (e.includes('own')||e.includes('permission')) notice('bot.addperm');
    else if (e.includes('already')) notice('bot.addalready');
    else if (e.includes('not found')) notice('error.generic');
    else notice('error.generic');
  };
};
window.handleOAuthAuthorize = async()=>{
  let params = new URLSearchParams(location.search);
  if (params.get('oauth_authorize')!=='1') return;
  let clientId = params.get('client_id');
  let redirectUri = params.get('redirect_uri');
  let scope = params.get('scope')||'identify';
  let state = params.get('state')||'';
  let codeChallenge = params.get('code_challenge');
  let codeChallengeMethod = params.get('code_challenge_method')||'S256';
  history.replaceState(null, '', location.pathname);
  if (!clientId||!redirectUri||!codeChallenge) { notice('oauthconsent.invalid'); return; }
  let info = await backendfetch(`/api/v1/oauth/authorize/info?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`, { passstatus: true });
  if (info.status!==200||!info.success) { notice('oauthconsent.invalid'); return; }
  let decide = async(allow)=>{
    let fd = new FormData();
    fd.append('client_id', clientId);
    fd.append('redirect_uri', redirectUri);
    fd.append('scope', scope);
    fd.append('state', state);
    fd.append('allow', allow?'1':'0');
    if (allow) {
      fd.append('code_challenge', codeChallenge);
      fd.append('code_challenge_method', codeChallengeMethod);
    }
    let res = await backendfetch('/api/v1/oauth/authorize/decision', { method: 'POST', body: fd, passstatus: true });
    if (res.redirect_to) location.href = res.redirect_to;
    else notice('oauthconsent.invalid');
  };
  if (info.already_consented) {
    decide(true);
    return;
  }
  let dialog = document.getElementById('oauth-consent-modal');
  dialog.querySelector('.oc-appname').innerText = info.app.name;
  dialog.querySelector('.oc-appicon').src = info.app.pfp?pfpById(info.app.pfp):userToDefaultPfp({display: info.app.name});
  dialog.querySelector('.oc-appicon').onerror = (evt)=>evt.target.src=userToDefaultPfp({display: info.app.name});
  window.getTranslation('oauthconsent.body').then(t=>{ dialog.querySelector('.oc-body').innerText = t.replace('{}', info.app.name).replace('{}', window.username); });
  dialog.showModal();
  dialog.querySelector('.oc-allow').onclick = ()=>{ dialog.close(); decide(true); };
  dialog.querySelector('.oc-deny').onclick = ()=>{ dialog.close(); decide(false); };
};
window.createbot = ()=>{
  let dialog = document.getElementById('bot-create');
  let username = document.getElementById('bc-username');
  let display = document.getElementById('bc-display');
  let errors = document.getElementById('bc-errors');
  let submit = document.getElementById('bc-submit');
  username.value = '';
  display.value = '';
  errors.setAttribute('tlang', 'empty');
  username.removeAttribute('invalid');
  dialog.showModal();
  username.focus();
  username.oninput = ()=>{
    username.value = username.value.toLowerCase();
    errors.setAttribute('tlang', 'empty');
    username.removeAttribute('invalid');
  };
  submit.onclick = async()=>{
    let name = username.value;
    if (!(/^[a-z0-9_\-]{3,20}$/).test(name)) {
      errors.setAttribute('tlang', 'error.username');
      username.setAttribute('invalid', true);
      window.translate();
      return;
    }
    submit.setAttribute('disabled', '');
    let keyPair = await window.crypto.subtle.generateKey({
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']);
    let publicKey = bufferToBase64(await window.crypto.subtle.exportKey('spki', keyPair.publicKey));
    let privateKey = bufferToBase64(await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    let formData = new FormData();
    formData.append('username', name);
    formData.append('public', publicKey);
    if (display.value) formData.append('display', display.value);
    let res = await backendfetch('/api/v1/bots', { method: 'POST', body: formData, passstatus: true });
    submit.removeAttribute('disabled');
    if (res.status===409||res.status===403) {
      errors.setAttribute('tlang', 'bot.error.cap');
      window.translate();
      return;
    }
    if (res.status===400) {
      errors.setAttribute('tlang', 'error.usernameuse');
      username.setAttribute('invalid', true);
      window.translate();
      return;
    }
    if (res.status!==201||!res.token) {
      errors.setAttribute('tlang', 'error.generic');
      window.translate();
      return;
    }
    dialog.close();
    revealBotCreds(name, res.token, privateKey);
    if (document.getElementById('bots-modal').open) window.renderBots();
  };
};
function revealBotCreds(username, token, privateKey) {
  let modal = document.getElementById('bot-reveal');
  let keyrow = modal.querySelector('.br-keyrow');
  document.getElementById('br-token').value = token;
  document.getElementById('br-token-copy').onclick = ()=>{
    document.getElementById('br-token').select();
    navigator.clipboard.writeText(token);
  };
  keyrow.style.display = privateKey?'':'none';
  let payload = { username: username, token: token };
  if (privateKey) {
    document.getElementById('br-private').value = privateKey;
    document.getElementById('br-private-copy').onclick = ()=>{
      document.getElementById('br-private').select();
      navigator.clipboard.writeText(privateKey);
    };
    payload.privateKey = privateKey;
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
  let instanceFileName = sanitizeMinimChars(getCurrentServerUrl().split('://')[1].split('/')[0].split(':')[0].replaceAll('.','-'));
  document.getElementById('br-download').href = URL.createObjectURL(blob);
  document.getElementById('br-download').download = sanitizeMinimChars(username)+'.'+instanceFileName+'.bot.keys';
  modal.showModal();
  let doneBtn = document.getElementById('br-done');
  doneBtn.onclick = ()=>{};
  doneBtn.setAttribute('disabled', '');
  doneBtn.removeAttribute('tlang');
  doneBtn.innerText = '...';
  setTimeout(()=>{doneBtn.innerText = '..';}, 1000);
  setTimeout(()=>{doneBtn.innerText = '.';}, 2000);
  setTimeout(()=>{
    doneBtn.setAttribute('tlang', 'signup.done');
    window.translate();
    doneBtn.removeAttribute('disabled');
    doneBtn.onclick = ()=>{modal.close();};
  }, 3000);
}
let _oauthAppsCache = [];
window.renderOAuthApps = ()=>{
  let m = document.getElementById('oauth-apps-modal');
  m.querySelector('button.create').onclick = ()=>window.createOAuthApp();
  backendfetch('/api/v1/oauth/apps')
    .then(res=>{
      _oauthAppsCache = Array.isArray(res)?res:[];
      m.querySelector('.list').innerHTML = _oauthAppsCache
        .map(app=>`<div class="bot">
  <div class="bot-head">
    <img src="${app.pfp?pfpById(app.pfp):userToDefaultPfp({display: app.name})}" width="30" height="30" aria-hidden="true" loading="lazy" onerror="this.src='${userToDefaultPfp({display: app.name})}'">
    <span>
      <span>${sanitizeHTML(app.name)}</span>
      <span class="small">${sanitizeHTML(app.id)}</span>
    </span>
  </div>
  <div class="bot-actions">
    <button onclick="window.editOAuthApp('${sanitizeMinimChars(app.id)}')" tlang="oauthapp.edit.title">Edit</button>
    <button onclick="window.regenOAuthSecret('${sanitizeMinimChars(app.id)}','${sanitizeAttr(app.name)}')" tlang="oauthapp.regen">Secret</button>
    <button class="danger" onclick="window.deleteOAuthApp('${sanitizeMinimChars(app.id)}','${sanitizeAttr(app.name)}')">x</button>
  </div>
</div>`)
        .join('')||'<span tlang="oauthapp.none">No OAuth apps</span>';
      window.translate();
    });
};
let _oauthCreateIcon = null;
let _oauthEditIcon = null;
window.createOAuthApp = ()=>{
  let dialog = document.getElementById('oauth-app-create');
  let name = document.getElementById('oac-name');
  let redirects = document.getElementById('oac-redirects');
  let errors = document.getElementById('oac-errors');
  let submit = document.getElementById('oac-submit');
  let iconinp = document.getElementById('oac-iconinp');
  let iconprev = document.getElementById('oac-iconpreview');
  name.value = '';
  redirects.value = '';
  errors.setAttribute('tlang', 'empty');
  _oauthCreateIcon = null;
  iconprev.src = userToDefaultPfp({display: '?'});
  document.getElementById('oac-iconbtn').onclick = ()=>iconinp.click();
  iconinp.onchange = async(evt)=>{
    if (!evt.target.files[0]||!evt.target.files[0].type.startsWith('image/')) return;
    _oauthCreateIcon = await processImageToPfp(evt.target.files[0]);
    iconprev.src = URL.createObjectURL(_oauthCreateIcon);
    evt.target.value = '';
  };
  dialog.showModal();
  name.focus();
  submit.onclick = async()=>{
    let uris = redirects.value.split('\n').map(l=>l.trim()).filter(Boolean);
    if (name.value.length<2) { errors.setAttribute('tlang', 'error.generic'); window.translate(); return; }
    if (!uris.length) { errors.setAttribute('tlang', 'error.generic'); window.translate(); return; }
    submit.setAttribute('disabled', '');
    let formData = new FormData();
    formData.append('name', name.value);
    formData.append('redirect_uris', JSON.stringify(uris));
    if (_oauthCreateIcon) formData.append('pfp', _oauthCreateIcon, 'pfp.webp');
    let res = await backendfetch('/api/v1/oauth/apps', { method: 'POST', body: formData, passstatus: true });
    submit.removeAttribute('disabled');
    if (res.status===403) { errors.setAttribute('tlang', 'oauthapp.error.cap'); window.translate(); return; }
    if (res.status!==201) { errors.setAttribute('tlang', 'oauthapp.error'); window.translate(); return; }
    dialog.close();
    revealOAuthAppCreds(res.client_id, res.client_secret);
    if (document.getElementById('oauth-apps-modal').open) window.renderOAuthApps();
  };
};
window.editOAuthApp = (id)=>{
  let app = _oauthAppsCache.find(a=>a.id===id);
  if (!app) return;
  let dialog = document.getElementById('oauth-app-edit');
  let name = document.getElementById('oae-name');
  let redirects = document.getElementById('oae-redirects');
  let errors = document.getElementById('oae-errors');
  let submit = document.getElementById('oae-submit');
  let iconinp = document.getElementById('oae-iconinp');
  let iconprev = document.getElementById('oae-iconpreview');
  name.value = app.name;
  redirects.value = app.redirect_uris.join('\n');
  errors.setAttribute('tlang', 'empty');
  _oauthEditIcon = null;
  iconprev.src = app.pfp?pfpById(app.pfp):userToDefaultPfp({display: app.name});
  document.getElementById('oae-iconbtn').onclick = ()=>iconinp.click();
  iconinp.onchange = async(evt)=>{
    if (!evt.target.files[0]||!evt.target.files[0].type.startsWith('image/')) return;
    _oauthEditIcon = await processImageToPfp(evt.target.files[0]);
    iconprev.src = URL.createObjectURL(_oauthEditIcon);
    evt.target.value = '';
  };
  dialog.showModal();
  submit.onclick = async()=>{
    let uris = redirects.value.split('\n').map(l=>l.trim()).filter(Boolean);
    if (name.value.length<2) { errors.setAttribute('tlang', 'error.generic'); window.translate(); return; }
    if (!uris.length) { errors.setAttribute('tlang', 'error.generic'); window.translate(); return; }
    submit.setAttribute('disabled', '');
    let formData = new FormData();
    formData.append('name', name.value);
    formData.append('redirect_uris', JSON.stringify(uris));
    if (_oauthEditIcon) formData.append('pfp', _oauthEditIcon, 'pfp.webp');
    let res = await backendfetch('/api/v1/oauth/apps/'+id, { method: 'PATCH', body: formData, passstatus: true });
    submit.removeAttribute('disabled');
    if (!res.success) { errors.setAttribute('tlang', 'oauthapp.error'); window.translate(); return; }
    dialog.close();
    window.renderOAuthApps();
  };
};
window.regenOAuthSecret = async(id, name)=>{
  let conf = await affirm('oauthapp.regen', name);
  if (!conf) return;
  let res = await backendfetch('/api/v1/oauth/apps/'+id+'/secret', { method: 'POST', passstatus: true });
  if (res.status!==201||!res.client_secret) { notice('oauthapp.error'); return; }
  revealOAuthAppCreds(id, res.client_secret);
};
window.deleteOAuthApp = async(id, name)=>{
  let conf = await affirm('oauthapp.delete', name);
  if (!conf) return;
  await backendfetch('/api/v1/oauth/apps/'+id, { method: 'DELETE' });
  if (document.getElementById('oauth-apps-modal').open) window.renderOAuthApps();
};
function revealOAuthAppCreds(clientId, clientSecret) {
  let modal = document.getElementById('oauth-app-reveal');
  document.getElementById('oar-clientid').value = clientId;
  document.getElementById('oar-clientid-copy').onclick = ()=>{
    document.getElementById('oar-clientid').select();
    navigator.clipboard.writeText(clientId);
  };
  document.getElementById('oar-clientsecret').value = clientSecret;
  document.getElementById('oar-clientsecret-copy').onclick = ()=>{
    document.getElementById('oar-clientsecret').select();
    navigator.clipboard.writeText(clientSecret);
  };
  const blob = new Blob([JSON.stringify({ client_id: clientId, client_secret: clientSecret })], { type: 'text/plain' });
  let instanceFileName = sanitizeMinimChars(getCurrentServerUrl().split('://')[1].split('/')[0].split(':')[0].replaceAll('.','-'));
  document.getElementById('oar-download').href = URL.createObjectURL(blob);
  document.getElementById('oar-download').download = sanitizeMinimChars(clientId)+'.'+instanceFileName+'.oauth-app.keys';
  modal.showModal();
  let doneBtn = document.getElementById('oar-done');
  doneBtn.onclick = ()=>{};
  doneBtn.setAttribute('disabled', '');
  doneBtn.removeAttribute('tlang');
  doneBtn.innerText = '...';
  setTimeout(()=>{doneBtn.innerText = '..';}, 1000);
  setTimeout(()=>{doneBtn.innerText = '.';}, 2000);
  setTimeout(()=>{
    doneBtn.setAttribute('tlang', 'signup.done');
    window.translate();
    doneBtn.removeAttribute('disabled');
    doneBtn.onclick = ()=>{modal.close();};
  }, 3000);
}
window.showuserdata = (me)=>{
  if (me.status===401) {
    logout(); // Session is incorrect, re login
  } else if (me.status===500) {
    location.reload();
  } else if (me.success===false) {
    // Uh issue isn't the session or server but still failed, try to work without user data
  } else {
    UserStore.set(me.username, Object.merge(UserStore.get(me.username), me));
    window.username = sanitizeMinimChars(me.username);
    window.myId = me.id;
    if (me.presence==='idle'&&me.status_auto) setMyStatus('online');
    else if (me.presence) window.myStatus = me.presence;
    if ('share_typing' in me) window.myShareTyping = me.share_typing!==0;
    applyMyStatus();
    window.servers[window.servers.findIndex(srv=>srv.id===window.currentServer)].name = me.username;
    localStorage.setItem('servers', JSON.stringify(window.servers));
    if (window.showServerList) window.showServerList();
    document.querySelector('#user img').src = me.pfp?pfpById(me.pfp):userToDefaultPfp(me);
    document.querySelector('#user img').onerror = (evt)=>evt.target.src=userToDefaultPfp(me);
    document.querySelector('#user img').setAttribute('title', me.username);
    document.getElementById('ue-display').value = me.display??'';
    document.getElementById('ue-display').placeholder = me.username??'';
    document.getElementById('ue-orig').innerText = me.username??'';
    document.querySelector('#edit-user img').src = me.pfp?pfpById(me.pfp):userToDefaultPfp(me);
    document.querySelector('#edit-user img').onerror = (evt)=>evt.target.src=userToDefaultPfp(me);
    let ueRemove = document.getElementById('ue-img-remove');
    if (ueRemove) ueRemove.style.display = me.pfp?'':'none';
    PKStore.set(window.username, localStorage.getItem(window.currentServer+'-publicKey'));
  }
  getChannels();
};

// Split & Layout
let splitinst;
let _inLayout = false;
function rebuildSplit() {
  if (_inLayout) return;
  if (splitinst) {
    splitinst.destroy();
    splitinst = null;
  }
  if (smallScreen()) return;
  let lat = document.querySelector('.lateral');
  let lateralVisible = lat.style.display!=='none';
  let savedLeft = parseFloat(localStorage.getItem('pslw'));
  let savedMember = parseFloat(localStorage.getItem('pmw'));
  let lw = (savedLeft>5&&savedLeft<60)?savedLeft:20;
  let mw = (savedMember>5&&savedMember<50)?savedMember:15;
  if (lateralVisible) {
    splitinst = Split(['side', 'main', '.lateral'], {
      sizes: [lw, 100-lw-mw, mw],
      minSize: [150, 350, 130],
      maxSize: [400, Infinity, 350],
      gutterSize: 10,
      onDragEnd: (sizes)=>{
        localStorage.setItem('pslw', sizes[0]);
        localStorage.setItem('pmw', sizes[2]);
      }
    });
  } else {
    splitinst = Split(['side', 'main'], {
      sizes: [lw, 100-lw],
      minSize: [150, 350],
      onDragEnd: (sizes)=>localStorage.setItem('pslw', sizes[0])
    });
  }
}
function layout() {
  if (smallScreen()) {
    if (splitinst) {
      splitinst.destroy();
      splitinst = null;
    }
    document.querySelectorAll('side,main').forEach(elem=>elem.style.flex = '');
    if (document.querySelector('side').style.display==='none'&&document.querySelector('main').style.display==='none') return;
    document.querySelector('side').style.display = window.currentChannel?'none':'';
    document.querySelector('main').style.display = window.currentChannel?'':'none';
    document.querySelector('.lateral').style.display = 'none';
  } else {
    document.querySelector('side').style.display = '';
    document.querySelector('main').style.display = '';
    document.querySelectorAll('side,main,.lateral').forEach(elem=>elem.style.flex = 'unset');
    if (!splitinst) {
      document.querySelector('.lateral').style.display = window.currentChannelType===2?'':'none';
      _inLayout = true;
      if (window.currentChannel.length) loadChannel(window.currentChannel);
      _inLayout = false;
      rebuildSplit();
    }
  }
}
layout();
window.onresize = ()=>{layout()};

window.username = '';
window.myId = '';
async function loadMain() {
  // User
  let me = await backendfetch('/api/v1/me', { passstatus: true })
  showuserdata(me);

  // Channel list
  await getChannels();

  // Stream
  startStream();

  // If the user opened an add-bot share link, prompt for a channel now that channels are loaded
  window.handleAddBotLink();

  // If the user arrived via a third-party OAuth login redirect, show the consent screen
  window.handleOAuthAuthorize();
}

const vts = {
  lexend: 'Lexend, Arial, sans-serif',
  arial: 'Arial, sans-serif',
  dyslexic: 'OpenDyslexic, Arial, sans-serif',
  system: 'system-ui, Arial, sans-serif'
};
window.applyAccent(localStorage.getItem('ptheme')??'#9d7bff');
document.querySelector('body').style.setProperty('--font', vts[localStorage.getItem('pfont')??'lexend']??vts.lexend);
document.querySelector('body').style.setProperty('direction', localStorage.getItem('prtl')==='true'?'rtl':'');
document.querySelector('body').style.setProperty('--sbp', localStorage.getItem('psbp')??'');
document.querySelector('body').style.setProperty('--obp', localStorage.getItem('pobp')??'');
document.getElementById('lx-theme').value = localStorage.getItem('ptheme')??'#9d7bff';
document.getElementById('srv-theme').value = localStorage.getItem('ptheme')??'#9d7bff';
tippy([document.getElementById('btn-languages'),document.getElementById('srv-btn-languages'),document.getElementById('lx-btn-languages')], {
  allowHTML: true,
  content: '<span tlang="lang.change">Change language</span>'+Array.from(new Set(Object.values(languages)))
    .map(lang=>`<button onclick="window.setLanguage('${lang}')">${getLanguageName(lang)}</button>`)
    .join('')+`<span><label for="s-rtl" tlang="settings.rtl">RTL:</label><input id="s-rtl" type="checkbox" onchange="document.querySelector('body').style.setProperty('direction',this.checked?'rtl':'');localStorage.setItem('prtl',this.checked)"${localStorage.getItem('prtl')==='true'?' checked':''}></span>
<span><label tlang="lang.timeuilang" for="timeuilang">Time uses ui locale</label><input id="timeuilang" type="checkbox" onchange="localStorage.setItem('timeUILang',this.checked)"></span>`,
  interactive: true,
  trigger: 'click',
  placement: 'top-end',
  sticky: true,
  onMount: ()=>{document.getElementById('timeuilang').checked=localStorage.getItem('timeUILang')==='true'}
});
function postLogin() {
  // Reveal chat, hide landing
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  push.syncWebPush();
  // DB
  let dbRequest = indexedDB.open('data', 2);
  dbRequest.onupgradeneeded = (e)=>{
    let db = e.target.result;
    if (!db.objectStoreNames.contains('servers')) {
      db.createObjectStore('servers');
    }
  };
  dbRequest.onsuccess = async(e)=>{
    let db = e.target.result;
    window.db = db;
    let tx = db.transaction(['servers'], 'readwrite');
    let store = tx.objectStore('servers');
    let addreq = store.add({ notifs: {}, public: {}, pinned: {} }, window.currentServer);
    addreq.onerror = (evt)=>{evt.preventDefault()};
    let req = store.get(window.currentServer);
    req.onsuccess = (e)=>{
      let val = e.target.result;
      ChannelNotifStore = new Map(Object.entries(val.notifs));
      window.ChannelNotifStore = ChannelNotifStore;
      PinnedChannelsStore = new Map(Object.entries(val.pinned??{}));
      window.PinnedChannelsStore = PinnedChannelsStore;
      PKStore = new Map(Object.entries(val.public));
      window.PKStore = PKStore;
      PKVerified = new Set(val.verified??[]);
      window.PKVerified = PKVerified;
    };
  };

  // Tippy
  tippy(document.getElementById('user'), {
    allowHTML: true,
    content: `<div class="status-pick" data-status="${window.myStatus}"><span class="dot"></span><span tlang="status.title">Status</span></div>
<button class="status-opt" onclick="window.setMyStatus('online')"><span class="sdot" style="background:var(--online)"></span><span tlang="status.online">Online</span></button>
<button class="status-opt" onclick="window.setMyStatus('idle')"><span class="sdot" style="background:var(--idle)"></span><span tlang="status.idle">Idle</span></button>
<button class="status-opt" onclick="window.setMyStatus('dnd')"><span class="sdot" style="background:var(--dnd)"></span><span tlang="status.dnd">Do not disturb</span></button>
<button class="status-opt" onclick="window.setMyStatus('invisible')"><span class="sdot" style="background:var(--offline)"></span><span tlang="status.invisible">Invisible</span></button>
<hr style="width:90%">
<button onclick="window.useredit()" tlang="user.edit">Edit</button>
<button onclick="localStorage.removeItem('pls');location.reload()" tlang="user.changeserver">Change server</button>
<button onclick="logout()" tlang="user.logout" style="color:var(--invalid)">Log out</button>`,
    interactive: true,
    trigger: 'click',
    placement: 'bottom-start',
    sticky: true
  });
  tippy(document.getElementById('channel-add'), {
    allowHTML: true,
    content: (window.serverData[getCurrentServerUrl()]?.disable_channel_creation?'':`<button onclick="window.createChannel(1)">${TypeIcons[1]}<span tlang="channel.newdm">Message User</span></button>
<button onclick="window.createChannel(2)">${TypeIcons[2]}<span tlang="channel.newgroup">Create Group</span></button>
<button onclick="window.createChannel(3)">${TypeIcons[3]}<span tlang="channel.newbroadcast">Create Broadcast</span></button>`)+
`<button onclick="window.joinChannel()">${TypeIcons[0]}<span tlang="channel.joingroup">Join Group</span></button>`,
    interactive: true,
    trigger: 'click',
    placement: 'bottom-end',
    sticky: true
  });
  tippy(document.getElementById('btn-settings'), {
    allowHTML: true,
    content: `<b tlang="settings.layout">Layout</b>
<span>
  <label for="s-theme" tlang="settings.theme">Theme:</label>
  <input type="color" id="s-theme" oninput="window.applyAccent(this.value);localStorage.setItem('ptheme',this.value)" value="${localStorage.getItem('ptheme')??'#9d7bff'}">
</span>
<span>
  <label for="s-font" tlang="settings.font">Font:</label>
  <select id="s-font">
    <option value="lexend">Lexend</option>
    <option value="arial">Arial</option>
    <option value="dyslexic">Open Dyslexic</option>
    <option value="system">System</option>
  </select>
</span>
<b tlang="settings.messages">Messages</b>
<span>
  <label for="s-sbp" tlang="settings.sbp">Self Position:</label>
  <select id="s-sbp">
    <option value="" tlang="settings.auto">Auto</option>
    <option value="ltr" tlang="settings.left">Left</option>
    <option value="rtl" tlang="settings.right">Right</option>
  </select>
</span>
<span>
  <label for="s-obp" tlang="settings.obp">Other Position:</label>
  <select id="s-obp">
    <option value="" tlang="settings.auto">Auto</option>
    <option value="ltr" tlang="settings.left">Left</option>
    <option value="rtl" tlang="settings.right">Right</option>
  </select>
</span>
<b tlang="settings.behavior">Behavior</b>
<span>
  <label for="s-notif" tlang="settings.notif">Notifications:</label>
  <input id="s-notif" type="checkbox" ${localStorage.getItem('pnotif')==='true'?' checked':''}>
</span>`+(window.serverData[getCurrentServerUrl()]?.push?.enabled?`<span>
  <label for="s-webpush" tlang="settings.webpush">Background notifications:</label>
  <input id="s-webpush" type="checkbox"${localStorage.getItem('pwebpush')==='true'?' checked':''}>
</span>`:'')+`
<b tlang="settings.app" id="s-android-h" style="display:none">App</b>
<div id="s-android" style="display:none">
  <span><label tlang="settings.app.notifperm">System notifications:</label><button id="s-android-notif" class="s-android-btn"></button></span>
  <span><label tlang="settings.app.battery">Background running:</label><button id="s-android-battery" class="s-android-btn"></button></span>
  <span><label tlang="settings.app.autostart">More settings:</label><button id="s-android-appinfo" class="s-android-btn" tlang="settings.app.open">Open settings</button></span>
  <span><label tlang="settings.app.cache">Clear cache:</label><button id="s-android-cache" class="s-android-btn"></button></span>
  <small class="s-android-note" tlang="settings.app.note">For reliable notifications: allow notifications and set battery to unrestricted.</small>
</div>
<span>
  <label for="s-ma" tlang="settings.medialways">Load media on mobile data:</label>
  <input id="s-ma" type="checkbox" onchange="localStorage.setItem('pmedialways',this.checked)"${localStorage.getItem('pmedialways')==='true'?' checked':''}>
</span>
<span>
  <label for="s-rc" tlang="settings.rc">Remember channel:</label>
  <input id="s-rc" type="checkbox" onchange="localStorage.setItem('prc',this.checked)"${localStorage.getItem('prc')==='true'?' checked':''}>
</span>
<span>
  <label for="s-rs" tlang="settings.rs">Remember server:</label>
  <input id="s-rs" type="checkbox" onchange="localStorage.setItem('prs',this.checked)"${localStorage.getItem('prs')==='true'?' checked':''}>
</span>
<span>
  <label for="s-callhist" tlang="settings.callhist">Show call history:</label>
  <input id="s-callhist" type="checkbox" onchange="localStorage.setItem('pcallhist',this.checked);if(!this.checked)window.callHistory={};showMessages(window.messages[window.currentChannel]||[])"${localStorage.getItem('pcallhist')==='false'?'':' checked'}>
</span>
<b tlang="settings.sounds">Sounds</b>
<span>
  <label for="s-sfx-message" tlang="settings.sfx.message">Message sounds:</label>
  <input id="s-sfx-message" type="range" min="0" max="100">
</span>
<span>
  <label for="s-sfx-notification" tlang="settings.sfx.notification">Notification sounds:</label>
  <input id="s-sfx-notification" type="range" min="0" max="100">
</span>
<span>
  <label for="s-sfx-call" tlang="settings.sfx.call">Call sounds:</label>
  <input id="s-sfx-call" type="range" min="0" max="100">
</span>
<span>
  <label for="s-call-mic" tlang="settings.call.mic">Microphone volume:</label>
  <input id="s-call-mic" type="range" min="0" max="100">
</span>
<span>
  <label for="s-call-master" tlang="settings.call.master">Call volume:</label>
  <input id="s-call-master" type="range" min="0" max="100">
</span>
<b tlang="settings.privacy" id="s-privacy-h" style="display:none">Privacy</b>
<span id="s-sls-row" style="display:none">
  <label for="s-sls" tlang="settings.sharelastseen">Share last seen:</label>
  <input id="s-sls" type="checkbox" onchange="window.setPrivacyShare('share_last_seen',this.checked)">
</span>
<span id="s-stp-row" style="display:none">
  <label for="s-stp" tlang="settings.sharetyping">Share typing:</label>
  <input id="s-stp" type="checkbox" onchange="window.setPrivacyShare('share_typing',this.checked)">
</span>`,
    interactive: true,
    trigger: 'click',
    placement: 'top-start',
    sticky: true,
    onMount: ()=>{
      // Privacy toggles, shown per instance config (resolved on open, when serverData is ready) and initialized from /me
      let lastSeenOn = window.serverData[getCurrentServerUrl()]?.presence?.last_seen;
      let typingOn = window.serverData[getCurrentServerUrl()]?.typing?.enabled;
      if (lastSeenOn) document.getElementById('s-sls-row').style.display = '';
      if (typingOn) document.getElementById('s-stp-row').style.display = '';
      if (lastSeenOn||typingOn) {
        document.getElementById('s-privacy-h').style.display = '';
        backendfetch('/api/v1/me').then(me=>{
          let sls = document.getElementById('s-sls');
          let stp = document.getElementById('s-stp');
          if (sls&&me) sls.checked = me.share_last_seen!==0;
          if (stp&&me) stp.checked = me.share_typing!==0;
        });
      }
      // Font
      document.getElementById('s-font').value = localStorage.getItem('pfont')??'lexend';
      document.getElementById('s-font').onchange = (evt)=>{
        document.querySelector('body').style.setProperty('--font', vts[evt.target.value]??vts.lexend);
        localStorage.setItem('pfont', evt.target.value);
      };
      // Notifs
      document.getElementById('s-notif').onchange = (evt)=>{
        localStorage.setItem('pnotif', evt.target.checked);
        syncHoltNotifs();
        if (Notification.permission !== 'granted') {
          Notification.requestPermission().then((permission) => {
            if (permission !== 'granted') {
              document.getElementById('s-notif').checked = false;
              localStorage.setItem('pnotif','false');
            }
          });
        }
      };
      // Background notifications (Web Push)
      let wp = document.getElementById('s-webpush');
      if (wp) wp.onchange = async(evt)=>{
        if (evt.target.checked) {
          evt.target.disabled = true;
          let ok = await push.enableWebPush();
          evt.target.disabled = false;
          if (!ok) evt.target.checked = false;
        } else {
          push.disableWebPush();
        }
      };
      // Self bubble pos
      document.getElementById('s-sbp').value = localStorage.getItem('psbp')??'';
      document.getElementById('s-sbp').onchange = (evt)=>{
        document.querySelector('body').style.setProperty('--sbp', evt.target.value);
        localStorage.setItem('psbp', evt.target.value);
      };
      // Other bubble pos
      document.getElementById('s-obp').value = localStorage.getItem('pobp')??'';
      document.getElementById('s-obp').onchange = (evt)=>{
        document.querySelector('body').style.setProperty('--obp', evt.target.value);
        localStorage.setItem('pobp', evt.target.value);
      };
      // Sound volumes
      document.getElementById('s-sfx-message').value = localStorage.getItem('psfx-message')??60;
      document.getElementById('s-sfx-message').oninput = (evt)=>localStorage.setItem('psfx-message', evt.target.value);
      document.getElementById('s-sfx-notification').value = localStorage.getItem('psfx-notification')??60;
      document.getElementById('s-sfx-notification').oninput = (evt)=>localStorage.setItem('psfx-notification', evt.target.value);
      document.getElementById('s-sfx-call').value = localStorage.getItem('psfx-call')??60;
      document.getElementById('s-sfx-call').oninput = (evt)=>localStorage.setItem('psfx-call', evt.target.value);
      document.getElementById('s-call-mic').value = localStorage.getItem('pcall-mic')??100;
      document.getElementById('s-call-mic').oninput = (evt)=>{ localStorage.setItem('pcall-mic', evt.target.value); window.setCallMicVolume?.(evt.target.value); };
      document.getElementById('s-call-master').value = localStorage.getItem('pcall-master')??100;
      document.getElementById('s-call-master').oninput = (evt)=>{ localStorage.setItem('pcall-master', evt.target.value); window.setCallMasterVolume?.(evt.target.value); };
      // Android app: OS permission walkthrough
      if (window.HoltNative&&window.HoltNative.platform) {
        document.getElementById('s-android-h').style.display = '';
        document.getElementById('s-android').style.display = '';
        let refreshAndroid = ()=>{
          let nb = document.getElementById('s-android-notif'), bb = document.getElementById('s-android-battery');
          if (!nb||!bb) return;
          let ng = window.HoltNative.notifGranted();
          nb.setAttribute('tlang', ng?'settings.app.enabled':'settings.app.enable');
          nb.classList.toggle('s-android-on', ng);
          let bu = window.HoltNative.batteryUnrestricted();
          bb.setAttribute('tlang', bu?'settings.app.enabled':'settings.app.allow');
          bb.classList.toggle('s-android-on', bu);
          let cb = document.getElementById('s-android-cache');
          if (cb&&window.HoltNative.cacheBytes) cb.textContent = formatBytes(window.HoltNative.cacheBytes());
          window.translate();
        };
        document.getElementById('s-android-notif').onclick = ()=>window.HoltNative.requestNotifications();
        document.getElementById('s-android-battery').onclick = ()=>window.HoltNative.requestBattery();
        document.getElementById('s-android-appinfo').onclick = ()=>window.HoltNative.openAppInfo();
        document.getElementById('s-android-cache').onclick = ()=>{ window.HoltNative.clearCache?.(); setTimeout(refreshAndroid, 500); };
        // Web Push does not work in the WebView; the native service handles background notifications, gated by the main toggle below
        let wp = document.getElementById('s-webpush');
        if (wp&&wp.closest('span')) wp.closest('span').style.display = 'none';
        document.getElementById('s-notif').onchange = (evt)=>{
          localStorage.setItem('pnotif', evt.target.checked);
          syncHoltNotifs();
          if (evt.target.checked&&!window.HoltNative.notifGranted()) window.HoltNative.requestNotifications();
        };
        refreshAndroid();
        document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') refreshAndroid(); });
      }
    }
  });

  // Stuff that needs to run before other stuff
  fetch('./media/default-pfp.svg')
    .then(img=>img.text())
    .then(async(img)=>{
      window.defaultpfp = img;
      if (!window.serverData[getCurrentServerUrl()]) {
        let dat;
        try {
          dat = await fetch(getCurrentServerUrl()+'/api/v1');
          dat = await dat.json();
        } catch(err) {
          localStorage.removeItem('pls');
          location.reload();
          return;
        }
        window.serverData[getCurrentServerUrl()] = dat;
      }
      messageInput.setAttribute('maxlength', window.serverData[getCurrentServerUrl()]?.messages?.max_message_length??2000);
      loadMain();
      setTimeout(()=>window.maybeStartTour&&window.maybeStartTour(), 900);
    });
}
window.postLogin = postLogin;

/*
document.body.insertAdjacentHTML('beforeend',`<style>
side {
  position: relative;
  padding: 8px;
  border-radius: var(--roundness-2);
  background-color: var(--bg-2);
  box-sizing: border-box;
}
side button, side input {
  border: 2px var(--bg-1) solid;
  background-color: var(--bg-1);
}
footer button {
  border: 2px var(--bg-2) solid;
  background-color: var(--bg-2);
}
#channels button.other {
  border-width: 0;
  transition-property: width, border-width, opacity, background-color;
}
</style>`);
*/