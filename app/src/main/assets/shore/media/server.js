let onlineServers = {};
let extraServers = {};
let checkingServers = {};
let retryAttempts = {};
let nextRetryAt = {};
const MAX_RETRY_ATTEMPTS = 8;
const RETRY_BASE_DELAY = 200;
const RETRY_MAX_DELAY = 15000;
window.servers = JSON.parse(localStorage.getItem('servers'))??[];

function normalizeServer(url) {
  return url.replaceAll(/\/+$/g,'');
}
function serverCheckDue(url) {
  return onlineServers[url]===undefined && (!nextRetryAt[url] || Date.now()>=nextRetryAt[url]);
}
async function checkServer(url) {
  url = normalizeServer(url);
  if (onlineServers[url]!==undefined) return onlineServers[url];
  if (checkingServers[url]) return checkingServers[url];
  checkingServers[url] = (async()=>{
    let res;
    try {
      res = await fetch(url+'/api/v1', {
        redirect: 'follow'
      })
      res = await res.json();
    } catch(err) {
      res = {};
    }
    let ok = (res.running==='Holt'&&backendVersions.includes(res.version));
    if (ok) {
      window.serverData[url] = res;
      onlineServers[url] = true;
      extraServers[url] = { dev: res.dev??false, vermiss: !backendVersions.includes(res.version) };
      retryAttempts[url] = 0;
    } else {
      // A failed/unreachable attempt backs off and retries (up to MAX_RETRY_ATTEMPTS) instead of
      // getting stuck greyed-out until reload; once attempts are exhausted it settles on offline.
      retryAttempts[url] = (retryAttempts[url]||0)+1;
      if (retryAttempts[url]>=MAX_RETRY_ATTEMPTS) onlineServers[url] = false;
      else nextRetryAt[url] = Date.now()+Math.min(RETRY_BASE_DELAY*(2**retryAttempts[url]), RETRY_MAX_DELAY);
    }
    delete checkingServers[url];
    return ok;
  })();
  return checkingServers[url];
}

let curServerTime = null;
const ServerInput = document.getElementById('server');
ServerInput.onchange = ServerInput.oninput = function(){
  if (curServerTime) clearTimeout(curServerTime);
  ServerInput.setAttribute('invalid', true);
  curServerTime = setTimeout(()=>{
    checkServer(ServerInput.value)
      .then(valid=>{
        ServerInput[valid?'removeAttribute':'setAttribute']('invalid', true);
      });
  }, 10);
};

window.showServerList = showServerList;
function showServerList() {
  if (!document.querySelector('#server-list > span[selected]')) document.getElementById('server-select').setAttribute('disabled', true);
  if (window.servers.length===0) {
    document.getElementById('server-list').innerHTML = `<span class="sm-empty" tlang="servers.empty">No servers yet. Paste a URL above to add one.</span>`;
    window.translate();
    return;
  }
  document.getElementById('server-list').innerHTML = window.servers
    .map(srv=>`<span data-id="${srv.id}" data-url="${encodeURIComponent(srv.url)}"${onlineServers[srv.url]?' online':''}${document.querySelector('#server-list > span[selected]')?.getAttribute('data-id')===srv.id?' selected':''}>
  <button${document.querySelector(`#server-list > span[data-url="${encodeURIComponent(srv.url)}"][selected]`)?' selected':''}>
    <span>${sanitizeHTML(srv.url)}</span>
    <span>
      ${srv.name?`<span style="font-size:90%"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256"><path fill-rule="evenodd" clip-rule="evenodd" d="M128 128C163.346 128 192 99.3462 192 64C192 28.6538 163.346 0 128 0C92.6538 0 64 28.6538 64 64C64 99.3462 92.6538 128 128 128ZM151 146H148H108H105C49.7715 146 5 190.772 5 246V256H108H148H251V246C251 190.772 206.228 146 151 146Z"/></svg>${sanitizeMinimChars(srv.name)}</span>`:''}
      ${extraServers[srv.url]?.dev?'<span title="This is a dev server">⚠️</span>':''}
      ${extraServers[srv.url]?.vermiss?'<span title="There is a version missmatch">❌</span>':''}
    </span>
  </button>
  ${!onlineServers[srv.url]?`<button class="retry" aria-label="Retry"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256"><path d="M128 24C69.72 24 22 71.72 22 130H0L29.5 174.5L59 130H37C37 79.85 77.85 39 128 39C178.15 39 219 79.85 219 130C219 180.15 178.15 221 128 221C104.5 221 83.1 212.1 67 197.5L56.5 208.5C76 226.4 100.9 236 128 236C186.28 236 234 188.28 234 130C234 71.72 186.28 24 128 24Z"/></svg></button>`:''}
  <button class="del" aria-label="Remove server"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256"><g transform="rotate(45 128 128)"><rect x="103" width="50" height="256" rx="25"/><rect y="103" width="256" height="50" rx="25"/></g></svg></button>
</span>`)
    .join('');
  document.querySelectorAll('#server-list > span').forEach(spn=>{
    spn.querySelector('button').onclick = ()=>{
      document.querySelector('#server-list > span[selected]')?.removeAttribute('selected');
      spn.setAttribute('selected', true);
      document.getElementById('server-select').removeAttribute('disabled');
    };
    spn.querySelector('button.retry')?.addEventListener('click', (evt)=>{
      evt.stopPropagation();
      let url = normalizeServer(decodeURIComponent(spn.getAttribute('data-url')));
      delete onlineServers[url];
      delete nextRetryAt[url];
      retryAttempts[url] = 0;
      checkServer(url).then(()=>showServerList());
      clearInterval(checkOnlineInter);
      checkOnlineInter = setInterval(pollServers, 200);
    });
    spn.querySelector('button.del').onclick = ()=>{
      let id = decodeURIComponent(spn.getAttribute('data-id'));
      window.servers = window.servers.filter(srv=>srv.id!==id);
      localStorage.setItem('servers', JSON.stringify(window.servers));
      localStorage.removeItem(id+'-publicKey');
      localStorage.removeItem(id+'-privateKey');
      localStorage.removeItem(id+'-sessionToken');
      localStorage.removeItem(id+'-lc');
      showServerList();
    };
  });
}
document.getElementById('server-add').onclick = function(){
  if (typeof ServerInput.getAttribute('invalid')==='string') return;
  window.servers.push({
    id: Math.floor(Math.random()*(16**8)).toString(16),
    name: null,
    url: normalizeServer(ServerInput.value)
  });
  ServerInput.value = '';
  localStorage.setItem('servers', JSON.stringify(window.servers));
  showServerList();
};
document.getElementById('sm-remember').checked = localStorage.getItem('prs')==='true';
let checkOnlineInter;
document.getElementById('server-select').onclick = function(){
  if (typeof document.getElementById('server-select').getAttribute('disabled')==='string') return;
  window.currentServer = document.querySelector('#server-list > span[selected]').getAttribute('data-id');
  document.getElementById('server-modal').close();
  clearInterval(checkOnlineInter);
  localStorage.setItem('pls', window.currentServer);
  localStorage.setItem('prs', document.getElementById('sm-remember').checked);
  window.postServerSelect();
};

document.getElementById('server-modal').onclose = (evt) => {
  evt.preventDefault();
};

window.currentServer = '';
(async()=>{
  if (!localStorage.getItem('servers')) {
    try {
      let path = (window.location.pathname.split('/').filter(p=>p.length).length===1)?window.location.pathname:'';
      let testFetchSelf = await fetch(location.protocol+'//'+window.location.host+path+'/api/v1');
      testFetchSelf = await testFetchSelf.json();
      if (testFetchSelf.running!=='Holt'||!backendVersions.includes(testFetchSelf.version)) throw new Error('Result is false');
      window.servers = [{
        id: Math.floor(Math.random()*(16**8)).toString(16),
        name: null,
        url: normalizeServer(location.protocol+'//'+window.location.host+path)
      }];
    } catch(err) {
      window.servers = [];
    }
  } else {
    if (window.servers.length>0&&(typeof window.servers[0]==='string')) {
      window.servers = window.servers.map(srv=>{
        let n = {
          id: Math.floor(Math.random()*(16**8)).toString(16),
          name: localStorage.getItem(srv+'-username')??null,
          url: normalizeServer(srv)
        };
        if (localStorage.getItem(srv+'-publicKey')) localStorage.setItem(n.id+'-publicKey', localStorage.getItem(srv+'-publicKey'));
        if (localStorage.getItem(srv+'-privateKey')) localStorage.setItem(n.id+'-privateKey', localStorage.getItem(srv+'-privateKey'));
        if (localStorage.getItem(srv+'-sessionToken')) localStorage.setItem(n.id+'-sessionToken', localStorage.getItem(srv+'-sessionToken'));
        localStorage.removeItem(srv+'-publicKey');
        localStorage.removeItem(srv+'-privateKey');
        localStorage.removeItem(srv+'-sessionToken');
        localStorage.removeItem(srv+'-username');
        return n;
      });
    }
  }
  localStorage.setItem('servers', JSON.stringify(window.servers));
  let lastSrv = localStorage.getItem('pls');
  if (lastSrv&&localStorage.getItem('prs')==='true'&&window.servers[0]&&window.servers.find(srv=>srv.id===lastSrv)&&localStorage.getItem(lastSrv+'-sessionToken')) {
    window.currentServer = lastSrv;
    clearInterval(checkOnlineInter);
    window.postServerSelect();
    return;
  }
  showServerList();
  document.getElementById('server-modal').showModal();
})();

function pollServers() {
  let pending = false;
  window.servers.forEach(srv=>{
    if (onlineServers[srv.url]!==undefined) return;
    pending = true;
    if (!serverCheckDue(srv.url)) return;
    checkServer(srv.url)
      .then(()=>{
        showServerList();
      });
  });
  if (!pending) clearInterval(checkOnlineInter);
}
checkOnlineInter = setInterval(pollServers, 200);