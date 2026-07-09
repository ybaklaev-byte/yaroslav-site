(function () {
  const LOCAL_KEY = "yaroslav-site-local-links-v1";

  function loadLocalLinks() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveLocalLinks(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  }

  function todayStamp() {
    const d = new Date();
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  }

  function renderTicker() {
    const track = document.getElementById("tickerTrack");
    const items = SITE_DATA.ticker || [];
    const html = items.map((t) => `<span class="ticker__item">${escapeHtml(t)}</span>`).join("");
    // duplicate for seamless loop
    track.innerHTML = html + html;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderSections() {
    const grid = document.getElementById("sectionsGrid");
    const local = loadLocalLinks();
    grid.innerHTML = "";

    SITE_DATA.sections.forEach((section, i) => {
      const localItems = local[section.id] || [];
      const card = document.createElement("article");
      card.className = "section-card";
      card.id = section.id;
      card.style.setProperty("--delay", i * 70 + "ms");

      const num = String(i + 1).padStart(2, "0");

      const allItems = [
        ...section.items,
        ...localItems.map((it, li) => ({ ...it, isLocal: true, localIndex: li })),
      ];

      const itemsHtml = allItems.length
        ? allItems
            .map((item) => {
              const isDead = !item.url || item.url === "#";
              const href = isDead ? "#" : escapeHtml(item.url);
              const attrs = isDead
                ? 'class="is-dead" tabindex="-1" aria-disabled="true"'
                : `target="_blank" rel="noopener noreferrer"`;
              const link = `
            <a href="${href}" ${attrs}>
              <span class="link-label">${escapeHtml(item.label)}${item.isLocal ? '<span class="local-tag">локально</span>' : ""}</span>
              ${item.note ? `<span class="link-note">${escapeHtml(item.note)}</span>` : ""}
            </a>`;
              const delBtn = item.isLocal
                ? `<button class="link-del" type="button" title="Удалить" data-section="${escapeHtml(section.id)}" data-index="${item.localIndex}" aria-label="Удалить ссылку">×</button>`
                : "";
              return `<li${item.isLocal ? ' class="has-del"' : ""}>${link}${delBtn}</li>`;
            })
            .join("")
        : `<li class="empty">Пока пусто</li>`;

      card.innerHTML = `
        <div class="section-card__head">
          <h2>${escapeHtml(section.title)}</h2>
          <span class="section-card__num">${num}</span>
        </div>
        ${section.note ? `<p class="section-card__note">${escapeHtml(section.note)}</p>` : ""}
        <ul class="link-list">${itemsHtml}</ul>
      `;

      grid.appendChild(card);
    });
  }

  /* ---------- Quick-add modal ---------- */
  const modal = document.getElementById("quickAddModal");
  const form = document.getElementById("quickAddForm");
  const selEl = document.getElementById("qaSection");
  let lastFocused = null;

  function fillSectionOptions() {
    selEl.innerHTML = SITE_DATA.sections
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)}</option>`)
      .join("");
  }

  function openQuickAdd() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    form.reset();
    document.getElementById("qaLabel").focus();
    document.addEventListener("keydown", onModalKey);
  }

  function closeQuickAdd() {
    modal.hidden = true;
    document.removeEventListener("keydown", onModalKey);
    if (lastFocused) lastFocused.focus();
  }

  function onModalKey(e) {
    if (e.key === "Escape") closeQuickAdd();
  }

  function submitQuickAdd(e) {
    e.preventDefault();
    const sectionId = selEl.value;
    const label = document.getElementById("qaLabel").value.trim();
    const url = document.getElementById("qaUrl").value.trim();
    const note = document.getElementById("qaNote").value.trim();
    if (!sectionId || !label || !url) return;

    const local = loadLocalLinks();
    local[sectionId] = local[sectionId] || [];
    local[sectionId].push({ label, url, note });
    saveLocalLinks(local);
    closeQuickAdd();
    renderSections();
  }

  function deleteLocalLink(sectionId, index) {
    const local = loadLocalLinks();
    if (!local[sectionId]) return;
    local[sectionId].splice(index, 1);
    if (local[sectionId].length === 0) delete local[sectionId];
    saveLocalLinks(local);
    renderSections();
  }

  /* ---------- Theme ---------- */
  const THEME_KEY = "yaroslav-site-theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    if (!saved) {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      saved = prefersLight ? "light" : "dark";
    }
    applyTheme(saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {}
  }

  const CRYPTO_IDS = ["bitcoin", "ethereum", "tether", "ripple", "binancecoin"];
  const CRYPTO_API =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" +
    CRYPTO_IDS.join(",") +
    "&order=market_cap_desc&price_change_percentage=24h";

  function formatPrice(n) {
    if (n >= 1) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  async function fetchCrypto() {
    const row = document.getElementById("marketRow");
    const updated = document.getElementById("marketUpdated");
    try {
      const res = await fetch(CRYPTO_API);
      if (!res.ok) throw new Error("bad response");
      const coins = await res.json();

      row.innerHTML = coins
        .map((c) => {
          const change = c.price_change_percentage_24h;
          const changeClass = change >= 0 ? "up" : "down";
          const changeSign = change >= 0 ? "▲" : "▼";
          return `
          <div class="market__item">
            <span class="market__symbol">${escapeHtml(c.symbol.toUpperCase())}</span>
            <span class="market__price">${formatPrice(c.current_price)}</span>
            <span class="market__change ${changeClass}">${changeSign} ${Math.abs(change).toFixed(2)}%</span>
          </div>`;
        })
        .join("");

      updated.textContent = "обновлено " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      row.innerHTML = `<div class="market__error">Не удалось загрузить курсы (нет сети или лимит запросов API).</div>`;
      updated.textContent = "ошибка загрузки";
    }
  }

  function renderStaticTexts() {
    document.title = SITE_DATA.pageTitle;
    document.getElementById("pageDescription").setAttribute("content", SITE_DATA.pageDescription);
    document.getElementById("siteName").textContent = SITE_DATA.name;
    document.getElementById("tagline").textContent = SITE_DATA.tagline;
    document.getElementById("indexMark").textContent = SITE_DATA.indexMark;
    document.getElementById("marketLabel").textContent = SITE_DATA.marketLabel;
    document.getElementById("quickAddBtn").textContent = SITE_DATA.quickAddButton;
    document.getElementById("footerNote").innerHTML =
      escapeHtml(SITE_DATA.footer.note).replace(/data\.js/g, "<code>data.js</code>");
    document.getElementById("footerQuiet").textContent = SITE_DATA.footer.quiet;
  }

  document.getElementById("todayStamp").textContent = todayStamp();
  initTheme();
  fillSectionOptions();
  renderStaticTexts();
  renderTicker();
  renderSections();
  fetchCrypto();
  setInterval(fetchCrypto, 60000);

  document.getElementById("quickAddBtn").addEventListener("click", openQuickAdd);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  form.addEventListener("submit", submitQuickAdd);

  modal.addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-close")) closeQuickAdd();
  });

  // Delegated handlers on the sections grid: block dead links, handle deletes
  document.getElementById("sectionsGrid").addEventListener("click", (e) => {
    const dead = e.target.closest("a.is-dead");
    if (dead) {
      e.preventDefault();
      return;
    }
    const del = e.target.closest(".link-del");
    if (del) {
      e.preventDefault();
      deleteLocalLink(del.dataset.section, parseInt(del.dataset.index, 10));
    }
  });
})();
