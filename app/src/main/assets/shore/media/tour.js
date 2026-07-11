// First-run coachmark tour. Spotlights key parts of the chat UI with a step card.
// Auto-runs once after the first login; can be replayed from the sidebar help button.
const TOUR_DONE_KEY = "holt-tour-v1";
const tourSteps = [
  { title: "tour.welcome.title", body: "tour.welcome.body" },
  { sel: "#channels", title: "tour.channels.title", body: "tour.channels.body", place: "right", pane: "side" },
  { sel: "#channel-add", title: "tour.add.title", body: "tour.add.body", place: "bottom", pane: "side" },
  { sel: "#search", title: "tour.search.title", body: "tour.search.body", place: "bottom", pane: "side" },
  { sel: "#input", title: "tour.composer.title", body: "tour.composer.body", place: "top", pane: "main" },
  { sel: "#user", title: "tour.profile.title", body: "tour.profile.body", place: "bottom", pane: "side" },
  { sel: "#btn-settings", title: "tour.settings.title", body: "tour.settings.body", place: "top", pane: "side" }
];
let tourActive = [];
let tourIndex = 0;
let tourStrings = {};
let tourPrevView = null;
// On mobile, side and main are toggled (only one shows at a time), so reveal the pane a step lives in before spotlighting it.
function tourReveal(step) {
  if (!step.pane||!smallScreen()) return;
  let side = document.querySelector("side"), main = document.querySelector("main"), lat = document.querySelector(".lateral");
  if (!side||!main) return;
  side.style.display = step.pane==="main"?"none":"";
  main.style.display = step.pane==="main"?"":"none";
  if (lat) lat.style.display = "none";
}
async function tourLoadStrings() {
  let keys = ["tour.next", "tour.back", "tour.skip", "tour.done", "tour.step"];
  tourSteps.forEach(s=>{ keys.push(s.title); keys.push(s.body); });
  let pairs = await Promise.all(keys.map(async k=>[k, await getTranslation(k)]));
  pairs.forEach(([k, v])=>tourStrings[k] = v||k);
}
function tourClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function tourPosition() {
  let step = tourActive[tourIndex];
  let overlay = document.getElementById("tour-overlay");
  let spot = document.getElementById("tour-spot");
  let card = document.getElementById("tour-card");
  if (!overlay) return;
  let pad = 6;
  let target = step.sel?document.querySelector(step.sel):null;
  let r = target?target.getBoundingClientRect():null;
  if (target&&r.width>0&&r.height>0) {
    spot.style.display = "block";
    spot.style.top = (r.top-pad)+"px";
    spot.style.left = (r.left-pad)+"px";
    spot.style.width = (r.width+pad*2)+"px";
    spot.style.height = (r.height+pad*2)+"px";
    let cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
    let place = step.place||"bottom";
    let top, left;
    if (place==="top"&&r.top-ch-gap<8) place = "bottom";
    if (place==="bottom"&&r.bottom+ch+gap>window.innerHeight-8) place = "top";
    if (place==="right"&&r.right+cw+gap>window.innerWidth-8) place = "bottom";
    if (place==="left"&&r.left-cw-gap<8) place = "bottom";
    if (place==="top") { top = r.top-ch-gap; left = r.left+r.width/2-cw/2; }
    else if (place==="right") { top = r.top+r.height/2-ch/2; left = r.right+gap; }
    else if (place==="left") { top = r.top+r.height/2-ch/2; left = r.left-cw-gap; }
    else { top = r.bottom+gap; left = r.left+r.width/2-cw/2; }
    card.style.top = tourClamp(top, 8, window.innerHeight-ch-8)+"px";
    card.style.left = tourClamp(left, 8, window.innerWidth-cw-8)+"px";
    card.style.transform = "none";
  } else {
    spot.style.display = "none";
    card.style.top = "50%";
    card.style.left = "50%";
    card.style.transform = "translate(-50%, -50%)";
  }
}
function tourRender() {
  let step = tourActive[tourIndex];
  let card = document.getElementById("tour-card");
  let last = tourIndex===tourActive.length-1;
  let stepLabel = (tourStrings["tour.step"]||"{}/{}").replace("{}", tourIndex+1).replace("{}", tourActive.length);
  card.innerHTML = `<div class="tour-count">${stepLabel}</div>
<div class="tour-title"></div>
<div class="tour-body"></div>
<div class="tour-nav">
  <button class="tour-skip" type="button">${tourStrings["tour.skip"]}</button>
  <div class="tour-right">
    ${tourIndex>0?`<button class="tour-back" type="button">${tourStrings["tour.back"]}</button>`:""}
    <button class="tour-next" type="button">${last?tourStrings["tour.done"]:tourStrings["tour.next"]}</button>
  </div>
</div>`;
  card.querySelector(".tour-title").textContent = tourStrings[step.title];
  card.querySelector(".tour-body").textContent = tourStrings[step.body];
  card.querySelector(".tour-skip").onclick = tourEnd;
  card.querySelector(".tour-next").onclick = ()=>{ if (last) tourEnd(); else { tourIndex++; tourRender(); } };
  let back = card.querySelector(".tour-back");
  if (back) back.onclick = ()=>{ tourIndex--; tourRender(); };
  tourReveal(step);
  tourPosition();
  requestAnimationFrame(tourPosition);
  card.querySelector(".tour-next").focus();
}
function tourKey(e) {
  if (e.key==="Escape") tourEnd();
  else if (e.key==="ArrowRight") document.querySelector("#tour-card .tour-next")?.click();
  else if (e.key==="ArrowLeft") document.querySelector("#tour-card .tour-back")?.click();
}
function tourEnd() {
  localStorage.setItem(TOUR_DONE_KEY, "1");
  document.getElementById("tour-overlay")?.remove();
  window.removeEventListener("resize", tourPosition);
  window.removeEventListener("scroll", tourPosition, true);
  window.removeEventListener("keydown", tourKey);
  if (tourPrevView) {
    let side = document.querySelector("side"), main = document.querySelector("main"), lat = document.querySelector(".lateral");
    if (side) side.style.display = tourPrevView.side;
    if (main) main.style.display = tourPrevView.main;
    if (lat) lat.style.display = tourPrevView.lat;
    tourPrevView = null;
  }
}
async function startTour(force) {
  if (document.getElementById("tour-overlay")) return;
  tourActive = tourSteps.filter(s=>!s.sel||document.querySelector(s.sel));
  if (tourActive.length===0) return;
  tourIndex = 0;
  let side = document.querySelector("side");
  tourPrevView = side?{ side: side.style.display, main: document.querySelector("main")?.style.display, lat: document.querySelector(".lateral")?.style.display } : null;
  await tourLoadStrings();
  let overlay = document.createElement("div");
  overlay.id = "tour-overlay";
  overlay.innerHTML = `<div id="tour-spot"></div><div id="tour-card" role="dialog" aria-modal="true"></div>`;
  document.body.appendChild(overlay);
  window.addEventListener("resize", tourPosition);
  window.addEventListener("scroll", tourPosition, true);
  window.addEventListener("keydown", tourKey);
  tourRender();
}
function maybeStartTour() {
  if (localStorage.getItem(TOUR_DONE_KEY)) return;
  startTour();
}
window.startTour = startTour;
window.maybeStartTour = maybeStartTour;
