/*****************************************************************
 * DATA (da JSON)
 *****************************************************************/
let recipesAll = []; // popolato da fetch

/*****************************************************************
 * LOCALSTORAGE
 *****************************************************************/
const LS_KEY = "eater_state_v1";
const LS_SHOP_KEY = "eater_shop_checked_v1";

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return { likedIds: [], swipeLog: [] };
    const parsed = JSON.parse(raw);
    return {
      likedIds: Array.isArray(parsed.likedIds) ? parsed.likedIds : [],
      swipeLog: Array.isArray(parsed.swipeLog) ? parsed.swipeLog : []
    };
  }catch{
    return { likedIds: [], swipeLog: [] };
  }
}

function saveState(){
  try{
    const state = {
      likedIds: Array.from(likedRecipes.keys()),
      swipeLog
    };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }catch{
    // ignore
  }
}

function loadShopChecked(){
  try{
    const raw = localStorage.getItem(LS_SHOP_KEY);
    if(!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  }catch{
    return {};
  }
}

function saveShopChecked(){
  try{
    localStorage.setItem(LS_SHOP_KEY, JSON.stringify(shopChecked));
  }catch{
    // ignore
  }
}

/*****************************************************************
 * STATE + DOM
 *****************************************************************/
const frame = document.querySelector(".frame");
const sumPriceEl = document.getElementById("sumPrice");
const sumKcalEl = document.getElementById("sumKcal");

const likesModal = document.getElementById("likesModal");
const catsModal  = document.getElementById("catsModal");
const likesList  = document.getElementById("likesList");
const catGrid    = document.getElementById("catGrid");

const recipeModal = document.getElementById("recipeModal");
const recipeModalTitle = document.getElementById("recipeModalTitle");
const recipeModalBody  = document.getElementById("recipeModalBody");

const shopModal = document.getElementById("shopModal");
const shopList  = document.getElementById("shopList");

const navShop  = document.getElementById("navShop");
const navLikes = document.getElementById("navLikes");
const navCats  = document.getElementById("navCats");

const btnLike = document.getElementById("btnLike");
const btnHate = document.getElementById("btnHate");
const btnUndo = document.getElementById("btnUndo");

const categories = ["Tutte", "Colazione", "Spuntino", "Pranzo", "Cena"];
let activeCategory = "Tutte";

// likedRecipes: Map(id -> recipe)
const likedRecipes = new Map();

// shop checked states (persistito): { [itemId]: true/false }
let shopChecked = loadShopChecked();

// swipe log (persistito): {id, action, ts}
let swipeLog = [];

// history stack: { recipe, action, appendedRecipe }
const history = [];

// deck handling
let deck = [];
let imgCount = 0;

// gesture variables
let current = null;
let likeText = null;
let startX = 0, startY = 0, moveX = 0, moveY = 0;

/*****************************************************************
 * HELPERS
 *****************************************************************/
function formatEuro(value){
  const n = Number(value || 0);
  return "~" + n.toFixed(2).replace(".", ",") + " €";
}
function formatKcal(value){
  return Math.round(value || 0) + " kcal";
}
function sumLiked(){
  let totalKcal = 0;
  let totalPrice = 0;
  for(const r of likedRecipes.values()){
    totalKcal += r.kcal;
    totalPrice += r.price;
  }
  sumKcalEl.textContent = formatKcal(totalKcal);
  sumPriceEl.textContent = formatEuro(totalPrice);
}

function openModal(which){
  if(which === "likes"){
    renderLikesList();
    likesModal.classList.add("show");
  }
  if(which === "cats"){
    catsModal.classList.add("show");
  }
  if(which === "shop"){
    renderShopList();
    shopModal.classList.add("show");
  }
}

function closeModalById(id){
  document.getElementById(id).classList.remove("show");
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function recipeById(id){
  return recipesAll.find(r => r.id === id) || null;
}

function normalizeRecipe(r){
  const out = { ...r };

  if(Array.isArray(out.categories)){
    // ok
  } else if(Array.isArray(out.category)){
    out.categories = out.category.slice();
  } else if(typeof out.category === "string"){
    out.categories = [out.category];
  } else {
    out.categories = [];
  }

  if(!out.details) out.details = {};
  delete out.category;

  return out;
}

function getDisplayCategory(recipe){
  if(activeCategory !== "Tutte" && recipe.categories?.includes(activeCategory)) return activeCategory;
  return (recipe.categories && recipe.categories[0]) ? recipe.categories[0] : "—";
}

/*****************************************************************
 * SHOPPING LIST (somma ingredienti + checkbox)
 *****************************************************************/
function normalizeSpaces(s){
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeKeyName(name){
  return normalizeSpaces(name)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,;:()]/g, "")
    .trim();
}

// Prova a estrarre: "Nome ... 250 g" / "Nome 0.5 kg" / "Nome 110g" ecc.
// Se non riesce => non sommabile.
function parseIngredientLine(line){
  const raw = normalizeSpaces(line);
  if(!raw) return null;

  // se contiene "q.b." o "qb" o "quanto basta" => non sommabile
  if(/\bq\.?b\.?\b/i.test(raw) || /quanto\s+basta/i.test(raw)){
    return { raw, summable:false, name: raw, qty:null, unit:null };
  }

  // match numero + unità (unità common)
  // - supporta 1,25 / 1.25
  // - supporta "110g" senza spazio
  const m = raw.match(/^(.*?)(\d+(?:[.,]\d+)?)(?:\s*)(kg|g|gr|mg|l|lt|ml|cl|pcs|pezzi|pz|cad\.?|cucchiai|cucchiaio|cucchiaini|cucchiaino)\b\.?\s*$/i);

  if(!m){
    // fallback: prova a trovare numero+unità in mezzo (es. "Milk Pro 500 ml")
    const m2 = raw.match(/^(.*?)(\d+(?:[.,]\d+)?)(?:\s*)(kg|g|gr|mg|l|lt|ml|cl)\b\.?\s*(.*)$/i);
    if(!m2){
      return { raw, summable:false, name: raw, qty:null, unit:null };
    }
    const before = normalizeSpaces(m2[1]);
    const qty = Number(String(m2[2]).replace(",", "."));
    const unit = normalizeSpaces(m2[3]).toLowerCase();
    const after = normalizeSpaces(m2[4]);
    const name = normalizeSpaces([before, after].filter(Boolean).join(" "));
    if(!name || !Number.isFinite(qty)) return { raw, summable:false, name: raw, qty:null, unit:null };
    return { raw, summable:true, name, qty, unit };
  }

  const name = normalizeSpaces(m[1]);
  const qty = Number(String(m[2]).replace(",", "."));
  const unit = normalizeSpaces(m[3]).toLowerCase();

  if(!name || !Number.isFinite(qty) || !unit){
    return { raw, summable:false, name: raw, qty:null, unit:null };
  }

  return { raw, summable:true, name, qty, unit };
}

function buildShoppingItemsFromLikes(){
  // ritorna array di item:
  // { id, label, sub?, qty?, unit?, raw? }
  const summable = new Map(); // key -> {name, unit, qty}
  const nonSummable = new Map(); // raw -> count

  for(const r of likedRecipes.values()){
    const ingredients = Array.isArray(r.details?.ingredients) ? r.details.ingredients : [];
    for(const line of ingredients){
      const parsed = parseIngredientLine(line);
      if(!parsed) continue;

      if(parsed.summable){
        const key = normalizeKeyName(parsed.name) + "|" + parsed.unit;
        const prev = summable.get(key);
        if(prev){
          prev.qty += parsed.qty;
        }else{
          summable.set(key, { name: parsed.name, unit: parsed.unit, qty: parsed.qty });
        }
      }else{
        const k = parsed.raw;
        nonSummable.set(k, (nonSummable.get(k) || 0) + 1);
      }
    }
  }

  const items = [];

  // summable -> items
  for(const [key, v] of summable.entries()){
    // id stabile per checkbox: "sum|name|unit"
    const id = "sum|" + key;
    items.push({
      id,
      main: `${v.name} ${formatQty(v.qty)} ${v.unit}`.trim(),
      sub: "Somma ingredienti"
    });
  }

  // non-summable -> items
  for(const [raw, count] of nonSummable.entries()){
    const id = "raw|" + normalizeKeyName(raw);
    const main = count > 1 ? `${raw} ×${count}` : raw;
    items.push({
      id,
      main: main,
      sub: "Voce non sommabile"
    });
  }

  // sort: prima summabili per nome, poi raw
  items.sort((a,b)=> a.main.localeCompare(b.main, "it", { sensitivity:"base" }));

  return items;
}

function formatQty(n){
  // se è intero, niente decimali
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  if(isInt) return String(Math.round(n));
  // altrimenti 1 cifra (ma pulita)
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

function renderShopList(){
  const items = buildShoppingItemsFromLikes();

  if(likedRecipes.size === 0){
    shopList.innerHTML = `
      <div style="color:rgba(255,255,255,.75);font-weight:800;line-height:1.4;">
        Metti Like a qualche ricetta per generare la lista spesa 🛒
      </div>
    `;
    return;
  }

  if(items.length === 0){
    shopList.innerHTML = `
      <div style="color:rgba(255,255,255,.75);font-weight:800;line-height:1.4;">
        Nessun ingrediente trovato nelle ricette liked.
      </div>
    `;
    return;
  }

  shopList.innerHTML = "";

  for(const item of items){
    const row = document.createElement("div");
    row.className = "shopItem";
    row.dataset.id = item.id;

    const checked = !!shopChecked[item.id];

    row.innerHTML = `
      <input class="shopCheck" type="checkbox" ${checked ? "checked" : ""} aria-label="Spunta ingrediente" />
      <div class="shopText ${checked ? "shopDone" : ""}">
        <div class="shopMain">${escapeHtml(item.main)}</div>
        <div class="shopSub">${escapeHtml(item.sub || "")}</div>
      </div>
    `;

    const cb = row.querySelector(".shopCheck");
    const textWrap = row.querySelector(".shopText");

    cb.addEventListener("change", ()=>{
      shopChecked[item.id] = cb.checked;
      saveShopChecked();
      if(cb.checked) textWrap.classList.add("shopDone");
      else textWrap.classList.remove("shopDone");
    });

    shopList.appendChild(row);
  }
}

function refreshShopIfOpen(){
  if(shopModal && shopModal.classList.contains("show")){
    renderShopList();
  }
}

/*****************************************************************
 * RECIPE MODAL
 *****************************************************************/
function openRecipeModal(recipe){
  if(!recipe) return;

  const det = recipe.details || {};
  const time = det.time || "—";
  const servings = det.servings || "—";
  const ingredients = Array.isArray(det.ingredients) ? det.ingredients : [];
  const steps = Array.isArray(det.steps) ? det.steps : [];

  recipeModalTitle.textContent = recipe.name.replace(/\n/g, " ");
  recipeModalBody.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:900;font-size:12px;">
        ${escapeHtml(getDisplayCategory(recipe))}
      </div>
      <div style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:900;font-size:12px;">
        ${formatKcal(recipe.kcal)}
      </div>
      <div style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:900;font-size:12px;">
        ${formatEuro(recipe.price)}
      </div>
      <div style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:900;font-size:12px;">
        ${escapeHtml(time)} • ${escapeHtml(servings)}
      </div>
    </div>

    <div style="font-weight:900;margin:10px 0 6px 0;">Ingredienti</div>
    ${
      ingredients.length
        ? `<ul style="margin:0 0 12px 18px;color:rgba(255,255,255,.85);font-weight:800;line-height:1.45;">
             ${ingredients.map(i => `<li>${escapeHtml(i)}</li>`).join("")}
           </ul>`
        : `<div style="color:rgba(255,255,255,.75);font-weight:800;line-height:1.4;margin-bottom:12px;">
             (Ingredienti non presenti nel JSON)
           </div>`
    }

    <div style="font-weight:900;margin:10px 0 6px 0;">Preparazione</div>
    ${
      steps.length
        ? `<ol style="margin:0 0 4px 18px;color:rgba(255,255,255,.85);font-weight:800;line-height:1.45;">
             ${steps.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
           </ol>`
        : `<div style="color:rgba(255,255,255,.75);font-weight:800;line-height:1.4;">
             (Passaggi non presenti nel JSON)
           </div>`
    }
  `;
  recipeModal.classList.add("show");
}

/*****************************************************************
 * Likes list (con delete)
 *****************************************************************/
function removeLikeById(id){
  if(!likedRecipes.has(id)) return;
  likedRecipes.delete(id);
  sumLiked();
  saveState();
  renderLikesList();
  refreshShopIfOpen(); // <--- aggiorna lista spesa
}

function renderLikesList(){
  if(likedRecipes.size === 0){
    likesList.innerHTML = `
      <div style="color:rgba(255,255,255,.75);font-weight:800;line-height:1.4;">
        Nessun like ancora.<br>
        Fai swipe a destra o premi il cuore 💚
      </div>
    `;
    return;
  }

  likesList.innerHTML = "";
  for(const r of likedRecipes.values()){
    const row = document.createElement("div");
    row.className = "likeItem";
    row.dataset.id = r.id;

    row.innerHTML = `
      <div class="thumb" style="background-image:url('${r.image}')"></div>
      <div class="meta">
        <div class="name">${escapeHtml(r.name).replace(/\n/g," ")}</div>
        <div class="sub">
          <span>${escapeHtml(getDisplayCategory(r))}</span>
          <span>•</span>
          <span>${formatKcal(r.kcal)}</span>
          <span>•</span>
          <span>${formatEuro(r.price)}</span>
        </div>
      </div>
      <button class="removeLikeBtn" type="button" aria-label="Rimuovi like" title="Rimuovi like">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/>
        </svg>
      </button>
    `;

    // click riga => apre ricetta
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      const recipe = recipeById(id);
      openRecipeModal(recipe);
    });

    // click X => rimuove like (senza aprire ricetta)
    const removeBtn = row.querySelector(".removeLikeBtn");
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeLikeById(r.id);
    });

    likesList.appendChild(row);
  }
}

function buildCategoryPicker(){
  catGrid.innerHTML = "";
  categories.forEach(cat=>{
    const count = (cat === "Tutte")
      ? recipesAll.length
      : recipesAll.filter(r => (r.categories || []).includes(cat)).length;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "catBtn" + (activeCategory === cat ? " active" : "");
    btn.innerHTML = `
      <span>${cat}</span>
      <span class="badge">${count}</span>
    `;
    btn.addEventListener("click", ()=>{
      activeCategory = cat;
      buildCategoryPicker();
      resetDeck();
      catsModal.classList.remove("show");
    });
    catGrid.appendChild(btn);
  });
}

function filteredRecipes(){
  if(activeCategory === "Tutte") return recipesAll.slice();
  return recipesAll.filter(r => (r.categories || []).includes(activeCategory));
}

/*****************************************************************
 * CARD FACTORY
 *****************************************************************/
function createCardElement(recipe){
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = recipe.id;
  card.style.backgroundImage = `url('${recipe.image}')`;

  const chipLabel = getDisplayCategory(recipe);

  card.innerHTML = `
    <div class="is-like">LIKE</div>
    <div class="bottom">
      <div class="tagline">
        <span class="chip">${escapeHtml(chipLabel)}</span>
      </div>
      <div class="title">${escapeHtml(recipe.name).replace(/\n/g,"<br>")}</div>
      <div class="subtitle">
        <span>${formatKcal(recipe.kcal)}</span>
        <span class="sep">•</span>
        <span>${formatEuro(recipe.price)}</span>
      </div>
      <div class="hintUp" aria-label="Apri ricetta" title="Apri ricetta">
        <svg viewBox="0 0 24 24">
          <path d="M7.41 15.59 12 11l4.59 4.59L18 14.17l-6-6-6 6z"/>
        </svg>
      </div>
    </div>
  `;

  const hint = card.querySelector(".hintUp");
  if(hint){
    hint.addEventListener("pointerdown", (e)=> e.stopPropagation());
    hint.addEventListener("click", (e)=>{
      e.stopPropagation();
      openRecipeModal(recipe);
    });
  }

  return card;
}

/*****************************************************************
 * CARD STACK
 *****************************************************************/
function appendCardBottom(recipe) {
  const firstCard = frame.children[0];
  const newCard = createCardElement(recipe);
  if (firstCard) frame.insertBefore(newCard, firstCard);
  else frame.appendChild(newCard);
  imgCount++;
}

function appendCardTop(recipe){
  const newCard = createCardElement(recipe);
  frame.appendChild(newCard);
  return newCard;
}

function initCard(card) {
  if(!card) return;
  card.addEventListener('pointerdown', onPointerDown);
}

function setTransform(x, y, deg, duration) {
  if(!current) return;
  current.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${deg}deg)`;
  likeText.style.opacity = Math.abs((x / innerWidth * 2.1));
  likeText.className = `is-like ${x > 0 ? 'like' : 'nope'}`;
  if (duration) current.style.transition = `transform ${duration}ms`;
}

function onPointerDown({ clientX, clientY }) {
  startX = clientX;
  startY = clientY;
  current.addEventListener('pointermove', onPointerMove);
  current.addEventListener('pointerup', onPointerUp);
  current.addEventListener('pointerleave', onPointerUp);
}

function onPointerMove({ clientX, clientY }) {
  moveX = clientX - startX;
  moveY = clientY - startY;
  setTransform(moveX, moveY, moveX / innerWidth * 50);
}

function onPointerUp() {
  current.removeEventListener('pointermove', onPointerMove);
  current.removeEventListener('pointerup', onPointerUp);
  current.removeEventListener('pointerleave', onPointerUp);

  if (Math.abs(moveX) > frame.clientWidth / 2) {
    current.removeEventListener('pointerdown', onPointerDown);
    complete(moveX > 0 ? "like" : "hate");
  } else {
    cancel();
  }
}

function cancel() {
  setTransform(0, 0, 0, 110);
  setTimeout(() => {
    if(current) current.style.transition = '';
  }, 110);
}

function getRecipeByCard(card){
  const id = card?.dataset?.id;
  return deck.find(r=>r.id === id) || recipesAll.find(r=>r.id === id);
}

function logSwipe(id, action){
  swipeLog.push({ id, action, ts: Date.now() });
  // tieni la log "leggera"
  if(swipeLog.length > 600) swipeLog = swipeLog.slice(-600);
  saveState();
}

function complete(action) {
  if(!current) return;

  const signX = (moveX === 0 ? (action === "like" ? 1 : -1) : Math.abs(moveX)/moveX);
  const flyX = signX * innerWidth * 1.3;
  const flyY = (moveX === 0 ? 0 : (moveY / moveX) * flyX);
  setTransform(flyX, flyY, flyX / innerWidth * 50, innerWidth);

  const prevCard = current;
  const recipe = getRecipeByCard(prevCard);

  if(action === "like"){
    likedRecipes.set(recipe.id, recipe);
    sumLiked();
    saveState();
    refreshShopIfOpen(); // <--- aggiorna lista spesa
  }

  logSwipe(recipe.id, action);

  const next = current.previousElementSibling;
  if (next) initCard(next);

  current = next;
  likeText = current ? current.children[0] : null;

  const appendedRecipe = deck[imgCount % deck.length];
  appendCardBottom(appendedRecipe);

  history.push({ recipe, action, appendedRecipe });

  setTimeout(() => {
    if(prevCard && prevCard.parentNode === frame){
      frame.removeChild(prevCard);
    }
  }, innerWidth);
}

/*****************************************************************
 * UNDO (non cambia contatori)
 *****************************************************************/
function undo(){
  if(history.length === 0) return;

  const last = history.pop();

  const appendedId = last.appendedRecipe?.id;
  if(appendedId){
    const appendedCard = frame.querySelector(`.card[data-id="${appendedId}"]`);
    if(appendedCard && appendedCard !== current){
      frame.removeChild(appendedCard);
      imgCount = Math.max(0, imgCount - 1);
    }
  }

  const restored = appendCardTop(last.recipe);

  current = restored;
  likeText = current.children[0];
  current.style.transition = '';
  current.style.transform = 'translate3d(0,0,0) rotate(0deg)';
  likeText.style.opacity = 0;

  initCard(current);
}

/*****************************************************************
 * RESET / INIT
 *****************************************************************/
function resetDeck(){
  frame.innerHTML = "";
  imgCount = 0;

  deck = filteredRecipes();
  if(deck.length === 0){
    deck = [{
      id:"empty",
      name:"Nessuna ricetta\nin questa categoria",
      categories: [activeCategory],
      kcal: 0,
      price: 0,
      image:"https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=1200&q=80",
      details: {
        time: "—",
        servings: "—",
        ingredients: [],
        steps: []
      }
    }];
  }

  const prefill = Math.min(4, deck.length);
  for(let i=0;i<prefill;i++){
    appendCardBottom(deck[i]);
  }

  current = frame.querySelector('.card:last-child');
  likeText = current ? current.children[0] : null;
  startX = startY = moveX = moveY = 0;

  if(current) initCard(current);
  history.length = 0;
}

/*****************************************************************
 * LOAD JSON + BOOT
 *****************************************************************/
async function loadRecipes(){
  const res = await fetch("./data/recipes.json", { cache: "no-store" });
  if(!res.ok) throw new Error("Impossibile caricare data/recipes.json");
  const raw = await res.json();
  if(!Array.isArray(raw)) throw new Error("recipes.json deve contenere un array di ricette");
  return raw.map(normalizeRecipe);
}

function restoreLikesFromState(state){
  likedRecipes.clear();
  const idSet = new Set(state.likedIds || []);
  for(const id of idSet){
    const r = recipeById(id);
    if(r) likedRecipes.set(id, r);
  }
  swipeLog = Array.isArray(state.swipeLog) ? state.swipeLog : [];
  sumLiked();
}

async function boot(){
  try{
    recipesAll = await loadRecipes();
  }catch(err){
    console.error(err);
    recipesAll = [];
  }

  // Restore persisted likes after recipes loaded
  const state = loadState();
  restoreLikesFromState(state);

  buildCategoryPicker();
  resetDeck();
}

/*****************************************************************
 * EVENTS
 *****************************************************************/
btnLike.addEventListener("click", ()=>{
  moveX = 1; moveY = 0;
  complete("like");
});
btnHate.addEventListener("click", ()=>{
  moveX = -1; moveY = 0;
  complete("hate");
});
btnUndo.addEventListener("click", undo);

navShop.addEventListener("click", ()=> openModal("shop"));
navLikes.addEventListener("click", ()=> openModal("likes"));
navCats.addEventListener("click", ()=> openModal("cats"));

document.querySelectorAll("[data-close]").forEach(btn=>{
  btn.addEventListener("click", (e)=> closeModalById(e.currentTarget.dataset.close));
});
[likesModal, catsModal, recipeModal, shopModal].forEach(overlay=>{
  overlay.addEventListener("click", (e)=>{
    if(e.target === overlay) overlay.classList.remove("show");
  });
});

/*****************************************************************
 * START
 *****************************************************************/
boot();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}
