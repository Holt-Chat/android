document.getElementById('signup-modal').onclose = document.getElementById('signup-password').onclose = (evt) => {
  evt.preventDefault();
};
function showLanding() {
  document.getElementById('app').style.display = 'none';
  document.querySelector('.lateral').style.display = 'none';
  document.getElementById('landing').style.display = '';
}
window.showLanding = showLanding;
document.getElementById('instead-btn').onclick = ()=>{
  let errors = document.getElementById('l-errors');
  let logining = document.querySelector('[tlang="login.title"]');
  document.querySelector(`[tlang="${logining?'login':'signup'}.title"]`).setAttribute('tlang', `${logining?'signup':'login'}.title`);
  document.querySelector(`[tlang="${logining?'login':'signup'}.button"]`).setAttribute('tlang', `${logining?'signup':'login'}.button`);
  document.getElementById('instead-btn').setAttribute('tlang', `${logining?'signup':'login'}.instead`);
  document.getElementById('s-hide').style.display = logining?'none':'';
  document.getElementById('lx-mode').setAttribute('tlang', logining?'landing.mode.signup':'landing.mode.login');
  document.getElementById('lx-signupnote').style.display = logining?'':'none';
  let agree = document.getElementById('lx-agree');
  agree.style.display = (logining&&agree.dataset.has==='1')?'':'none';
  errors.setAttribute('tlang', 'empty');
  document.getElementById('l-username').removeAttribute('invalid');
}

let TypingTimer = null;
document.getElementById('l-username').oninput = (evt)=>{
  clearTimeout(TypingTimer);
  evt.target.value = evt.target.value.toLowerCase();
  TypingTimer = setTimeout(()=>{
    if (document.querySelector('[tlang="login.title"]')) {
      evt.target.removeAttribute('invalid');
      return;
    }
    let errors = document.getElementById('l-errors');
    if (!(/^[a-z0-9_\-]{3,20}$/).test(evt.target.value)) {
      errors.setAttribute('tlang', 'error.username');
      evt.target.setAttribute('invalid', true);
      return;
    }
    fetch(getCurrentServerUrl()+'/api/v1/username_check?username='+evt.target.value)
      .then(res=>{
        if (res.status===200) {
          errors.setAttribute('tlang', 'empty');
          evt.target.removeAttribute('invalid');
        } else {
          errors.setAttribute('tlang', 'error.usernameuse');
          evt.target.setAttribute('invalid', true);
        }
      });
  }, 1000);
}

let LoginFileContents = {};
document.getElementById('l-keyfile').onchange = (evt)=>{
  const file = evt.target.files[0];
  if (!file) {
    LoginFileContents = {};
    return;
  }

  const reader = new FileReader();
  reader.onload = (res)=>{
    try {
      LoginFileContents = JSON.parse(res.target.result);
      if (LoginFileContents.passKey) document.getElementById('l-passkey').value = LoginFileContents.passKey;
      if (LoginFileContents.username) document.getElementById('l-username').value = LoginFileContents.username;
    } catch(err) {
      LoginFileContents = {};
    }
  };
  reader.onerror = ()=>{
    LoginFileContents = {};
  };
  reader.readAsText(file);
};

document.getElementById('login-btn').onclick = async()=>{
  const errors = document.getElementById('l-errors');
  if (!document.getElementById('l-username').checkValidity() || document.getElementById('l-username').getAttribute('invalid')) {
    errors.setAttribute('tlang','error.username');
    return;
  }
  let logining = document.querySelector('[tlang="login.title"]');
  if (logining) {
    if (!document.getElementById('l-passkey').checkValidity()) {
      errors.setAttribute('tlang','error.passkey');
      return;
    }
    if (!document.getElementById('l-keyfile').checkValidity()) {
      errors.setAttribute('tlang','error.keyfile');
      return;
    }
    if (!LoginFileContents.publicKey||!LoginFileContents.privateKey) {
      errors.setAttribute('tlang','error.keyfile');
      return;
    }
    if (!(/^[a-zA-Z0-9\+\/=]+$/m).test(LoginFileContents.publicKey)) {
      errors.setAttribute('tlang','error.keyfile');
      return;
    }
    if (!(/^[a-zA-Z0-9\+\/=]+$/m).test(LoginFileContents.privateKey)) {
      errors.setAttribute('tlang','error.keyfile');
      return;
    }
    localStorage.setItem(window.currentServer+'-publicKey', LoginFileContents.publicKey);
    localStorage.setItem(window.currentServer+'-privateKey', LoginFileContents.privateKey);
  }
  errors.innerText = '';

  let publickey = '';
  if (logining) {
    publickey = LoginFileContents.publicKey;
  } else {
    await newRSAKeys();
    await getRSAKeyPair();
    publickey = localStorage.getItem(window.currentServer+'-publicKey');
  }

  let formData = new FormData();
  formData.append('username', document.getElementById('l-username').value);
  if (logining) formData.append('passkey', document.getElementById('l-passkey').value);
  formData.append('public', publickey);
  if (!logining&&(serverData[getCurrentServerUrl()]?.password_protected||false)) formData.append('password', localStorage.getItem(getCurrentServerUrl()+'-password'));

  fetch(getCurrentServerUrl()+`/api/v1/${logining?'login':'signup'}`, {
    method: 'POST',
    body: formData
  })
    .then(async(res) => {
      if (res.status===400) {
        errors.setAttribute('tlang','error.'+(logining?'publicmismatch':'usernameuse'));
        return;
      }
      if (res.status===401) {
        errors.setAttribute('tlang','error.'+(logining?'invalidcredentials':'usernameuse'));
        return;
      }
      if (res.status===403) {
        localStorage.removeItem(getCurrentServerUrl()+'-password');
        document.getElementById('landing').style.display = 'none';
        document.getElementById('signup-password').showModal();
        document.querySelector('#signup-password button').onclick = ()=>{
          localStorage.setItem(getCurrentServerUrl()+'-password', document.querySelector('#signup-password input').value);
          document.getElementById('signup-password').close();
          document.getElementById('landing').style.display = '';
        };
        return;
      }
      if (res.status===429) {
        errors.setAttribute('tlang','error.ratelimit');
        return;
      }
      if (res.status!==200 || !res.ok) {
        errors.setAttribute('tlang','error.generic');
        return;
      }

      let body = await res.json();
      solveChallenge(body.challenge, body.id, (data)=>{
        document.getElementById('landing').style.display = 'none';

        if (data.passkey) {
          document.getElementById('s-passkey').value = data.passkey;
          document.getElementById('l-passkey').value = data.passkey;
          document.getElementById('s-passkey-copy').onclick = ()=>{
            document.getElementById('s-passkey').select();
            navigator.clipboard.writeText(data.passkey);
          };
          let buildKeyFile = ()=>{
            let payload = {
              username: document.getElementById('l-username').value,
              publicKey: localStorage.getItem(window.currentServer+'-publicKey'),
              privateKey: localStorage.getItem(window.currentServer+'-privateKey')
            };
            if (document.getElementById('s-combined').checked) payload.passKey = data.passkey;
            const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
            document.getElementById('s-download').href = URL.createObjectURL(blob);
          };
          document.getElementById('s-combined').checked = true;
          document.getElementById('s-combined').onchange = buildKeyFile;
          buildKeyFile();
          let instanceFileName = sanitizeMinimChars(getCurrentServerUrl().split('://')[1].split('/')[0].split(':')[0].replaceAll('.','-'));
          document.getElementById('s-download').download = document.getElementById('l-username').value+'.'+instanceFileName+'.keys';
          let modal = document.getElementById('signup-modal');
          modal.showModal();
          let doneBtn = document.getElementById('s-done');
          doneBtn.onclick = ()=>{};
          doneBtn.setAttribute('disabled','');
          doneBtn.removeAttribute('tlang');
          doneBtn.innerText = '...';
          setTimeout(()=>{doneBtn.innerText = '..';}, 1000);
          setTimeout(()=>{doneBtn.innerText = '.';}, 2000);
          setTimeout(()=>{
            doneBtn.setAttribute('tlang','signup.done');
            window.translate();
            doneBtn.removeAttribute('disabled');
            doneBtn.onclick = ()=>{
              modal.close();
              window.postLogin();
            };
          }, 3000);
        } else {
          window.postLogin();
        }
      }).catch(()=>{ errors.setAttribute('tlang','error.generic'); });
    });
};

let DeviceLoginPoll = null;
let DeviceLoginStream = null;
let DeviceLoginPriv = null;
function deviceLoginStop() {
  if (DeviceLoginPoll) { clearInterval(DeviceLoginPoll); DeviceLoginPoll = null; }
  if (DeviceLoginStream) { DeviceLoginStream.getTracks().forEach(t=>t.stop()); DeviceLoginStream = null; }
  let v = document.querySelector('#devicelink-login-modal .dll-video');
  if (v) { v.style.display = 'none'; v.srcObject = null; }
}
async function deviceLoginClaim(code) {
  let m = document.getElementById('devicelink-login-modal');
  deviceLoginStop();
  let pubB64 = bufferToBase64(await crypto.subtle.exportKey('spki', DeviceLoginKeys.publicKey));
  let formData = new FormData();
  formData.append('code', code);
  formData.append('public', pubB64);
  let res = await fetch(getCurrentServerUrl()+'/api/v1/devicelink/claim', { method: 'POST', body: formData });
  if (!res.ok) { notice('devicelink.expired'); return; }
  m.querySelector('.dll-status').style.display = '';
  m.querySelector('.dll-paste').style.display = 'none';
  m.querySelector('.dll-scan').style.display = 'none';
  DeviceLoginPoll = setInterval(async()=>{
    let result = await (await fetch(getCurrentServerUrl()+'/api/v1/devicelink/result?code='+encodeURIComponent(code))).json();
    if (result.status==='expired') { deviceLoginStop(); notice('devicelink.expired'); m.close(); return; }
    if (result.status==='rejected') { deviceLoginStop(); notice('devicelink.rejected'); m.close(); return; }
    if (result.status!=='approved') return;
    deviceLoginStop();
    let session = await decryptRSAString(result.session_enc, DeviceLoginPriv);
    let blob = JSON.parse(result.blob);
    let aes = await base64ToAESKey(await decryptRSAString(blob.k, DeviceLoginPriv));
    let privB64 = new TextDecoder().decode(await decryptAES(blob.d, aes, blob.iv));
    localStorage.setItem(window.currentServer+'-publicKey', result.public);
    localStorage.setItem(window.currentServer+'-privateKey', privB64);
    localStorage.setItem(window.currentServer+'-sessionToken', session);
    window.username = result.username;
    m.close();
    document.getElementById('landing').style.display = 'none';
    window.postLogin();
  }, 2000);
}
function deviceLoginHandleCode(raw) {
  // Accept either the raw 20-char code (copied from the other device) or the full holt:link:<code> string (scanned QR).
  let v = (raw??'').trim();
  let code = v;
  if (v.includes(':')) {
    let parts = v.split(':');
    if (parts.length!==3||parts[0]!=='holt'||parts[1]!=='link') { notice('verify.invalid'); return false; }
    code = parts[2];
  }
  if (code.length!==20) { notice('verify.invalid'); return false; }
  deviceLoginClaim(code);
  return true;
}
async function deviceLoginStartScan() {
  let m = document.getElementById('devicelink-login-modal');
  let v = m.querySelector('.dll-video');
  let paste = m.querySelector('.dll-paste');
  try {
    DeviceLoginStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    paste.placeholder = await getTranslation('verify.nocamera');
    paste.focus();
    return;
  }
  v.srcObject = DeviceLoginStream;
  v.style.display = '';
  await v.play();
  let formats = [];
  try { if ('BarcodeDetector' in window) formats = await BarcodeDetector.getSupportedFormats(); } catch (e) {}
  let detector = (!window.HoltNative && formats.includes('qr_code'))?new BarcodeDetector({ formats: ['qr_code'] }):null;
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  DeviceLoginPoll = setInterval(async()=>{
    if (!v.videoWidth) return;
    try {
      if (detector) {
        let codes = await detector.detect(v);
        if (codes.length) deviceLoginHandleCode(codes[0].rawValue);
      } else {
        let scale = Math.min(1, 640/Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth*scale);
        canvas.height = Math.round(v.videoHeight*scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        let img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let code = jsQR(img.data, img.width, img.height);
        if (code) deviceLoginHandleCode(code.data);
      }
    } catch (e) {}
  }, 300);
}
let DeviceLoginKeys = null;
document.getElementById('otherdevice-btn').onclick = async()=>{
  let m = document.getElementById('devicelink-login-modal');
  deviceLoginStop();
  m.onclose = ()=>deviceLoginStop();
  DeviceLoginKeys = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  DeviceLoginPriv = DeviceLoginKeys.privateKey;
  let pubB64 = bufferToBase64(await crypto.subtle.exportKey('spki', DeviceLoginKeys.publicKey));
  let digest = await crypto.subtle.digest('SHA-256', base64ToBuffer(pubB64));
  let fp = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  let fpEl = m.querySelector('.dll-fp');
  fpEl.removeAttribute('tlang');
  fpEl.innerText = (await getTranslation('devicelink.fingerprint')).replace('{}', fp);
  let paste = m.querySelector('.dll-paste');
  paste.value = '';
  paste.style.display = '';
  paste.placeholder = await getTranslation('verify.paste');
  paste.onkeydown = (ev)=>{ if (ev.key==='Enter') deviceLoginHandleCode(paste.value); };
  m.querySelector('.dll-status').style.display = 'none';
  m.querySelector('.dll-scan').style.display = '';
  m.querySelector('.dll-scan').onclick = ()=>deviceLoginStartScan();
  m.showModal();
};

function sanitizeLegalHTML(html) {
  // Backends are untrusted (multi-server client): allowlist-sanitize before inserting
  const allowed = new Set(['H1','H2','H3','H4','H5','H6','P','A','UL','OL','LI','STRONG','EM','B','I','CODE','PRE','BLOCKQUOTE','HR','BR','TABLE','THEAD','TBODY','TR','TD','TH','DEL','SPAN']);
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.body.querySelectorAll('*').forEach(el=>{
    if (!allowed.has(el.tagName)) { el.remove(); return; }
    [...el.attributes].forEach(a=>{
      if (el.tagName==='A'&&a.name==='href'&&(/^(https?:|mailto:)/i).test(a.value.trim())) return;
      el.removeAttribute(a.name);
    });
    if (el.tagName==='A'&&el.getAttribute('href')) { el.setAttribute('target','_blank'); el.setAttribute('rel','noopener noreferrer'); }
  });
  return doc.body.innerHTML;
}
function openLegal(doc) {
  let modal = document.getElementById('legal-modal');
  let body = modal.querySelector('.legal-body');
  body.innerHTML = '';
  modal.showModal();
  fetch(getCurrentServerUrl()+'/api/v1/legal/'+doc)
    .then(res=>res.ok?res.json():Promise.reject(res.status))
    .then(data=>{
      body.innerHTML = sanitizeLegalHTML(data.html??'');
    })
    .catch(()=>{
      body.setAttribute('tlang', 'error.generic');
      window.translate();
    });
}
window.openLegal = openLegal;
function setupLegalLinks() {
  let legal = window.serverData[getCurrentServerUrl()]?.legal;
  let any = false;
  document.querySelectorAll('.lx-legallink').forEach(btn=>{
    let doc = btn.getAttribute('data-doc');
    let has = legal?.[doc];
    btn.style.display = has?'':'none';
    if (has) {
      any = true;
      btn.onclick = ()=>openLegal(doc);
    }
  });
  let wrap = document.getElementById('lx-legal');
  if (wrap) wrap.style.display = any?'':'none';
  let agree = document.getElementById('lx-agree');
  if (agree) {
    agree.dataset.has = any?'1':'';
    if (!any) agree.style.display = 'none';
  }
}
window.setupLegalLinks = setupLegalLinks;
async function postServerSelect() {
  if (!window.serverData[getCurrentServerUrl()]) {
    try {
      window.serverData[getCurrentServerUrl()] = await (await fetch(getCurrentServerUrl()+'/api/v1')).json();
    } catch(err) {
      window.serverData[getCurrentServerUrl()] = {};
    }
  }
  setupLegalLinks();
  if (loggedIn()) {
    getRSAKeyPair();
    window.postLogin();
  } else {
    if ((serverData[getCurrentServerUrl()]?.password_protected||false)&&!localStorage.getItem(getCurrentServerUrl()+'-password')) {
      document.getElementById('signup-password').showModal();
      document.querySelector('#signup-password button').onclick = ()=>{
        localStorage.setItem(getCurrentServerUrl()+'-password', document.querySelector('#signup-password input').value);
        document.getElementById('signup-password').close();
        document.getElementById('landing').style.display = '';
      };
    } else {
      document.getElementById('landing').style.display = '';
    }
  }
}
window.postServerSelect = postServerSelect;