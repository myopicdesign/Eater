/*****************************************************************
 * DATA (mock) – poi lo stacchiamo dal codice e lo carichiamo da JSON/DB
 *****************************************************************/
const recipesAll = [
  {
    id: "gnocchi_sugo",
    name: "Gnocchi di Patate\nal sugo",
    category: "Pranzo",
    kcal: 342,
    price: 3.80,
    image: "https://images.unsplash.com/photo-1600628422019-6c2b43b6909b?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "porridge_banana",
    name: "Porridge\nbanana & latte",
    category: "Colazione",
    kcal: 482,
    price: 0.64,
    image: "https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "pancake_banana",
    name: "Pancake\na banana",
    category: "Colazione",
    kcal: 430,
    price: 0.55,
    image: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "pasta_zucchine",
    name: "Pasta\nzucchine & parmigiano",
    category: "Cena",
    kcal: 610,
    price: 1.10,
    image: "https://images.unsplash.com/photo-1523986371872-9d3ba2e2f5aa?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "frittata_verdure",
    name: "Frittata\ncon verdure",
    category: "Cena",
    kcal: 350,
    price: 0.80,
    image: "https://images.unsplash.com/photo-1617196034796-73c9c7a6a6d6?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "protein_banana",
    name: "Protein Drink\n+ banana",
    category: "Spuntino",
    kcal: 317,
    price: 2.43,
    image: "https://images.unsplash.com/photo-1528731708534-816fe59f90cb?auto=format&fit=crop&w=1200&q=80"
  }
];

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

// gesture variables (from your snippet)
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
    row.innerHTML = `
      <div class="thumb" style="background-image:url('${r.image}')"></div>
      <div class="meta">
        <div class="name">${escapeHtml(r.name).replace(/\n/g," ")}</div>
        <div class="sub">
          <span>${r.category}</span>
          <span>•</span>
          <span>${formatKcal(r.kcal)}</span>
          <span>•</span>
          <span>${formatEuro(r.price)}</span>
        </div>
      </div>
    `;
    likesList.appendChild(row);
  }
}

function buildCategoryPicker(){
  catGrid.innerHTML = "";
  categories.forEach(cat=>{
    const count = (cat === "Tutte")
      ? recipesAll.length
      : recipesAll.filter(r=>r.category === cat).length;

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
  return recipesAll.filter(r=>r.category === activeCategory);
}

/*****************************************************************
 * CARD FACTORY
 *****************************************************************/
function createCardElement(recipe){
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = recipe.id;
  card.style.backgroundImage = `url('${recipe.image}')`;

  // Nota: rimossa la ripetizione kcal/prezzo in alto nella card (richiesta #1)
  card.innerHTML = `
    <div class="is-like">LIKE</div>
    <div class="bottom">
      <div class="tagline">
        <span class="chip">${recipe.category}</span>
      </div>
      <div class="title">${escapeHtml(recipe.name).replace(/\\n/g,"<br>")}</div>
      <div class="subtitle">
        <span>${formatKcal(recipe.kcal)}</span>
        <span class="sep">•</span>
        <span>${formatEuro(recipe.price)}</span>
      </div>
      <div class="hintUp" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7.41 15.59 12 11l4.59 4.59L18 14.17l-6-6-6 6z"/>
        </svg>
      </div>
    </div>
  `;
  return card;
}

/*****************************************************************
 * CARD STACK (gesture logic follows your snippet)
 * appendCardBottom: inserisce la card in basso allo stack (come prima)
 * appendCardTop: inserisce la card in cima allo stack (per Undo)
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
  frame.appendChild(newCard); // last child = top
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

  // fly out
  const signX = (moveX === 0 ? (action === "like" ? 1 : -1) : Math.abs(moveX)/moveX);
  const flyX = signX * innerWidth * 1.3;
  const flyY = (moveX === 0 ? 0 : (moveY / moveX) * flyX);
  setTransform(flyX, flyY, flyX / innerWidth * 50, innerWidth);

  const prevCard = current;
  const recipe = getRecipeByCard(prevCard);

  // Like action updates sums (normal)
  if(action === "like"){
    likedRecipes.set(recipe.id, recipe);
    sumLiked();
  }

  // Move stack
  const next = current.previousElementSibling;
  if (next) initCard(next);

  current = next;
  likeText = current ? current.children[0] : null;

  // Append new card at bottom (flow deck)
  const appendedRecipe = deck[imgCount % deck.length];
  appendCardBottom(appendedRecipe);

  // Store history INCLUDING appendedRecipe so Undo can remove it
  history.push({ recipe, action, appendedRecipe });

  // Remove old card after animation
  setTimeout(() => {
    if(prevCard && prevCard.parentNode === frame){
      frame.removeChild(prevCard);
    }
  }, innerWidth);
}

/*****************************************************************
 * UNDO (richiesta #2)
 * - Riporta indietro la card precedente (undo dello swipe)
 * - NON cambia i contatori in alto (non tocca likedRecipes né sumLiked)
 *****************************************************************/
function undo(){
  if(history.length === 0) return;

  const last = history.pop();

  // 1) Rimuovi la card che era stata aggiunta in basso durante quello swipe
  // (di solito è la prima nello stack, perché appendCardBottom inserisce come first child)
  // Cerchiamo la card con id = appendedRecipe.id e la rimuoviamo (se presente).
  const appendedId = last.appendedRecipe?.id;
  if(appendedId){
    const appendedCard = frame.querySelector(`.card[data-id="${appendedId}"]`);
    // IMPORTANTE: non rimuovere se è l'unica o se per qualche motivo è diventata current
    if(appendedCard && appendedCard !== current){
      frame.removeChild(appendedCard);
      imgCount = Math.max(0, imgCount - 1);
    }
  }

  // 2) Rimetti la card swipata come top card
  const restored = appendCardTop(last.recipe);

  // 3) Imposta come current e reset trasformazioni
  current = restored;
  likeText = current.children[0];
  current.style.transition = '';
  current.style.transform = 'translate3d(0,0,0) rotate(0deg)';
  likeText.style.opacity = 0;

  // 4) Riattiva gesture
  initCard(current);

  // NOTA: contatori invariati (richiesta). Quindi NON facciamo sumLiked() e NON modifichiamo likedRecipes.
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
      category: activeCategory,
      kcal: 0,
      price: 0,
      image:"https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=1200&q=80"
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

  // Reset history when changing category (makes sense)
  history.length = 0;
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
[likesModal, catsModal].forEach(overlay=>{
  overlay.addEventListener("click", (e)=>{
    if(e.target === overlay) overlay.classList.remove("show");
  });
});

/*****************************************************************
 * BOOT
 *****************************************************************/
buildCategoryPicker();
resetDeck();
sumLiked();
