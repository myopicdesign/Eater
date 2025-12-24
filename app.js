/*****************************************************************
 * DATA (da JSON)
 *****************************************************************/
let recipesAll = []; // popolato da fetch

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

const navLikes = document.getElementById("navLikes");
const navCats  = document.getElementById("navCats");

const btnLike = document.getElementById("btnLike");
const btnHate = document.getElementById("btnHate");
const btnUndo = document.getElementById("btnUndo");

const categories = ["Tutte", "Colazione", "Spuntino", "Pranzo", "Cena"];
let activeCategory = "Tutte";

// likedRecipes: Map(id -> recipe)
const likedRecipes = new Map();

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
  // supporto eventuali vecchi campi:
  // - "category": "Cena" oppure "category": ["Pranzo","Cena"]
  // - nuovo: "categories": [...]
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

  // manteniamo compatibilità interna con il resto dell’app
  // (ma useremo sempre out.categories)
  if(!out.details) out.details = {};

  // ripulisci: non è necessario, ma aiuta coerenza
  delete out.category;

  return out;
}

function getDisplayCategory(recipe){
  // Manteniamo 1 chip come prima (stessa estetica).
  // Se stai filtrando per una categoria specifica e la ricetta la contiene, mostriamo quella.
  if(activeCategory !== "Tutte" && recipe.categories?.includes(activeCategory)) return activeCategory;
  return (recipe.categories && recipe.categories[0]) ? recipe.categories[0] : "—";
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
 * Likes list
 *****************************************************************/
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
    `;

    row.addEventListener("click", () => {
      const id = row.dataset.id;
      const recipe = recipeById(id);
      openRecipeModal(recipe);
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
  }

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

async function boot(){
  try{
    recipesAll = await loadRecipes();
  }catch(err){
    console.error(err);
    // fallback minimale se json mancante/rotto (non cambia UI, evita crash)
    recipesAll = [];
  }

  buildCategoryPicker();
  resetDeck();
  sumLiked();
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

navLikes.addEventListener("click", ()=> openModal("likes"));
navCats.addEventListener("click", ()=> openModal("cats"));

document.querySelectorAll("[data-close]").forEach(btn=>{
  btn.addEventListener("click", (e)=> closeModalById(e.currentTarget.dataset.close));
});
[likesModal, catsModal, recipeModal].forEach(overlay=>{
  overlay.addEventListener("click", (e)=>{
    if(e.target === overlay) overlay.classList.remove("show");
  });
});

/*****************************************************************
 * START
 *****************************************************************/
boot();
