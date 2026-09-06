const CATEGORY_META = {
  pengolah_makanan: { label: 'Pengolah Makanan', icon: '🍱' },
  pertanian:         { label: 'Pertanian',         icon: '🌾' },
  kanji_satuan:      { label: 'Kanji Satuan',      icon: '📏' }
};

// Menggabungkan data dari file kelompok flashcard terpisah
// (data-pengolah-makanan.js, data-pertanian.js, data-kanji-satuan.js)

const DEFAULT_CARDS = {
  pengolah_makanan: DEFAULT_CARDS_PENGOLAH_MAKANAN,
  pertanian: DEFAULT_CARDS_PERTANIAN,
  kanji_satuan: DEFAULT_CARDS_KANJI_SATUAN
};

function loadAllCards() {
  const stored = JSON.parse(localStorage.getItem('kanji_cards_v2') || 'null');
  if(stored && typeof stored === 'object') {
    // Pastikan semua kategori ada (jaga-jaga jika kategori baru ditambahkan di kode setelah data lama tersimpan)
    Object.keys(DEFAULT_CARDS).forEach(cat => {
      if(!Array.isArray(stored[cat])) stored[cat] = [...DEFAULT_CARDS[cat]];
    });
    return stored;
  }
  // Migrasi dari format lama (array tunggal tanpa kategori) jika ada
  const legacy = JSON.parse(localStorage.getItem('kanji_cards') || 'null');
  if(Array.isArray(legacy)) {
    return { pengolah_makanan: legacy, pertanian: [...DEFAULT_CARDS_PERTANIAN], kanji_satuan: [...DEFAULT_CARDS_KANJI_SATUAN] };
  }
  return { pengolah_makanan: [...DEFAULT_CARDS_PENGOLAH_MAKANAN], pertanian: [...DEFAULT_CARDS_PERTANIAN], kanji_satuan: [...DEFAULT_CARDS_KANJI_SATUAN] };
}

let allCards = loadAllCards();
let currentCategory = localStorage.getItem('kanji_current_category') || 'pengolah_makanan';
if(!allCards[currentCategory]) currentCategory = Object.keys(allCards)[0];

// "cards" selalu merujuk ke array kartu pada kategori yang sedang aktif
let cards = allCards[currentCategory];

let gameQueue=[], gameIndex=0, gameCorrect=0, gameWrong=0, isRevealed=false;
let wrongCards = []; // ← NEW: track wrong cards
const COLORS = ['var(--red)','var(--orange)','var(--yellow)','var(--green)','var(--blue)','var(--pink)'];

function save() { localStorage.setItem('kanji_cards_v2', JSON.stringify(allCards)); }

function setCategory(cat) {
  if(!allCards[cat] || cat === currentCategory) { 
    if(allCards[cat]) syncCategoryUI();
    return;
  }
  currentCategory = cat;
  cards = allCards[currentCategory];
  localStorage.setItem('kanji_current_category', currentCategory);
  syncCategoryUI();
  // Refresh halaman yang sedang aktif agar menampilkan kartu kategori baru
  const activePage = document.querySelector('.page.active');
  if(activePage && activePage.id === 'page-browse') renderBrowseLazy();
  if(activePage && activePage.id === 'page-game') renderGameStart();
}

function syncCategoryUI() {
  document.querySelectorAll('.cat-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === currentCategory);
  });
}

function renderCategoryTabs(containerId) {
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  wrap.innerHTML = Object.keys(CATEGORY_META).map(cat => {
    const meta = CATEGORY_META[cat];
    const active = cat === currentCategory ? 'active' : '';
    return `<button class="cat-tab ${active}" data-cat="${cat}" onclick="setCategory('${cat}')">${meta.icon} ${meta.label}</button>`;
  }).join('');
}

// ── PAGE NAVIGATION ──
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b,i) => b.classList.toggle('active', ['browse','game'][i]===name));
  if(name==='browse') { renderCategoryTabs('browse-cat-tabs'); renderBrowseLazy(); }
  if(name==='game')   { renderCategoryTabs('game-cat-tabs'); renderGameStart(); }
}

// ── BROWSE — Lazy/chunked render for performance ──
const BROWSE_CHUNK = 40; // render 40 cards at a time
let browseRenderedCount = 0;
let browseSentinel = null;

function renderBrowseLazy() {
  const grid = document.getElementById('flip-grid');
  const empty = document.getElementById('browse-empty');

  if(!cards.length){ grid.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  // Clean up old observer if any
  if(browseSentinel) {
    if(browseObserver) browseObserver.disconnect();
    browseSentinel = null;
  }

  // Reset state
  browseRenderedCount = 0;
  grid.innerHTML = '';

  // Render first chunk immediately (no delay = instant display)
  appendBrowseChunk(grid);

  // If more cards remain, set up intersection observer for infinite scroll
  if(browseRenderedCount < cards.length) {
    setupBrowseObserver(grid);
  }
}

let browseObserver = null;

function appendBrowseChunk(grid) {
  const start = browseRenderedCount;
  const end = Math.min(start + BROWSE_CHUNK, cards.length);
  const fragment = document.createDocumentFragment();

  for(let i = start; i < end; i++) {
    const c = cards[i];
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="flip-card" id="fc-${i}" onclick="toggleFlip(${i})">
        <div class="flip-card-wrap" id="fcw-${i}">
          <div class="flip-front" id="fcf-${i}">
            <div class="fn">#${String(i+1).padStart(2,'0')}</div>
            <div class="fk">${c.kanji}</div>
            <div class="hint">Tap</div>
          </div>
          <div class="flip-back">
            <div class="flip-back-inner">
              <div class="back-furi-wrap">
                <div class="back-label">Furigana</div>
                <div class="back-furi">${c.furigana}</div>
              </div>
              <div class="back-divider"></div>
              <div class="back-mean-wrap">
                <div class="back-label">Arti</div>
                <div class="back-mean">${c.meaning}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    fragment.appendChild(wrapper.firstElementChild);
  }
  grid.appendChild(fragment);
  browseRenderedCount = end;

  // Fix heights after paint
  requestAnimationFrame(() => {
    for(let i = start; i < end; i++) {
      const front = document.getElementById('fcf-'+i);
      const wrap  = document.getElementById('fcw-'+i);
      if(front && wrap){
        const h = Math.max(front.offsetHeight, 90);
        wrap.style.height = h + 'px';
      }
    }
  });
}

function setupBrowseObserver(grid) {
  // Create a sentinel element at the bottom of the grid
  browseSentinel = document.createElement('div');
  browseSentinel.style.height = '1px';
  grid.after(browseSentinel);

  browseObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting && browseRenderedCount < cards.length) {
        appendBrowseChunk(grid);
        if(browseRenderedCount >= cards.length) {
          browseObserver.disconnect();
          if(browseSentinel) browseSentinel.remove();
        }
      }
    });
  }, { rootMargin: '200px' });

  browseObserver.observe(browseSentinel);
}

function toggleFlip(i) { document.getElementById('fc-'+i).classList.toggle('flipped'); }
function flipAll(state) { document.querySelectorAll('.flip-card').forEach(c=>c.classList.toggle('flipped',state)); }

// ── GAME ──
let rangeMode = 'all'; // 'all' | 'range'

function setRangeMode(mode) {
  rangeMode = mode;
  document.getElementById('tab-all').classList.toggle('active', mode==='all');
  document.getElementById('tab-range').classList.toggle('active', mode==='range');
  document.getElementById('range-inputs-wrap').style.display = mode==='range' ? 'block' : 'none';
  updateRangeInfo();
}

function buildQuickRanges() {
  const wrap = document.getElementById('range-quick-wrap');
  if(!wrap) return;
  const total = cards.length;
  if(!total){ wrap.innerHTML=''; return; }
  const presets = [];
  [50,100,150,200,250,300].forEach(n => {
    if(n <= total) presets.push([1, n]);
  });
  if(total > 10) {
    const mid = Math.ceil(total/2);
    presets.push([1, mid]);
    presets.push([mid+1, total]);
  }
  const seen = new Set();
  let html = '';
  presets.forEach(([f,t]) => {
    const key = f+'-'+t;
    if(!seen.has(key) && f<=t){ seen.add(key); html += `<button class="range-quick-btn" onclick="applyQuickRange(${f},${t})">${f}–${t}</button>`; }
  });
  wrap.innerHTML = `<span style="font-size:.7rem;color:var(--muted);margin-right:2px;">Cepat:</span>` + html;
}

function applyQuickRange(from, to) {
  document.getElementById('inp-range-from').value = from;
  document.getElementById('inp-range-to').value = to;
  updateRangeInfo();
}

function getSelectedCards() {
  if(rangeMode === 'all') return cards.map((c,i) => ({...c, _origNum: i+1}));
  const from = parseInt(document.getElementById('inp-range-from').value) || 1;
  const to   = parseInt(document.getElementById('inp-range-to').value)   || cards.length;
  const f = Math.max(1, from) - 1;
  const t = Math.min(cards.length, to);
  return cards.slice(f, t).map((c,i) => ({...c, _origNum: f+i+1}));
}

function updateRangeInfo() {
  const infoRow  = document.getElementById('range-info-row');
  const infoText = document.getElementById('range-info-text');
  if(rangeMode === 'all') {
    infoRow.className = 'range-info-row';
    infoText.textContent = `Semua ${cards.length} kartu akan digunakan`;
    return;
  }
  const sel = getSelectedCards();
  const from = parseInt(document.getElementById('inp-range-from').value) || 1;
  const to   = parseInt(document.getElementById('inp-range-to').value)   || cards.length;
  if(!sel.length || from > to || from < 1) {
    infoRow.className = 'range-info-row warn';
    infoText.textContent = 'Range tidak valid. Periksa kembali angkanya.';
  } else {
    infoRow.className = 'range-info-row';
    infoText.textContent = `${sel.length} kartu dipilih (No. ${Math.max(1,from)} – ${Math.min(cards.length,to)} dari ${cards.length} total)`;
  }
}

function renderGameStart() {
  document.getElementById('game-start-screen').style.display='block';
  document.getElementById('game-play-screen').style.display='none';
  document.getElementById('game-result-screen').style.display='none';
  const note = document.getElementById('game-empty-note');
  note.innerHTML = cards.length
    ? `<div class="shuffle-tag">&#x1F500; ${cards.length} kartu tersedia &middot; diacak otomatis</div>`
    : `<div class="empty-state" style="padding:16px 0;"><div class="e-icon" style="font-size:2rem;">&#x1F4ED;</div><p>Tambahkan kartu dulu!</p></div>`;
  document.getElementById('inp-range-from').value = 1;
  document.getElementById('inp-range-to').value = cards.length || '';
  buildQuickRanges();
  updateRangeInfo();
}

function shuffle(arr){ for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr; }

function startGame() {
  if(!cards.length){ showPage('browse'); return; }
  const selected = getSelectedCards();
  if(!selected.length){
    updateRangeInfo();
    ['inp-range-from','inp-range-to'].forEach(id => {
      const el = document.getElementById(id);
      el.style.borderColor='var(--red)'; el.style.boxShadow='0 0 0 3px rgba(255,61,90,.2)';
      setTimeout(()=>{ el.style.borderColor=''; el.style.boxShadow=''; },600);
    });
    return;
  }
  gameQueue=shuffle(selected); gameIndex=0; gameCorrect=0; gameWrong=0; isRevealed=false;
  wrongCards = []; // ← reset wrong cards list
  document.getElementById('game-start-screen').style.display='none';
  document.getElementById('game-result-screen').style.display='none';
  document.getElementById('game-play-screen').style.display='block';
  updateScore(); loadCard();
}

function syncGameCardHeight() {
  const front = document.querySelector('.game-front');
  const card  = document.getElementById('game-card');
  if(front && card){
    card.style.minHeight = Math.max(front.scrollHeight, 180) + 'px';
  }
}

function loadCard() {
  if(gameIndex >= gameQueue.length){ showResult(); return; }
  isRevealed = false;
  const c = gameQueue[gameIndex];
  const card = document.getElementById('game-card');
  card.classList.remove('revealed','correct-flash','wrong-flash');
  card.style.minHeight = '';

  document.getElementById('g-num').textContent  = `#${String(c._origNum).padStart(2,'0')}`;
  document.getElementById('g-kanji').textContent = c.kanji;
  document.getElementById('g-furi').textContent  = c.furigana;
  document.getElementById('g-mean').textContent  = c.meaning;
  document.getElementById('g-kanji').style.color = COLORS[gameIndex % COLORS.length];
  document.getElementById('g-prog-fill').style.width = (gameIndex/gameQueue.length*100)+'%';
  document.getElementById('g-prog-text').textContent = `Kartu ${gameIndex+1} dari ${gameQueue.length}`;

  const tag = document.getElementById('g-range-tag');
  if(rangeMode === 'range') {
    const from = document.getElementById('inp-range-from').value;
    const to   = document.getElementById('inp-range-to').value;
    tag.textContent = '\uD83C\uDFAF No. ' + from + '\u2013' + to;
  } else {
    tag.innerHTML = '&#x1F500; Acak';
  }

  document.getElementById('g-btns').style.display = 'none';
  document.getElementById('g-judge-btns').style.display = 'none';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById('g-btns').style.display = 'flex';
      document.getElementById('btn-reveal').disabled = false;
    });
  });

  requestAnimationFrame(syncGameCardHeight);
}

function revealCard() {
  if(isRevealed) return;
  isRevealed = true;
  document.getElementById('game-card').classList.add('revealed');
  document.getElementById('g-btns').style.display = 'none';
  document.getElementById('g-judge-btns').style.display = 'flex';
}

function judgeCard(correct) {
  const card = document.getElementById('game-card');

  document.getElementById('g-judge-btns').style.display = 'none';

  if(correct){
    gameCorrect++;
    card.classList.add('correct-flash');
  } else {
    gameWrong++;
    card.classList.add('wrong-flash');
    wrongCards.push(gameQueue[gameIndex]); // ← record wrong card
  }
  updateScore();

  setTimeout(() => {
    card.classList.remove('correct-flash','wrong-flash');
    card.classList.remove('revealed');
    isRevealed = false;

    setTimeout(() => {
      gameIndex++;
      loadCard();
    }, 720);
  }, 500);
}

function updateScore(){
  document.getElementById('g-correct').textContent = gameCorrect;
  document.getElementById('g-wrong').textContent   = gameWrong;
}

function showResult() {
  document.getElementById('game-play-screen').style.display='none';
  document.getElementById('game-result-screen').style.display='block';
  const total=gameQueue.length, pct=Math.round(gameCorrect/total*100);
  let emoji,title,sub;
  if(pct===100){emoji='🏆';title='Sempurna!';sub='Kamu menjawab semua dengan benar!';}
  else if(pct>=80){emoji='🎉';title='Luar Biasa!';sub='Kamu hampir sempurna!';}
  else if(pct>=60){emoji='👍';title='Bagus!';sub='Terus berlatih ya!';}
  else if(pct>=40){emoji='📚';title='Lumayan!';sub='Masih banyak yang perlu dipelajari.';}
  else{emoji='💪';title='Jangan Menyerah!';sub='Latihan membuat sempurna!';}
  document.getElementById('r-emoji').textContent = emoji;
  document.getElementById('r-title').textContent = title;
  document.getElementById('r-sub').textContent   = sub;
  document.getElementById('r-score').textContent = `${gameCorrect}/${total}`;

  let rangeLabel = 'Semua kartu';
  if(rangeMode === 'range') {
    const from = document.getElementById('inp-range-from').value;
    const to   = document.getElementById('inp-range-to').value;
    rangeLabel = `Range No. ${from} \u2013 ${to}`;
  }
  const rp = document.getElementById('r-percent');
  rp.innerHTML = `${pct}% benar &nbsp;&middot;&nbsp; <span style="color:var(--purple)">${rangeLabel}</span>`;

  // ── Render wrong cards section ──
  const wrongSection = document.getElementById('r-wrong-section');
  if(wrongCards.length === 0) {
    wrongSection.innerHTML = `
      <div class="wrong-section-title">
        <span class="wrong-section-icon">✅</span>
        Tidak ada kartu yang salah — sempurna!
      </div>`;
  } else {
    wrongSection.innerHTML = `
      <div class="wrong-section-title">
        <span class="wrong-section-icon">❌</span>
        Kartu yang Salah (${wrongCards.length})
        <span style="font-size:.75rem; font-weight:400; color:var(--muted);">— pelajari lagi ya!</span>
      </div>
      <div class="wrong-cards-grid">
        ${wrongCards.map((c, i) => `
          <div class="wrong-card" style="--wc-accent:${COLORS[i % COLORS.length]}">
            <div class="wrong-card-num">#${String(c._origNum).padStart(2,'0')}</div>
            <div class="wrong-card-kanji" style="color:${COLORS[i % COLORS.length]}">${c.kanji}</div>
            <div class="wrong-card-divider"></div>
            <div class="wrong-card-row">
              <span class="wrong-card-label">Furigana</span>
              <span class="wrong-card-value furi">${c.furigana}</span>
            </div>
            <div class="wrong-card-row">
              <span class="wrong-card-label">Arti</span>
              <span class="wrong-card-value">${c.meaning}</span>
            </div>
          </div>
        `).join('')}
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  // FIX #1: Render browse page on load since it's the default active page
  renderCategoryTabs('browse-cat-tabs');
  renderBrowseLazy();

});
