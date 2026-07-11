// MDParse, Copyright Fsh-org
function _hlt(code, lang) {
  const KW = {js:new Set("break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await true false null undefined NaN Infinity".split(" ")),py:new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None".split(" ")),ts:new Set("break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await true false null undefined abstract as declare enum implements interface is keyof namespace never override readonly type".split(" ")),go:new Set("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil".split(" ")),rs:new Set("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type union unsafe use where while".split(" ")),rb:new Set("alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield".split(" ")),sh:new Set("if then else elif fi for do done while until case esac function in return exit break continue true false echo local".split(" "))};
  const HC = new Set(["py","python","rb","ruby","bash","sh","shell","zsh","r","perl","pl"]);
  const AM = {javascript:"js",typescript:"ts",python:"py",rust:"rs",golang:"go",ruby:"rb","c++":"cpp",shell:"sh",bash:"sh",zsh:"sh"};
  const nl = (AM[lang]||lang).toLowerCase();
  const kws = KW[nl]||new Set();
  const hc = HC.has(lang)||HC.has(nl);
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  if (nl==="diff") return code.split("\n").map(l => l.startsWith("+")?`<span class="cb-add">${esc(l)}</span>`:l.startsWith("-")?`<span class="cb-del">${esc(l)}</span>`:l.startsWith("@@")?`<span class="cb-chunk">${esc(l)}</span>\n`:esc(l)+"\n").join("").trimEnd();
  let out = "", i = 0;
  while (i<code.length) {
    let c = code[i];
    if (c==="#"&&hc) { let e=code.indexOf("\n",i); if (e===-1) e=code.length; out+=`<span class="cb-cm">${esc(code.slice(i,e))}</span>`; i=e; continue; }
    if (c==="/"&&code[i+1]==="/") { let e=code.indexOf("\n",i); if (e===-1) e=code.length; out+=`<span class="cb-cm">${esc(code.slice(i,e))}</span>`; i=e; continue; }
    if (c==="/"&&code[i+1]==="*") { let e=code.indexOf("*/",i+2); e=e===-1?code.length:e+2; out+=`<span class="cb-cm">${esc(code.slice(i,e))}</span>`; i=e; continue; }
    if (c==='"'||c==="'"||c==="`") { let q=c,e=i+1; while (e<code.length) { if (code[e]==="\\") {e+=2;continue;} if (code[e]==="\n"&&q!=="`") break; if (code[e]===q) {e++;break;} e++; } out+=`<span class="cb-str">${esc(code.slice(i,e))}</span>`; i=e; continue; }
    if (/[0-9]/.test(c)&&(i===0||!/[a-zA-Z_$]/.test(code[i-1]))) { let e=i; while (e<code.length&&/[0-9a-fA-F.xXoObBn_]/.test(code[e])) e++; out+=`<span class="cb-num">${esc(code.slice(i,e))}</span>`; i=e; continue; }
    if (/[a-zA-Z_$]/.test(c)) { let e=i; while (e<code.length&&/[a-zA-Z0-9_$]/.test(code[e])) e++; let w=code.slice(i,e); out+=kws.has(w)?`<span class="cb-kw">${esc(w)}</span>`:esc(w); i=e; continue; }
    out+=esc(c); i++;
  }
  return out;
}
window.MDParse = function(text, custom=(t)=>{return t}) {
  // Reserve
  let reserve = {};
  function reservemd(txt) {
    let id = Math.floor(Math.random()*Math.pow(10, 16)).toString(10).padStart(16, '0');
    reserve[id] = txt;
    return `¬r${id}¬r`;
  }
  // Basic escaping
  text = text
    .replaceAll('<', '~lt;')
    .replaceAll('"', '~quot;');
  // Elements that need reserve
  text = text
    .replaceAll(/```([^¬]|¬)*?```/g, function(match){
      let inner = match.slice(3,-3).replaceAll("~lt;","<").replaceAll("~quot;",'"');
      let lm = inner.match(/^([a-zA-Z0-9+#._-]*)\n/);
      let lang = lm ? lm[1].trim().toLowerCase() : "";
      let code = lang ? inner.slice(lang.length+1) : inner;
      if (code.endsWith("\n")) code = code.slice(0,-1);
      let head = `<div class="cb-header">${lang?`<span class="cb-lang">${lang}</span>`:""}<button class="cb-copy" onclick="window.copyCode(this)">Copy</button></div>`;
      return reservemd(`<div class="code-block">${head}<pre><code>${_hlt(code,lang)}</code></pre></div>`);
    })
    .replaceAll(/\`.+?\`/g, function(match){
      return reservemd('<code>'+match.slice(1,-1).replaceAll('&','&amp;').replaceAll('>','&gt;').replaceAll('~lt;','&lt;').replaceAll('~quot;','&quot;').replaceAll("'",'&apos;')+'</code>');
    })
    .replaceAll(/\[(.+?)\]\((~lt;https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)>|https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))\)/g, function(match,g1,g2){
      if (match.match(/^~lt;.+?>$/m)) match=match.slice(4,-1);
      return reservemd(`<a href="${g2}" target="_blank">${g1}</a>`);
    })
    .replaceAll(/(~lt;https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)>|https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/g, function(match){
      if (match.match(/^~lt;.+?>$/m)) match=match.slice(4,-1);
      return reservemd(`<a href="${match}" target="_blank">${match}</a>`);
    });
// More escaping
  text = text
    .replaceAll('&', '&amp;')
    .replaceAll('>', '&gt;')
    .replaceAll('~lt;', '&lt;')
    .replaceAll('~quot;', '&quot;')
    .replaceAll("'", '&apos;');
  // Custom
  text = custom(text, reservemd);
  // General
  text = text
    .replaceAll(/\*\*.+?\*\*/g, function(match){return '<b>'+match.slice(2,-2)+'</b>'}) // Bold
    .replaceAll(/\*.+?\*/g, function(match){return '<i>'+match.slice(1,-1)+'</i>'}) // Italic 1
    .replaceAll(/\_\_.+?\_\_/g, function(match){return '<u>'+match.slice(2,-2)+'</u>'}) // Underline
    .replaceAll(/\_.+?\_/g, function(match){return '<i>'+match.slice(1,-1)+'</i>'}) // Italic 2
    .replaceAll(/\~\~.+?\~\~/g, function(match){return '<s>'+match.slice(2,-2)+'</s>'}) // Strikethrough
    .replaceAll(/\=\=.+?\=\=/g, function(match){return '<mark>'+match.slice(2,-2)+'</mark>'}) // Highlight
    .replaceAll(/\~.+?\~/g, function(match){return '<sub>'+match.slice(1,-1)+'</sub>'}) // Subscript
    .replaceAll(/\^.+?\^/g, function(match){return '<sup>'+match.slice(1,-1)+'</sup>'}) // Superscript
    .replaceAll(/^&gt; ?(.*)$/gm, (match, content)=>'<blockquote>'+content+'</blockquote>') // Blockquote (> is escaped to &gt; before this runs)
    .replaceAll(/^(-|\*) .+?$/gm, function(match){return '<li>'+match.slice(2)+'</li>'}) // List
    .replaceAll(/^### .+?$/gm, function(match){return '<span style="font-size:110%">'+match.slice(4)+'</span>'}) // 3rd heading
    .replaceAll(/^## .+?$/gm, function(match){return '<span style="font-size:125%">'+match.slice(3)+'</span>'}) // 2nd heading
    .replaceAll(/^# .+?$/gm, function(match){return '<span style="font-size:150%">'+match.slice(2)+'</span>'}) // 1st heading
    .replaceAll(/^-# .+?$/gm, function(match){return '<span style="font-size:80%;color:var(--text-2);">'+match.slice(3)+'</span>'}); // Holt: -1st heading

  // Reserve
  text = text.replaceAll(/¬r[0-9]{16}¬r/g, function(match){
    let id = match.split('¬r')[1];
    if (reserve[id]) {
      return reserve[id];
    } else {
      return match;
    }
  })
  // Return
  return text;
}