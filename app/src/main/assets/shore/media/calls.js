let display;
let currentCallCh = '';
let mediaStream;
let peers = new Map();
let queue = [];
let ready = false;
let showConnSeq = 0;

let answered = false;
let hasvideo = false;
let sharing = false;
let camTrack = null;
let screenStream = null;
let localVideo = null;
let statsTimer = null;
let speakTimer = null;
let micAnalyser = null;
let remoteAudioCtx = null;
let resumeAudio = null;
let statusStrings = {};
let focusedUser = null;
let idToUser = new Map();
let untrustedUsers = new Set();
let warnedUnverified = new Set();
let aloneTimer = null;
let ringTimer = null;
let micContext = null;
let micGain = null;
let rawAudioTrack = null;
let callMaster = (Number(localStorage.getItem('pcall-master'))||100)/100;
let deafened = false;
let pendingSettings = new Map();
let answeredChannels = new Set();
let ringingCh = '';

const dbg = (...a)=>{ if (window.debugCall) console.log('[call]', ...a); };

const micIcons = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="83" y="0.00195312" width="90" height="150" rx="45"/><path d="M53 95.002V105.002C53 146.423 86.5786 180.002 128 180.002C169.421 180.002 203 146.423 203 105.002V95.002" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M128 180.002V240.002" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M153 241.002H103" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M58 235.002L198 20.002" stroke-width="40" stroke-linecap="round" fill="none"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="83" width="90" height="150" rx="45"/><path d="M53 95V105C53 146.421 86.5786 180 128 180C169.421 180 203 146.421 203 105V95" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M128 180V240" stroke-width="30" stroke-linecap="round" fill="none"/><path d="M153 241H103" stroke-width="30" stroke-linecap="round" fill="none"/></svg>'
];
const camIcons = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M170 43.002C181.046 43.002 190 51.9563 190 63.002V81.4864C190 82.782 191.213 83.7357 192.472 83.4299L246.112 70.4033C251.148 69.1805 256 72.9955 256 78.1777V177.656C256 182.892 251.054 186.716 245.987 185.398L192.503 171.492C191.237 171.162 190 172.118 190 173.427V193.002C190 204.048 181.046 213.002 170 213.002H20C8.95431 213.002 4.02687e-08 204.048 0 193.002V63.002C0 51.9563 8.95431 43.002 20 43.002H170Z"/><path d="M58 235.002L198 20.002" stroke-width="40" stroke-linecap="round" fill="none"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M170 43C181.046 43 190 51.9543 190 63V81.4845C190 82.7801 191.213 83.7337 192.472 83.428L246.112 70.4014C251.148 69.1785 256 72.9935 256 78.1758V177.654C256 182.89 251.054 186.714 245.987 185.396L192.503 171.49C191.237 171.16 190 172.116 190 173.425V193C190 204.046 181.046 213 170 213H20C8.95431 213 4.02687e-08 204.046 0 193V63C0 51.9543 8.95431 43 20 43H170Z"/></svg>'
];
const screenIcons = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="13" y="33" width="230" height="160" rx="20" stroke-width="26" fill="none"/><path d="M128 78V148" stroke-width="26" stroke-linecap="round" fill="none"/><path d="M98 108L128 78L158 108" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M88 223H168" stroke-width="26" stroke-linecap="round" fill="none"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="13" y="33" width="230" height="160" rx="20" stroke-width="26" fill="none"/><rect x="98" y="78" width="60" height="60" rx="8"/><path d="M88 223H168" stroke-width="26" stroke-linecap="round" fill="none"/></svg>'
];
const fullIcons = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M20 88V36C20 27.1634 27.1634 20 36 20H88" stroke-width="28" stroke-linecap="round" fill="none"/><path d="M236 88V36C236 27.1634 228.837 20 220 20H168" stroke-width="28" stroke-linecap="round" fill="none"/><path d="M20 168V220C20 228.837 27.1634 236 36 236H88" stroke-width="28" stroke-linecap="round" fill="none"/><path d="M236 168V220C236 228.837 228.837 236 220 236H168" stroke-width="28" stroke-linecap="round" fill="none"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M84 24V60C84 73.2548 73.2548 84 60 84H24" stroke-width="28" stroke-linecap="round" fill="none"/><path d="M172 24V60C172 73.2548 182.745 84 196 84H232" stroke-width="28" stroke-linecap="round" fill="none"/><path d="M84 232V196C84 182.745 73.2548 172 60 172H24" stroke-width="28" stroke-linecap="round" fill="none"/><path d="M172 232V196C172 182.745 182.745 172 196 172H232" stroke-width="28" stroke-linecap="round" fill="none"/></svg>'
];
const volIcons = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256"><path d="M28 90H72L132 38V218L72 166H28C22.4772 166 18 161.523 18 156V100C18 94.4772 22.4772 90 28 90Z"/><path d="M188 80L238 176" stroke-width="26" stroke-linecap="round" fill="none"/><path d="M238 80L188 176" stroke-width="26" stroke-linecap="round" fill="none"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256"><path d="M28 90H72L132 38V218L72 166H28C22.4772 166 18 161.523 18 156V100C18 94.4772 22.4772 90 28 90Z"/><path d="M178 88C190.5 100.5 198 113 198 128C198 143 190.5 155.5 178 168" stroke-width="26" stroke-linecap="round" fill="none"/><path d="M210 60C232 82 242 104 242 128C242 152 232 174 210 196" stroke-width="26" stroke-linecap="round" fill="none"/></svg>'
];
const deafIcons = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M128 24C68.4 24 20 72.4 20 132v60c0 11 9 20 20 20h24c11 0 20-9 20-20v-44c0-11-9-20-20-20H44v-16c0-46.4 37.6-84 84-84s84 37.6 84 84v16h-20c-11 0-20 9-20 20v44c0 11 9 20 20 20h24c11 0 20-9 20-20v-60c0-59.6-48.4-108-108-108z"/><path d="M58 230L198 26" stroke-width="36" stroke-linecap="round" fill="none"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M128 24C68.4 24 20 72.4 20 132v60c0 11 9 20 20 20h24c11 0 20-9 20-20v-44c0-11-9-20-20-20H44v-16c0-46.4 37.6-84 84-84s84 37.6 84 84v16h-20c-11 0-20 9-20 20v44c0 11 9 20 20 20h24c11 0 20-9 20-20v-60c0-59.6-48.4-108-108-108z"/></svg>'
];

function showConnections() {
  if (!display||currentCallCh==='') return;
  let seq = ++showConnSeq;
  backendfetch(`/api/v1/channel/${currentCallCh}/call`)
    .then(res=>{
      if (seq!==showConnSeq||!res.active) return;
      res.participants.forEach(m=>{ if (m.id&&m.username) idToUser.set(m.id, m.username); });
      let grid = display.querySelector('.grid');
      grid.innerHTML = res.participants
        .map(m=>`<div class="call-tile" data-user="${sanitizeMinimChars(m.username)}"><img src="${m.pfp?pfpById(m.pfp):userToDefaultPfp(m)}" draggable="false"></div>`)
        .join('');
      peers.forEach(peer=>{
        if (!peer.username) return;
        let user = sanitizeMinimChars(peer.username);
        let tile = grid.querySelector(`.call-tile[data-user="${user}"]`);
        if (!tile) return;
        if (peer.videoOn) {
          let vid = peer.elems.find(e=>e.tagName.toLowerCase()==='video');
          if (vid) { vid.style.display = ''; tile.innerHTML = ''; tile.appendChild(vid); }
        }
        tile.insertAdjacentHTML('beforeend', `<div class="vol" onclick="event.stopPropagation()"><button class="vol-mute" onclick="window.togglePeerMute('${user}')" tlang="channel.call.volume.${peer.muted?'on':'off'}">${volIcons[peer.muted?0:1]}</button><input class="vol-slider" type="range" min="0" max="100" value="${Math.round((peer.muted?0:peer.volume)*100)}" oninput="window.setPeerVolume('${user}',this.value)" aria-label="${user}"></div>`);
        if (peer.remoteMuted) tile.insertAdjacentHTML('beforeend', `<div class="muted-badge">${micIcons[0]}</div>`);
        if (peer.remoteDeafened) tile.insertAdjacentHTML('beforeend', `<div class="deaf-badge">${deafIcons[0]}</div>`);
        tile.insertAdjacentHTML('beforeend', `<div class="call-status" data-state="${peer.connState}" onclick="event.stopPropagation()"><span class="call-status-dot"></span><span class="call-status-text"></span><span class="call-status-ping" style="display:none"></span></div>`);
        renderPeerTileStatus(peer);
      });
      // Local self-tile: when sharing a screen or camera, show it in our own tile too (participants has no peer for us).
      let selfTile = grid.querySelector(`.call-tile[data-user="${sanitizeMinimChars(window.username)}"]`);
      if (selfTile) {
        if (localVideo&&localVideo.srcObject) { localVideo.style.display = ''; selfTile.innerHTML = ''; selfTile.appendChild(localVideo); }
        let selfAudio = mediaStream?.getAudioTracks()[0];
        if (selfAudio&&!selfAudio.enabled) selfTile.insertAdjacentHTML('beforeend', `<div class="muted-badge">${micIcons[0]}</div>`);
        if (deafened) selfTile.insertAdjacentHTML('beforeend', `<div class="deaf-badge">${deafIcons[0]}</div>`);
      }
      applyFocus(grid);
    });
}

function applyFocus(grid) {
  if (!grid) return;
  if (focusedUser&&!grid.querySelector(`.call-tile[data-user="${focusedUser}"]`)) focusedUser = null;
  grid.classList.toggle('has-focus', !!focusedUser);
  let strip = grid.querySelector('.call-strip');
  if (!focusedUser) {
    if (strip) { while (strip.firstChild) grid.appendChild(strip.firstChild); strip.remove(); }
    grid.querySelector('.strip-toggle')?.remove();
    grid.classList.remove('strip-collapsed');
    grid.querySelectorAll('.call-tile').forEach(t=>t.classList.remove('focused'));
    return;
  }
  if (!strip) { strip = document.createElement('div'); strip.className = 'call-strip'; grid.appendChild(strip); }
  if (!grid.querySelector('.strip-toggle')) {
    let btn = document.createElement('button');
    btn.className = 'strip-toggle';
    btn.title = 'Hide/show thumbnails';
    btn.onclick = ()=>grid.classList.toggle('strip-collapsed');
    grid.appendChild(btn);
  }
  grid.querySelectorAll('.call-tile').forEach(t=>{
    let isFocused = t.dataset.user===focusedUser;
    t.classList.toggle('focused', isFocused);
    if (isFocused&&t.parentElement!==grid) grid.insertBefore(t, strip);
    else if (!isFocused&&t.parentElement!==strip) strip.appendChild(t);
  });
}

function onTileClick(evt) {
  if (evt.target.closest('.vol')||evt.target.closest('.call-status')) return;
  let tile = evt.target.closest('.call-tile');
  if (!tile||!tile.dataset.user) return;
  focusedUser = focusedUser===tile.dataset.user?null:tile.dataset.user;
  applyFocus(display&&display.querySelector('.grid'));
}

function callConfig() {
  let callData = window.serverData[getCurrentServerUrl()].calls;
  let servers = [];
  if (callData.stun_servers.length) servers.push({ urls: callData.stun_servers });
  if (callData.turn_servers.length) servers.push({
    urls: callData.turn_servers,
    username: callData.turn_username,
    credential: callData.turn_password
  });
  return {
    iceCandidatePoolSize: 8,
    iceServers: servers,
    iceTransportPolicy: (window.debugCall&&window.forceTurn)?'relay':'all'
  };
}

function makePeer(remoteId, username) {
  let pc = new RTCPeerConnection(callConfig());
  // polite peer is the higher id; the lower id is the deterministic offerer and stays impolite to resolve glare
  let peer = { pc, remoteId, username, elems: [], candidates: [], remoteSet: false, videoOn: false, remoteMuted: false, remoteDeafened: false, volume: 1, muted: false, polite: window.myId>remoteId, makingOffer: false, ignoreOffer: false, negotiated: false, connState: 'connecting', rtt: null };
  peers.set(remoteId, peer);
  let ps = pendingSettings.get(remoteId);
  if (ps) { peer.videoOn = !!ps.video; peer.remoteMuted = !!ps.muted; peer.remoteDeafened = !!ps.deafened; pendingSettings.delete(remoteId); }
  // Always create both an audio and a video transceiver in a fixed order so every peer's m-line layout matches,
  // even if this user has no mic/camera. This also guarantees a sender to swap into for camera/screen later.
  let audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  peer.audioTransceiver = audioTx;
  peer.audioSender = audioTx.sender;
  let atrack = mediaStream?.getAudioTracks()[0];
  if (atrack) peer.audioSender.replaceTrack(atrack).catch(err=>dbg('init audio replaceTrack failed', err));
  let videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
  peer.videoTransceiver = videoTx;
  peer.videoSender = videoTx.sender;
  let vtrack = mediaStream?.getVideoTracks()[0];
  if (vtrack) peer.videoSender.replaceTrack(vtrack).catch(err=>dbg('init video replaceTrack failed', err));
  pc.onnegotiationneeded = async()=>{
    // Only drives the very first handshake (deterministic offerer = lower id, higher id just answers). All later media
    // changes (camera/screen) are renegotiated explicitly via renegotiate(), so skip once the initial handshake is done.
    if (peer.negotiated||window.myId>remoteId) { dbg('negotiationneeded skipped', remoteId, 'negotiated=', peer.negotiated); return; }
    try {
      peer.makingOffer = true;
      let offer = await pc.createOffer();
      if (pc.signalingState!=='stable') return;
      await pc.setLocalDescription(offer);
      peer.negotiated = true;
      sendSignal('offer', pc.localDescription, remoteId);
    } catch(err) {
      dbg('negotiationneeded failed', err);
    } finally {
      peer.makingOffer = false;
    }
  };
  pc.onicecandidate = (evt)=>{
    if (!evt.candidate) return;
    sendSignal('ice', evt.candidate, remoteId);
  };
  pc.ontrack = (evt)=>{
    // The pre-added video transceiver fires ontrack even with no stream/track attached yet, so build a stream from the receiver track.
    let stream = (evt.streams&&evt.streams[0])||new MediaStream([evt.track]);
    // When media actually starts flowing on a video receiver after a renegotiation, make sure the tile re-renders.
    if (evt.track.kind==='video') evt.track.onunmute = ()=>showConnections();
    // Tap the raw MediaStream for the speaking analyser instead of createMediaElementSource(elem): routing a live
    // remote WebRTC stream through a media-element source node can silently starve the analyser of samples in Chrome,
    // even though the element itself plays audio fine. Not connected to destination since the <audio> element already outputs sound.
    let attachSpeakAnalyser = ()=>{
      if (!remoteAudioCtx) return;
      try {
        let src = remoteAudioCtx.createMediaStreamSource(stream);
        let analyser = remoteAudioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        peer.speakAnalyser = analyser;
      } catch(e) { dbg('speak analyser failed', e); }
    };
    let existing = peer.elems.find(e=>e.tagName.toLowerCase()===evt.track.kind);
    if (existing) {
      existing.srcObject = stream;
      if (evt.track.kind==='audio') { remoteAudioCtx?.resume().catch(()=>{}); if (existing.paused) existing.play().catch(e=>dbg('audio retrack play failed', e)); attachSpeakAnalyser(); }
      if (evt.track.kind==='video') showConnections();
      return;
    }
    let elem = document.createElement(evt.track.kind);
    elem.style.display = 'none';
    elem.autoplay = true;
    elem.playsInline = true;
    elem.srcObject = stream;
    elem.dataset.peer = remoteId;
    if (evt.track.kind==='audio') {
      elem.volume = peer.muted?0:peer.volume*callMaster;
      remoteAudioCtx?.resume().catch(()=>{});
      attachSpeakAnalyser();
    }
    peer.elems.push(elem);
    document.body.appendChild(elem);
    if (evt.track.kind==='audio') {
      elem.play().catch(e=>dbg('audio autoplay failed', e));
      evt.track.onunmute = ()=>{ remoteAudioCtx?.resume().catch(()=>{}); elem.play().catch(e=>dbg('audio on unmute failed', e)); };
    }
    if (window.debugCall) console.log(evt.track, stream, peer);
  };
  pc.onconnectionstatechange = ()=>{
    if (window.debugCall) console.log(remoteId, pc.connectionState);
    updatePeerState(peer);
    switch (pc.connectionState) {
      case 'connected':
        micContext?.resume().catch(()=>{});
        remoteAudioCtx?.resume().catch(()=>{});
        // Re-attach audio in case replaceTrack lost the race with onnegotiationneeded at setup time.
        let at = mediaStream?.getAudioTracks()[0];
        if (at&&peer.audioSender) peer.audioSender.replaceTrack(at).catch(e=>dbg('audio reattach failed', e));
        // Ensure remote audio elements are actually playing (autoplay may have silently failed earlier).
        peer.elems.forEach(e=>{ if (e.tagName.toLowerCase()==='audio'&&e.paused) e.play().catch(err=>dbg('audio conn play failed', err)); });
        // Offerer re-syncs transceivers after a short delay so the initial handshake has fully settled first.
        if (window.myId<remoteId&&!peer.synced) { peer.synced = true; setTimeout(()=>{ if (peers.get(remoteId)===peer) renegotiate(peer); }, 1500); }
        break;
      case 'failed':
        if (window.myId<remoteId) renegotiate(peer, true);
        break;
      case 'closed':
        removePeer(remoteId);
        break;
    }
  };
  pc.oniceconnectionstatechange = ()=>updatePeerState(peer);
  return peer;
}

async function addPeer(remoteId, username) {
  if (!remoteId||remoteId===window.myId) return;
  let existing = peers.get(remoteId);
  if (existing) { if (username&&!existing.username) { existing.username = username; showConnections(); } return; }
  // Create the connection now: the lower id's addTransceiver fires onnegotiationneeded and it sends the initial offer,
  // the higher id creates it ready to answer. Without this no offer is ever made and the two peers never connect.
  dbg('addPeer', remoteId, username, window.myId<remoteId?'-> offering (we are lower id)':'-> waiting for their offer');
  stopAloneTimer();
  makePeer(remoteId, username);
  showConnections();
}

function removePeer(remoteId) {
  let peer = peers.get(remoteId);
  if (!peer) return;
  dbg('removePeer', remoteId);
  peer.pc.close();
  peer.elems.forEach(e=>e.remove());
  peers.delete(remoteId);
}

const statusKeys = { connecting: 'channel.call.status.connecting', connected: 'channel.call.status.connected', reconnecting: 'channel.call.status.reconnecting', failed: 'channel.call.status.failed', unverified: 'channel.call.status.unverified' };
function peerStatusFor(pc) {
  // Collapse RTCPeerConnection.connectionState (with iceConnectionState as a finer hint) into our four UI states.
  let c = pc.connectionState, ice = pc.iceConnectionState;
  if (c==='connected'||ice==='connected'||ice==='completed') return 'connected';
  if (c==='failed'||ice==='failed') return 'failed';
  if (c==='disconnected'||ice==='disconnected') return 'reconnecting';
  return 'connecting';
}
function updatePeerState(peer) {
  let next = peerStatusFor(peer.pc);
  if (next===peer.connState) return;
  peer.connState = next;
  renderPeerTileStatus(peer);
}
function renderPeerTileStatus(peer) {
  if (!display||!peer.username) return;
  let tile = display.querySelector(`.call-tile[data-user="${sanitizeMinimChars(peer.username)}"]`);
  if (!tile) return;
  let el = tile.querySelector('.call-status');
  if (!el) return;
  let state = peer.unverified?'unverified':peer.connState;
  el.dataset.state = state;
  el.querySelector('.call-status-text').innerText = statusStrings[statusKeys[state]]||state;
  let ping = el.querySelector('.call-status-ping');
  if (!peer.unverified&&peer.connState==='connected'&&peer.rtt>0) { ping.innerText = (statusStrings['channel.call.ping']||'{} ms').replace('{}', peer.rtt); ping.style.display = ''; }
  else ping.style.display = 'none';
}
async function pollStats() {
  for (let peer of peers.values()) {
    if (peer.connState!=='connected') { if (peer.rtt!=null) { peer.rtt = null; renderPeerTileStatus(peer); } continue; }
    try {
      let stats = await peer.pc.getStats();
      let rttSec = null;
      stats.forEach(r=>{ if (r.type==='candidate-pair'&&(r.nominated||r.state==='succeeded')&&r.currentRoundTripTime!=null) rttSec = r.currentRoundTripTime; });
      let next = rttSec!=null?Math.round(rttSec*1000):null;
      if (next!==peer.rtt) { peer.rtt = next; renderPeerTileStatus(peer); }
    } catch(err) { dbg('getStats failed', peer.remoteId, err); }
  }
}
function startStatsLoop() {
  stopStatsLoop();
  statsTimer = setInterval(pollStats, 2000);
}
function stopStatsLoop() {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
}
const SPEAK_THRESHOLD = 0.02;
function startSpeakLoop() {
  stopSpeakLoop();
  let micBuf = null;
  speakTimer = setInterval(()=>{
    if (!display||currentCallCh==='') return;
    let grid = display.querySelector('.grid');
    if (!grid) return;
    let audioEnabled = !!mediaStream?.getAudioTracks()[0]?.enabled;
    let selfSpeaking = false;
    if (micAnalyser&&audioEnabled) {
      if (!micBuf) micBuf = new Uint8Array(micAnalyser.frequencyBinCount);
      micAnalyser.getByteTimeDomainData(micBuf);
      let sum = 0;
      for (let i=0;i<micBuf.length;i++) { let v=(micBuf[i]-128)/128; sum+=v*v; }
      selfSpeaking = Math.sqrt(sum/micBuf.length)>SPEAK_THRESHOLD;
    }
    let selfTile = grid.querySelector(`.call-tile[data-user="${sanitizeMinimChars(window.username)}"]`);
    if (selfTile) selfTile.classList.toggle('speaking', selfSpeaking);
    peers.forEach(peer=>{
      if (!peer.username||!peer.speakAnalyser) return;
      let tile = grid.querySelector(`.call-tile[data-user="${sanitizeMinimChars(peer.username)}"]`);
      if (!tile) return;
      if (!peer.speakBuf) peer.speakBuf = new Uint8Array(peer.speakAnalyser.frequencyBinCount);
      peer.speakAnalyser.getByteTimeDomainData(peer.speakBuf);
      let sum = 0;
      for (let i=0;i<peer.speakBuf.length;i++) { let v=(peer.speakBuf[i]-128)/128; sum+=v*v; }
      tile.classList.toggle('speaking', Math.sqrt(sum/peer.speakBuf.length)>SPEAK_THRESHOLD);
    });
  }, 100);
}
function stopSpeakLoop() {
  if (speakTimer) clearInterval(speakTimer);
  speakTimer = null;
}
function startAloneTimer() {
  // Someone else leaving never makes us drop instantly; we stay 3 minutes in case they (or anyone) (re)joins.
  if (aloneTimer) return;
  dbg('alone in call, starting 3min leave timer');
  aloneTimer = setTimeout(()=>{ aloneTimer = null; if (currentCallCh!==''&&peers.size===0) leaveCall(); }, 3*60*1000);
}
function stopAloneTimer() {
  if (aloneTimer) clearTimeout(aloneTimer);
  aloneTimer = null;
}
function startRingTimer() {
  if (ringTimer||answered) return;
  ringTimer = setTimeout(()=>{ ringTimer = null; if (currentCallCh!==''&&!answered) leaveCall(); }, 60*1000);
}
function stopRingTimer() {
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
}

async function renegotiate(peer, iceRestart=false) {
  // Either side may (re)negotiate its own outgoing media (camera/screen). We don't rely on onnegotiationneeded firing
  // (setting direction to its existing value won't fire it), so we offer explicitly. Perfect-negotiation glare handling
  // in handleSignal covers the rare case where both peers renegotiate at once.
  if (!peer.negotiated) { dbg('renegotiate skipped, initial handshake not done', peer.remoteId); return; }
  if (peer.pc.signalingState!=='stable') {
    dbg('renegotiate deferred, not stable', peer.remoteId);
    if (!peer.pendingRenegotiate) {
      peer.pendingRenegotiate = { iceRestart };
      const retry = ()=>{
        if (peer.pc.signalingState==='stable') {
          peer.pc.removeEventListener('signalingstatechange', retry);
          let opts = peer.pendingRenegotiate;
          peer.pendingRenegotiate = null;
          if (opts) renegotiate(peer, opts.iceRestart);
        }
      };
      peer.pc.addEventListener('signalingstatechange', retry);
    } else if (iceRestart) {
      peer.pendingRenegotiate.iceRestart = true;
    }
    return;
  }
  try {
    peer.makingOffer = true;
    let offer = await peer.pc.createOffer(iceRestart?{ iceRestart: true }:{});
    if (peer.pc.signalingState!=='stable') { dbg('renegotiate aborted, not stable', peer.remoteId); return; }
    await peer.pc.setLocalDescription(offer);
    sendSignal('offer', peer.pc.localDescription, peer.remoteId);
  } catch(err) {
    dbg('renegotiate failed', peer.remoteId, err);
  } finally {
    peer.makingOffer = false;
  }
}
function replaceVideoTrack(track) {
  // Swap the outgoing video track on every peer. replaceTrack alone does NOT renegotiate, and if the video m-line was
  // negotiated with no track (camera off at join) the remote answered recvonly/inactive, so a swapped-in track never
  // flows. So we set the transceiver direction (sendrecv when we have a track, recvonly when we don't) AND, whenever the
  // send intent changed vs what is currently negotiated, force a fresh offer/answer so the m-line really carries video.
  peers.forEach(peer=>{
    let tx = peer.videoTransceiver||peer.pc.getTransceivers().find(t=>t.sender&&t.sender.track&&t.sender.track.kind==='video');
    let sender = (tx&&tx.sender)||peer.videoSender||peer.pc.getSenders().find(s=>s.track&&s.track.kind==='video');
    if (sender) sender.replaceTrack(track).catch(err=>dbg('replaceTrack failed', err));
    if (!tx) { dbg('replaceVideoTrack: no video transceiver for', peer.remoteId); return; }
    let want = track?'sendrecv':'recvonly';
    let sendingNow = tx.currentDirection==='sendrecv'||tx.currentDirection==='sendonly';
    if (tx.direction!==want) { try { tx.direction = want; } catch(err) { dbg('set direction failed', err); } }
    if (!!track!==sendingNow) renegotiate(peer);
  });
}
function setLocalPreview(stream) {
  // Mirror what we are broadcasting into our own self-tile (muted, so we never hear ourselves).
  if (!localVideo) { localVideo = document.createElement('video'); localVideo.autoplay = true; localVideo.playsInline = true; localVideo.muted = true; }
  localVideo.srcObject = stream||null;
}

function stopShare() {
  if (!sharing) return;
  dbg('stopShare');
  sharing = false;
  screenStream?.getTracks().forEach(t=>t.stop());
  screenStream = null;
  let camOn = !!(camTrack&&camTrack.enabled);
  replaceVideoTrack(camOn?camTrack:null);
  // Revert our self-tile preview to the camera if it was on, otherwise drop back to the avatar.
  setLocalPreview(camOn?new MediaStream([camTrack]):null);
  hasvideo = camOn;
  camTrack = null;
  let screenButton = document.getElementById('screenButton');
  screenButton.setAttribute('tlang', 'channel.call.screen.on');
  screenButton.innerHTML = screenIcons[0];
  if (mediaStream&&mediaStream.getVideoTracks().length) document.getElementById('camButton').disabled = false;
  sendSignal('settings', { video: camOn });
  showConnections();
}

window.setPeerVolume = (user, value)=>{
  let peer = [...peers.values()].find(p=>p.username&&sanitizeMinimChars(p.username)===user);
  if (!peer) return;
  peer.volume = Math.max(0, Math.min(100, Number(value)))/100;
  peer.muted = peer.volume===0;
  peer.elems.forEach(e=>{ e.volume = peer.muted?0:peer.volume*callMaster; });
};
window.togglePeerMute = (user)=>{
  let peer = [...peers.values()].find(p=>p.username&&sanitizeMinimChars(p.username)===user);
  if (!peer) return;
  peer.muted = !peer.muted;
  if (!peer.muted&&peer.volume===0) peer.volume = 1;
  peer.elems.forEach(e=>{ e.volume = peer.muted?0:peer.volume*callMaster; });
  showConnections();
};
window.setCallMasterVolume = (v)=>{
  callMaster = Math.max(0, Math.min(100, Number(v)))/100;
  peers.forEach(p=>p.elems.forEach(e=>{ if (e.tagName.toLowerCase()==='audio') e.volume = p.muted?0:p.volume*callMaster; }));
};

function signalSigInput(type, channel, fromId, toId, payload) {
  // Canonical string bound to the signal's type, channel, sender and recipient so a relaying server cannot tamper with,
  // reattribute or reflect a signal without invalidating the signature. Settings are broadcast so they sign toId='' .
  return type+'|'+channel+'|'+fromId+'|'+toId+'|'+JSON.stringify(payload);
}
function resolvePeerUsername(id) {
  return peers.get(id)?.username||idToUser.get(id)||'';
}
async function checkPeerKey(username, public64) {
  // Same trust flow E2E messages use: trust-on-first-use, and on a CHANGED key show the exact "public key has changed"
  // warning messaging shows. Declining marks the user untrusted so their call signals are then rejected as unverified.
  if (!username||!public64||!window.PKStore) return;
  if (!window.PKStore.has(username)) { window.PKStore.set(username, public64); saveToDB(); untrustedUsers.delete(username); return; }
  if (window.PKStore.get(username)===public64) { untrustedUsers.delete(username); return; }
  let conf = await affirm('message.publicChange', username);
  if (conf) { window.PKStore.set(username, public64); saveToDB(); untrustedUsers.delete(username); }
  else untrustedUsers.add(username);
}
async function ensureCallKeys() {
  // Load + verify every channel member's public key before connecting, from the same endpoint messaging uses, so PKStore
  // always holds the keys we verify call signals against (otherwise signatures can't be checked and the call never connects).
  try {
    let members = await backendfetch(`/api/v1/channel/${currentCallCh}/members?pb=true`);
    if (Array.isArray(members)) for (let i=0;i<members.length;i++) await checkPeerKey(members[i].username, members[i].public);
  } catch(err) { dbg('ensureCallKeys failed', err); }
}
function markUnverified(fromId) {
  // Surface a verification failure: flag the peer's tile and warn once. This fires only when a signal was signed but the
  // signature did not match the trusted key (tampering), or a known peer sent an unsigned signal, never on a missing key.
  let username = resolvePeerUsername(fromId);
  let peer = peers.get(fromId);
  if (peer) { peer.unverified = true; renderPeerTileStatus(peer); }
  let key = username||fromId;
  if (key&&!warnedUnverified.has(key)) { warnedUnverified.add(key); notice('channel.call.unverified', key); }
}
async function verifySignalData(data) {
  // MITM protection: verify the signal against the sender's TRUSTED public key. A forged or modified offer/answer/ice
  // (the SDP carries the DTLS fingerprint that secures the media) fails here and is dropped, so it never reaches the pc.
  let wrapped = data.data;
  let username = resolvePeerUsername(data.from_user);
  if (!wrapped||typeof wrapped!=='object'||typeof wrapped.s!=='string'||!('p' in wrapped)) { dbg('signal not signed, dropping', data.type, 'from', data.from_user); if (username&&window.PKStore?.has(username)) markUnverified(data.from_user); return null; }
  let pub = username&&!untrustedUsers.has(username)&&window.PKStore?.get(username);
  if (!pub) { dbg('no trusted key to verify', data.type, 'from', data.from_user, username); if (username&&untrustedUsers.has(username)) markUnverified(data.from_user); return null; }
  let toId = data.type==='settings'?'':window.myId;
  try {
    let ok = await verifyRSAString(signalSigInput(data.type, currentCallCh, data.from_user, toId, wrapped.p), wrapped.s, await getRSAKeyFromPublic64(pub));
    if (!ok) { dbg('signal signature INVALID, dropping', data.type, 'from', data.from_user); markUnverified(data.from_user); return null; }
    return wrapped.p;
  } catch(err) { dbg('verify failed', data.type, 'from', data.from_user, err); return null; }
}
async function sendSignal(type, data, target) {
  dbg('sendSignal', type, '->', target||'(broadcast)');
  let payload = data;
  try {
    let priv = (await getRSAKeyPair()).privateKey;
    payload = { p: data, s: await signRSAString(signalSigInput(type, currentCallCh, window.myId, target||'', data), priv) };
  } catch(err) { dbg('sign signal failed', err); }
  return backendfetch(`/api/v1/channel/${currentCallCh}/call/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(target?{ type, data: payload, target }:{ type, data: payload })
  });
}

async function flushCandidates(peer) {
  let pending = peer.candidates;
  peer.candidates = [];
  for (let i=0;i<pending.length;i++) {
    try { await peer.pc.addIceCandidate(new RTCIceCandidate(pending[i])); } catch(err) { if (window.debugCall) console.log(err); }
  }
}

async function connectExisting() {
  let res = await backendfetch(`/api/v1/channel/${currentCallCh}/call`);
  dbg('connectExisting participants', res.participants);
  if (!res.active||!res.participants) return;
  res.participants.forEach(p=>{ if (p.id&&p.username) idToUser.set(p.id, p.username); });
  for (let i=0;i<res.participants.length;i++) {
    let p = res.participants[i];
    if (p.id&&p.id!==window.myId) await addPeer(p.id, p.username);
  }
}

export async function startCall(channel, ans=false) {
  if (currentCallCh===channel) return;
  answeredChannels.add(channel);
  // Create AudioContexts synchronously while still in the user-gesture activation window (before any await).
  // If created after an await the gesture has expired and Chrome starts the context suspended, causing
  // the mic to send silence until something resumes it (was the root cause of the "no audio until screenshare" bug).
  try { micContext = new AudioContext(); micContext.resume().catch(()=>{}); } catch(e) { dbg('micCtx creation failed', e); }
  try { remoteAudioCtx = new AudioContext(); remoteAudioCtx.resume().catch(()=>{}); } catch(e) { dbg('remoteAudioCtx creation failed', e); }
  resumeAudio = ()=>{ if (micContext?.state==='suspended') micContext.resume().catch(()=>{}); if (remoteAudioCtx?.state==='suspended') remoteAudioCtx.resume().catch(()=>{}); };
  document.addEventListener('click', resumeAudio, true);
  // Start
  window.stopCallRing();
  currentCallCh = channel;
  answered = ans;
  ready = false;
  hasvideo = false;
  sharing = false;
  deafened = false;
  pendingSettings = new Map();
  camTrack = null;
  screenStream = null;
  localVideo = null;
  focusedUser = null;
  peers = new Map();
  idToUser = new Map();
  untrustedUsers = new Set();
  warnedUnverified = new Set();
  stopAloneTimer();
  queue = [];
  display = document.getElementById('call-display');
  display.style.display = '';
  let _chLbl = document.getElementById('call-ch-label');
  if (_chLbl) { let _chd = window.channels?.find(c=>c.id===channel); _chLbl.textContent = _chd?(_chd.type===1?'@'+_chd.name:'#'+_chd.name):''; }
  // Bind the tile-focus click listener once per call session (idempotent via focusBound flag).
  let grid = display.querySelector('.grid');
  if (grid&&!grid.dataset.focusBound) { grid.addEventListener('click', onTileClick); grid.dataset.focusBound = '1'; }
  // Preload the status strings ONCE so renderPeerTileStatus can set text synchronously (showConnections re-renders constantly,
  // so any per-render getTranslation().then() would resolve onto a detached node and leave the pill blank).
  [statusKeys.connecting, statusKeys.connected, statusKeys.reconnecting, statusKeys.failed, statusKeys.unverified, 'channel.call.ping'].forEach(k=>getTranslation(k).then(t=>statusStrings[k] = t));
  showConnections();
  startStatsLoop();
  startSpeakLoop();
  // Buttons and media stream
  let micButton = document.getElementById('micButton');
  micButton.setAttribute('tlang', 'channel.call.micro.off');
  micButton.innerHTML = micIcons[1];
  micButton.disabled = true;
  let deafButton = document.getElementById('deafButton');
  deafButton.setAttribute('tlang', 'channel.call.deafen.on');
  deafButton.innerHTML = deafIcons[1];
  let camButton = document.getElementById('camButton');
  camButton.setAttribute('tlang', 'channel.call.camera.on');
  camButton.innerHTML = camIcons[0];
  camButton.disabled = true;
  let screenButton = document.getElementById('screenButton');
  screenButton.setAttribute('tlang', 'channel.call.screen.on');
  screenButton.innerHTML = screenIcons[0];
  let fullButton = document.getElementById('fullButton');
  fullButton.setAttribute('tlang', 'channel.call.fullscreen.on');
  fullButton.innerHTML = fullIcons[0];
  let expandButton = display.querySelector('.expand');
  // Show a clear pending state while the browser permission prompt is up; never leave mediaStream undefined so the
  // join/signaling path below works even if mic/cam are denied (the user joins listen-only and shows as no-media).
  display.classList.add('connecting');
  mediaStream = new MediaStream();
  try {
    // Audio
    let audio = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true }, video: false });
    rawAudioTrack = audio.getAudioTracks()[0];
    rawAudioTrack.enabled = true;
    // Route the mic through Web Audio so its gain (microphone volume) is adjustable, then send the processed track.
    let micTrack = rawAudioTrack;
    try {
      if (!micContext) throw new Error('no micContext');
      micGain = micContext.createGain();
      micGain.gain.value = (Number(localStorage.getItem('pcall-mic'))||100)/100;
      micAnalyser = micContext.createAnalyser();
      micAnalyser.fftSize = 256;
      let source = micContext.createMediaStreamSource(new MediaStream([rawAudioTrack]));
      let dest = micContext.createMediaStreamDestination();
      source.connect(micGain).connect(micAnalyser).connect(dest);
      // Chrome auto-suspends AudioContexts with no connection to context.destination. A silent tap keeps it alive.
      let keepAlive = micContext.createGain();
      keepAlive.gain.value = 0;
      micAnalyser.connect(keepAlive).connect(micContext.destination);
      micTrack = dest.stream.getAudioTracks()[0];
    } catch(err) {
      dbg('mic gain routing failed, using raw track', err);
      micContext?.close(); micContext = null;
      micGain = null;
      micAnalyser = null;
      micTrack = rawAudioTrack;
    }
    mediaStream.addTrack(micTrack);
    micButton.disabled = false;
    // micContext is suspended when startCall runs outside a gesture (e.g. answering an incoming call).
    // Start muted so the first unmute click also resumes the context via the document click listener.
    if (micContext?.state==='suspended') {
      micTrack.enabled = false;
      micButton.setAttribute('tlang', 'channel.call.micro.on');
      micButton.innerHTML = micIcons[0];
    }
  } catch(err) {
    // Denied or no mic: join muted, leave the mic button disabled to signal there is no microphone.
    dbg('mic unavailable', err);
  }
  try {
    // Video (optional)
    let video = await navigator.mediaDevices.getUserMedia({ video: true });
    let videoTrack = video.getVideoTracks()[0];
    videoTrack.enabled = false;
    mediaStream.addTrack(videoTrack);
    camButton.disabled = false;
  } catch(err) {
    // Denied or no camera: leave the camera button disabled; screen share still works via getDisplayMedia.
    dbg('camera unavailable', err);
  }
  display.classList.remove('connecting');
  window.toggleMic = ()=>{
    let audioTrack = mediaStream?.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    micButton.setAttribute('tlang', 'channel.call.micro.'+(audioTrack.enabled?'off':'on'));
    micButton.innerHTML = micIcons[Number(audioTrack.enabled)];
    playSFX(audioTrack.enabled?'unmute':'mute');
    sendSignal('settings', { video: hasvideo, muted: !audioTrack.enabled, deafened });
    showConnections();
  };
  window.toggleDeafen = ()=>{
    deafened = !deafened;
    peers.forEach(peer=>{
      peer.elems.forEach(e=>{
        if (e.tagName.toLowerCase()==='audio') e.volume = deafened?0:(peer.muted?0:peer.volume*callMaster);
      });
    });
    if (deafened) {
      let audioTrack = mediaStream?.getAudioTracks()[0];
      if (audioTrack&&audioTrack.enabled) {
        audioTrack.enabled = false;
        micButton.setAttribute('tlang', 'channel.call.micro.on');
        micButton.innerHTML = micIcons[0];
        sendSignal('settings', { video: hasvideo, muted: true, deafened: true });
      }
    }
    deafButton.setAttribute('tlang', 'channel.call.deafen.'+(deafened?'off':'on'));
    deafButton.innerHTML = deafIcons[Number(!deafened)];
    playSFX(deafened?'mute':'unmute');
    let curAudio2 = mediaStream?.getAudioTracks()[0];
    sendSignal('settings', { video: hasvideo, muted: curAudio2?!curAudio2.enabled:false, deafened });
    showConnections();
  };
  window.setCallMicVolume = (v)=>{ if (micGain) micGain.gain.value = Math.max(0, Math.min(200, Number(v)))/100; };
  window.toggleCam = ()=>{
    if (sharing) return;
    let videoTrack = mediaStream?.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    hasvideo = videoTrack.enabled;
    camButton.setAttribute('tlang', 'channel.call.camera.'+(videoTrack.enabled?'off':'on'));
    camButton.innerHTML = camIcons[Number(videoTrack.enabled)];
    // Make sure the camera track is actually being sent (the m-line may have been negotiated recvonly when we joined
    // with the camera off); replaceVideoTrack swaps it in and renegotiates only if the m-line isn't already sending.
    replaceVideoTrack(videoTrack.enabled?videoTrack:null);
    setLocalPreview(videoTrack.enabled?new MediaStream([videoTrack]):null);
    sendSignal('settings', { video: videoTrack.enabled });
  };
  window.toggleSize = ()=>{
    display.classList.toggle('big');
    expandButton.setAttribute('tlang', 'channel.call.'+(display.classList.contains('big')?'shrink':'expand'));
  };
  window.toggleScreen = async()=>{
    if (!mediaStream) return;
    if (sharing) { stopShare(); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch(err) {
      dbg('toggleScreen denied', err);
      return;
    }
    screenStream = stream;
    let screenTrack = stream.getVideoTracks()[0];
    camTrack = mediaStream.getVideoTracks()[0]||null;
    sharing = true;
    hasvideo = true;
    screenButton.setAttribute('tlang', 'channel.call.screen.off');
    screenButton.innerHTML = screenIcons[1];
    camButton.disabled = true;
    replaceVideoTrack(screenTrack);
    setLocalPreview(stream);
    screenTrack.onended = ()=>stopShare();
    sendSignal('settings', { video: true });
    showConnections();
  };
  window.toggleFullscreen = ()=>{
    if (document.fullscreenElement||document.webkitFullscreenElement) {
      (document.exitFullscreen||document.webkitExitFullscreen).call(document);
    } else {
      (display.requestFullscreen||display.webkitRequestFullscreen).call(display);
    }
  };
  display.onfullscreenchange = ()=>{
    let on = !!(document.fullscreenElement||document.webkitFullscreenElement);
    display.classList.toggle('fullscreen', on);
    fullButton.setAttribute('tlang', 'channel.call.fullscreen.'+(on?'off':'on'));
    fullButton.innerHTML = fullIcons[Number(on)];
  };
  display.onwebkitfullscreenchange = display.onfullscreenchange;
  // Join call
  dbg('startCall', channel, 'answered='+answered, 'iceServers=', callConfig().iceServers);
  let joinRes = await backendfetch(`/api/v1/channel/${channel}/call`, {
    method: 'POST',
    passstatus: true
  });
  dbg('join response', joinRes.status, joinRes);
  if (joinRes.status>=400) {
    currentCallCh = '';
    display.style.display = 'none';
    mediaStream?.getTracks().forEach(track=>track.stop());
    mediaStream = null;
    return;
  }
  // Media is ready: load+verify the channel's public keys (same trust flow as messages) so call signals can be verified,
  // then connect. connectExisting runs before the queued-signal replay so id->username is populated before verification.
  ready = true;
  await ensureCallKeys();
  await connectExisting();
  for (let i=0;i<queue.length;i++) await handleSignal(queue[i]);
  queue = [];
  showConnections();
  // Alone right now (we started it or joined an empty one): ring until someone joins and leave after 3 minutes; if we
  // joined a call that already has people, play the join sound instead.
  if (peers.size===0) { startAloneTimer(); startRingTimer(); window.playCallRing('call-outgoing'); }
  else playSFX('call-join');
};
export async function event(type, data) {
  dbg('event', type, data);
  switch(type) {
    case 'start':
      if (data.started_by===window.username) return;
      if (currentCallCh===data.channel_id) return;
      if (answeredChannels.has(data.channel_id)) {
        if (window.activeCalls?.[data.channel_id]) return;
        answeredChannels.delete(data.channel_id);
      }
      let caller = data.started_by?(UserStore.get(data.started_by)?.display??'@'+data.started_by):(await getTranslation('channel.call.someone')||'Someone');
      caller = sanitizeHTML(caller);
      let ch = window.channels?.find(c=>c.id===data.channel_id);
      let inGroup = ch&&ch.type!==1;
      if (!document.hasFocus()) notify('call_start', data, data.started_by);
      ringingCh = data.channel_id;
      window.playCallRing();
      let pick = inGroup?await affirm('channel.callincoming.in', [caller, sanitizeHTML(ch.name)]):await affirm('channel.callincoming', caller);
      ringingCh = '';
      window.stopCallRing();
      if (pick) startCall(data.channel_id, true);
      break;
    case 'join':
      if (data.user.id&&data.user.username) idToUser.set(data.user.id, data.user.username);
      await checkPeerKey(data.user.username, data.user.public);
      showConnections();
      if (ready&&data.user.id&&data.user.id!==window.myId) {
        answered = true;
        stopAloneTimer();
        stopRingTimer();
        window.stopCallRing();
        addPeer(data.user.id, data.user.username);
        playSFX('call-join');
        let curAudio = mediaStream?.getAudioTracks()[0];
        sendSignal('settings', { video: hasvideo, muted: curAudio?!curAudio.enabled:false, deafened });
      }
      break;
    case 'left':
      if (data.user.id) { removePeer(data.user.id); playSFX('call-leave'); }
      showConnections();
      // Don't drop the moment everyone else leaves; wait 3 minutes in case someone (re)joins.
      if (currentCallCh!==''&&peers.size===0) startAloneTimer();
      if (ringingCh&&ringingCh===data.channel_id) {
        let _rch = ringingCh;
        setTimeout(()=>{ if (ringingCh===_rch&&!window.activeCalls?.[_rch]) { window.stopCallRing(); document.getElementById('affirm').close(); ringingCh=''; } }, 0);
      }
      break;
  }
}
async function handleSignal(data) {
  if (window.debugCall) console.log(data);
  let payload = await verifySignalData(data);
  if (payload===null) return;
  data = { ...data, data: payload };
  if (data.type==='settings') {
    let peer = peers.get(data.from_user);
    if (!peer) { pendingSettings.set(data.from_user, data.data); return; }
    peer.videoOn = !!data.data.video;
    peer.remoteMuted = !!data.data.muted;
    peer.remoteDeafened = !!data.data.deafened;
    showConnections();
    return;
  }
  let peer = peers.get(data.from_user);
  if (!peer) {
    if (data.type!=='offer') return;
    peer = makePeer(data.from_user, resolvePeerUsername(data.from_user));
  }
  switch(data.type) {
    case 'offer':
      // Perfect-negotiation glare handling: if we are mid-offer and impolite, ignore the incoming offer.
      let collision = peer.makingOffer||peer.pc.signalingState!=='stable';
      peer.ignoreOffer = !peer.polite&&collision;
      if (peer.ignoreOffer) { dbg('ignoring colliding offer from', data.from_user); break; }
      if (collision) {
        try { await peer.pc.setLocalDescription({ type: 'rollback' }); } catch(e) { dbg('rollback failed', e); }
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.data));
      } else await peer.pc.setRemoteDescription(new RTCSessionDescription(data.data));
      peer.remoteSet = true;
      await flushCandidates(peer);
      // setRemoteDescription can negotiate brand-new transceivers instead of reusing the ones addTransceiver pre-created in makePeer,
      // leaving those originals orphaned at mid=null forever. Re-point to whatever actually got a mid before answering, or our own
      // audio/video never reaches the offerer (stuck recvonly) even though the peer connection reports "connected".
      let negAudioTx = peer.pc.getTransceivers().find(t=>t.mid!==null&&t.receiver.track.kind==='audio');
      let negVideoTx = peer.pc.getTransceivers().find(t=>t.mid!==null&&t.receiver.track.kind==='video');
      if (negAudioTx) { peer.audioTransceiver = negAudioTx; peer.audioSender = negAudioTx.sender; negAudioTx.direction = 'sendrecv'; }
      if (negVideoTx) { peer.videoTransceiver = negVideoTx; peer.videoSender = negVideoTx.sender; negVideoTx.direction = 'sendrecv'; }
      let aat = mediaStream?.getAudioTracks()[0];
      if (aat&&peer.audioSender) await peer.audioSender.replaceTrack(aat).catch(e=>dbg('audio reattach (offer) failed', e));
      let vat = mediaStream?.getVideoTracks()[0];
      if (vat&&peer.videoSender) await peer.videoSender.replaceTrack(vat).catch(e=>dbg('video reattach (offer) failed', e));
      let answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      // First inbound offer completes the initial handshake on this (answering) side; from now on we may offer too.
      peer.negotiated = true;
      sendSignal('answer', peer.pc.localDescription, data.from_user);
      break;
    case 'answer':
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.data));
        peer.remoteSet = true;
        peer.negotiated = true;
        await flushCandidates(peer);
        let bat = mediaStream?.getAudioTracks()[0];
        if (bat&&peer.audioSender) peer.audioSender.replaceTrack(bat).catch(e=>dbg('audio reattach (answer) failed', e));
      } catch(err) {
        dbg('setRemoteDescription(answer) failed', peer.remoteId, err.name, err.message);
        if (window.debugCall) console.log(err);
        if (err.name==='InvalidAccessError'&&window.myId<peer.remoteId) setTimeout(()=>renegotiate(peer), 500);
      }
      break;
    case 'ice':
      if (!data.data) return;
      if (!peer.remoteSet) { peer.candidates.push(data.data); return; }
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(data.data));
      } catch(err) {
        if (!peer.ignoreOffer&&window.debugCall) console.log(err);
      }
      break;
  }
}
export function signal(data) {
  if (currentCallCh==='') return;
  if (!ready) {
    queue.push(data);
    return;
  }
  handleSignal(data);
}
export function leaveCall() {
  if (currentCallCh==='') return;
  let ch = currentCallCh;
  currentCallCh = '';
  window.stopCallRing();
  playSFX('call-leave');
  backendfetch(`/api/v1/channel/${ch}/call`, {
    method: 'DELETE',
    keepalive: true
  })
    .then(()=>{
      ready = false;
      answered = false;
      hasvideo = false;
      sharing = false;
      deafened = false;
      pendingSettings = new Map();
      camTrack = null;
      screenStream?.getTracks().forEach(track=>track.stop());
      screenStream = null;
      localVideo = null;
      focusedUser = null;
      if (document.fullscreenElement||document.webkitFullscreenElement) (document.exitFullscreen||document.webkitExitFullscreen).call(document);
      stopStatsLoop();
      stopAloneTimer();
      stopRingTimer();
      display.style.display = 'none';
      let _cl = document.getElementById('call-ch-label'); if (_cl) _cl.textContent = '';
      peers.forEach(peer=>{ peer.pc.close(); peer.elems.forEach(e=>e.remove()); });
      peers = new Map();
      idToUser = new Map();
      untrustedUsers = new Set();
      warnedUnverified = new Set();
      showConnSeq = 0;
      mediaStream?.getTracks().forEach(track=>track.stop());
      mediaStream = null;
      rawAudioTrack?.stop();
      rawAudioTrack = null;
      stopSpeakLoop();
      micContext?.close();
      micContext = null;
      micGain = null;
      micAnalyser = null;
      remoteAudioCtx?.close();
      remoteAudioCtx = null;
      if (resumeAudio) { document.removeEventListener('click', resumeAudio, true); resumeAudio = null; }
      queue = [];
    });
}
window.addEventListener('pagehide', ()=>{
  if (currentCallCh==='') return;
  leaveCall();
});
export function callChannel() { return currentCallCh; }
