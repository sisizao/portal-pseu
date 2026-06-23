const BOOK_CATALOG = {
  "manual-do-despertar": {
    id: "manual-do-despertar",
    title: "Manual do Despertar",
    subtitle: "Primeira travessia",
    description:
      "Uma leitura de abertura para reconhecer automatismos, atravessar camadas internas e iniciar uma reconstrucao consciente da propria identidade.",
    summary: "O livro abre o portal com foco em consciencia, ruptura de padroes e retorno ao centro.",
    status: "available",
    badge: "Livro liberado",
    progress: 42,
    chapters: 7,
    estimatedTime: "2h 10m",
    coverClass: "cover-awakening",
    route: "manual-do-despertar.html",
    readerHint: "Conteudo simulado preparado para futura leitura real por PDF e capitulos completos.",
    chaptersList: [
      "O chamado silencioso",
      "A queda dos personagens",
      "Presenca contra automatismo",
      "A mente como templo e campo de batalha",
      "Cartografias da atencao",
      "Ruina e reconstrucao",
      "A travessia permanece",
    ],
  },
  "manual-do-lider-estoico": {
    id: "manual-do-lider-estoico",
    title: "Manual do Lider Estoico",
    subtitle: "Dominio, presenca e decisao",
    description:
      "Disciplina, comando emocional e presenca estrategica em tempos de pressao. Uma obra desenhada para liderar sem ruido.",
    summary: "O livro expande a colecao com foco em lideranca, postura e sobriedade estrategica.",
    status: "available",
    badge: "Livro liberado",
    progress: 18,
    chapters: 8,
    estimatedTime: "2h 40m",
    coverClass: "cover-stoic",
    route: "manual-do-lider-estoico.html",
    readerHint: "Estrutura simulada pronta para receber o conteudo real do manual quando ele entrar no portal.",
    chaptersList: [
      "A disciplina antes da estrategia",
      "O silencio que organiza",
      "A mente sob pressao",
      "Dominio emocional",
      "Postura e presenca",
      "Decisao sem ruido",
      "Lideranca em campo aberto",
      "O retorno ao centro",
    ],
  },
  "arquitetura-da-mente": {
    id: "arquitetura-da-mente",
    title: "Arquitetura da Mente",
    subtitle: "Proxima camada",
    description:
      "Um proximo livro reservado para quando a colecao avancar para um territorio ainda mais profundo.",
    summary: "Um espaco bloqueado com tratamento premium para os proximos lancamentos.",
    status: "coming-soon",
    badge: "Em breve",
    progress: 0,
    chapters: 0,
    estimatedTime: "Reservado",
    coverClass: "cover-locked",
    route: "#",
    readerHint: "Esta obra ainda nao foi aberta.",
    chaptersList: [],
  },
  "codigos-da-sombra": {
    id: "codigos-da-sombra",
    title: "Codigos da Sombra",
    subtitle: "Curadoria reservada",
    description:
      "Um futuro volume do portal, mantido em reserva para o proximo ciclo do acervo premium.",
    summary: "Um espaco bloqueado para narrativas mais densas, simbolicas e exclusivas.",
    status: "coming-soon",
    badge: "Em breve",
    progress: 0,
    chapters: 0,
    estimatedTime: "Reservado",
    coverClass: "cover-locked-red",
    route: "#",
    readerHint: "Esta obra permanece em silencio por enquanto.",
    chaptersList: [],
  },
};

const DEFAULT_BOOK_ID = "manual-do-despertar";
const STORAGE_KEYS = {
  states: "pseu.book.states",
  history: "pseu.book.history",
};

function getBookIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("book") || document.body.dataset.bookId || DEFAULT_BOOK_ID;
}

function getBookById(bookId) {
  return BOOK_CATALOG[bookId] || BOOK_CATALOG[DEFAULT_BOOK_ID];
}

function safeReadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
  return true;
}

function getBookStates() {
  return safeReadJSON(STORAGE_KEYS.states, {});
}

function getBookState(bookId) {
  const states = getBookStates();
  return states[bookId] || null;
}

function saveBookState(bookId, patch) {
  const states = getBookStates();
  const next = {
    ...(states[bookId] || {}),
    ...patch,
    updatedAt: Date.now(),
  };
  states[bookId] = next;
  safeWriteJSON(STORAGE_KEYS.states, states);
  return next;
}

function recordReadingHistory(bookId, chapterIndex, progress) {
  const history = safeReadJSON(STORAGE_KEYS.history, []);
  const filtered = Array.isArray(history) ? history.filter((entry) => entry.bookId !== bookId) : [];
  filtered.unshift({
    bookId,
    chapterIndex,
    progress,
    updatedAt: Date.now(),
  });
  safeWriteJSON(STORAGE_KEYS.history, filtered.slice(0, 6));
}

function getRecentHistory() {
  const history = safeReadJSON(STORAGE_KEYS.history, []);
  return Array.isArray(history) ? history : [];
}

function getOverallProgress() {
  const availableBooks = Object.values(BOOK_CATALOG).filter((book) => book.status === "available");
  if (!availableBooks.length) return 0;

  const states = getBookStates();
  const total = availableBooks.reduce((sum, book) => {
    const state = states[book.id];
    return sum + (state && typeof state.progress === "number" ? state.progress : book.progress);
  }, 0);

  return Math.round(total / availableBooks.length);
}

function getAvailableBooks() {
  return Object.values(BOOK_CATALOG).filter((book) => book.status === "available");
}

function formatChapterLabel(index) {
  return `Capitulo ${String(index + 1).padStart(2, "0")}`;
}

function parseEstimatedMinutes(label) {
  if (!label || /reservado/i.test(label)) return 0;

  const hourMatch = label.match(/(\d+)\s*h/i);
  const minuteMatch = label.match(/(\d+)\s*m/i);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  return hours * 60 + minutes;
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "menos de 1 min";
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes} min`;
}

function getBookResume(bookId) {
  const book = getBookById(bookId);
  const state = getBookState(book.id);
  const chaptersCount = Math.max(1, book.chaptersList.length || book.chapters || 1);
  const hasStoredProgress = state && typeof state.progress === "number";
  const progress = book.status === "available" ? (hasStoredProgress ? state.progress : book.progress) : 0;
  const fallbackIndex = Math.max(0, Math.min(chaptersCount - 1, Math.round((progress / 100) * Math.max(chaptersCount - 1, 0))));
  const chapterIndex = state && typeof state.chapterIndex === "number" ? state.chapterIndex : fallbackIndex;

  return {
    book,
    state,
    progress,
    chapterIndex: Math.max(0, Math.min(chaptersCount - 1, chapterIndex)),
  };
}

function getReadingStatusText(progress) {
  if (progress >= 95) return "Leitura quase completa";
  if (progress > 0) return "Leitura em andamento";
  return "Pronto para comecar";
}

function getRemainingText(book, progress) {
  const totalMinutes = parseEstimatedMinutes(book.estimatedTime);
  if (!totalMinutes) return book.estimatedTime;

  const remaining = Math.max(1, Math.round((100 - progress) * totalMinutes / 100));
  return `${formatDuration(remaining)} restantes`;
}

function setText(root, selector, value) {
  root.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function setAttr(root, selector, attr, value) {
  root.querySelectorAll(selector).forEach((node) => {
    node.setAttribute(attr, value);
  });
}

function renderBookPage(root) {
  const resume = getBookResume(root.dataset.bookId || getBookIdFromUrl());
  const { book, progress, chapterIndex } = resume;

  setText(root, "[data-book-title]", book.title);
  setText(root, "[data-book-subtitle]", book.subtitle);
  setText(root, "[data-book-description]", book.description);
  setText(root, "[data-book-summary]", book.summary);
  setText(root, "[data-book-badge]", book.badge);
  setText(root, "[data-book-progress-label]", `${progress}% lido`);
  setText(root, "[data-book-chapters-count]", `${book.chapters} capitulos`);
  setText(root, "[data-book-estimated-time]", book.estimatedTime);
  setText(root, "[data-book-reader-hint]", book.readerHint);
  setText(root, "[data-book-cover-title]", book.title);

  const lastPosition = root.querySelector("[data-book-last-position]");
  if (lastPosition) {
    const storedChapter = resume.state && resume.state.chapterTitle ? resume.state.chapterTitle : formatChapterLabel(chapterIndex).toLowerCase();
    lastPosition.textContent = `Ultima posicao: ${storedChapter}`;
  }

  const cover = root.querySelector("[data-book-cover]");
  if (cover) {
    cover.classList.remove("cover-awakening", "cover-stoic", "cover-locked", "cover-locked-red");
    cover.classList.add(book.coverClass);
  }

  const progressBar = root.querySelector("[data-book-progress-bar]");
  if (progressBar) {
    progressBar.style.width = `${Math.max(progress, 8)}%`;
  }

  const readLink = root.querySelector("[data-book-read-link]");
  if (readLink) {
    if (book.status === "available") {
      readLink.href = `leitor.html?book=${book.id}`;
      readLink.removeAttribute("aria-disabled");
      readLink.classList.remove("is-disabled");
    } else {
      readLink.href = "#";
      readLink.setAttribute("aria-disabled", "true");
      readLink.classList.add("is-disabled");
    }
  }

  const chaptersList = root.querySelector("[data-book-chapters]");
  if (chaptersList) {
    chaptersList.innerHTML = book.chaptersList.length
      ? book.chaptersList
          .map(
            (chapter, index) => `
              <li>
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>${chapter}</strong>
                  <p>Estrutura simulada pronta para a versao real deste livro.</p>
                </div>
              </li>
            `
          )
          .join("")
      : `<li><span>--</span><div><strong>Conteudo reservado</strong><p>Os capitulos deste livro serao ativados em uma fase futura.</p></div></li>`;
  }

  setAttr(root, "[data-book-status]", "data-status", book.status);
}

function renderPDFReader(root) {
  const pdfContainer = root.querySelector("[data-pdf-viewer]");
  if (!pdfContainer) return; // Não há container, renderizar HTML normalmente
  
  // Aqui iria integração com PDF.js
  // Por enquanto, renderizar conteúdo HTML
  renderReaderPage(root);
  
  // Se houver PDF.js disponível, renderizar aqui
  // if (window.pdfjsLib) {
  //   pdfContainer.innerHTML = '<p style="text-align:center; color: var(--muted);">PDF.js será integrado aqui</p>';
  // }
}

function renderReaderPage(root) {
  const book = getBookById(getBookIdFromUrl());
  const resume = getBookResume(book.id);
  const hasSavedState = Boolean(resume.state);
  const bookTitleNodes = root.querySelectorAll("[data-reader-book-title]");
  const subtitleNodes = root.querySelectorAll("[data-reader-book-subtitle]");
  const introNodes = root.querySelectorAll("[data-reader-intro]");
  const hintNodes = root.querySelectorAll("[data-reader-hint]");
  const chapterCountNodes = root.querySelectorAll("[data-reader-book-chapters]");
  const progressBar = root.querySelector("[data-reader-progress-bar]");
  const progressLabel = root.querySelector("[data-reader-progress-label]");
  const chapterNav = root.querySelector("[data-reader-chapter-nav]");
  const chapterWrap = root.querySelector("[data-reader-chapters]");
  const closeLink = root.querySelector("[data-reader-close-link]");
  const markerToggle = root.querySelector("[data-marker-toggle]");
  const markerState = root.querySelector("[data-marker-state]");
  let activeChapterIndex = -1;

  bookTitleNodes.forEach((node) => {
    node.textContent = book.title;
  });
  subtitleNodes.forEach((node) => {
    node.textContent = book.subtitle;
  });
  introNodes.forEach((node) => {
    node.textContent = book.description;
  });
  hintNodes.forEach((node) => {
    node.textContent = book.readerHint;
  });
  chapterCountNodes.forEach((node) => {
    node.textContent = `${book.chapters} capitulos`;
  });

  if (progressBar) {
    progressBar.style.width = `${Math.max(resume.progress, 8)}%`;
  }
  if (progressLabel) {
    progressLabel.textContent = `${resume.progress}% lido`;
  }
  if (closeLink) {
    closeLink.href = book.route === "#" ? "biblioteca.html" : book.route;
  }

  if (chapterNav) {
    chapterNav.innerHTML = book.chaptersList
      .map(
        (chapter, index) => `
      <a class="${index === 0 ? "active" : ""}" href="#capitulo-${index + 1}">
            ${String(index + 1).padStart(2, "0")} ${chapter}
          </a>
        `
      )
      .join("");
  }

  if (chapterWrap) {
    chapterWrap.innerHTML = book.chaptersList
      .map(
        (chapter, index) => `
          <section id="capitulo-${index + 1}" class="reader-chapter">
            <h2>${chapter}</h2>
            <p>
              Trecho simulado do capitulo ${String(index + 1).padStart(2, "0")} de ${book.title}.
              A estrutura real podera ser conectada aqui depois, sem alterar a interface.
            </p>
            <p>
              Esta camada ja organiza leitura, marcador, progresso e navegacao entre capitulos
              como se o conteudo final estivesse pronto para entrar.
            </p>
          </section>
        `
      )
      .join("");
  }

  const chapterLinks = Array.from(root.querySelectorAll(".reader-chapter-nav a"));
  const chapters = Array.from(root.querySelectorAll(".reader-chapter"));

  const setChapterActive = (index, options = {}) => {
    const { persist = true, progressOverride = null } = options;
    if (index < 0 || index >= chapters.length || index === activeChapterIndex) return;

    activeChapterIndex = index;
    const progress = progressOverride !== null ? progressOverride : Math.max(0, Math.round(((index + 1) / chapters.length) * 100));

    chapterLinks.forEach((link, linkIndex) => {
      const isActive = linkIndex === index;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    if (progressBar && chapters.length) {
      progressBar.style.width = `${progress}%`;
      if (progressLabel) {
        progressLabel.textContent = `${progress}% lido`;
      }
    }

    if (persist) {
      saveBookState(book.id, {
        progress,
        chapterIndex: index,
        chapterTitle: book.chaptersList[index] || book.title,
      });
      recordReadingHistory(book.id, index, progress);
    }
  };

  if (chapters.length) {
    const startIndex = Math.max(0, Math.min(chapters.length - 1, resume.chapterIndex));
    setChapterActive(startIndex, {
      persist: !hasSavedState,
      progressOverride: hasSavedState ? resume.progress : null,
    });

    const startChapter = chapters[startIndex];
    if (startChapter) {
      window.setTimeout(() => {
        startChapter.scrollIntoView({ behavior: "auto", block: "start" });
      }, 60);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        const index = chapters.indexOf(visible.target);
        if (index >= 0) setChapterActive(index);
      },
      {
        root: null,
        rootMargin: "-18% 0px -60% 0px",
        threshold: [0.15, 0.3, 0.55, 0.8],
      }
    );

    chapters.forEach((chapter) => observer.observe(chapter));

    chapterLinks.forEach((link, index) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const target = chapters[index];
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  if (markerToggle && markerState) {
    let marked = false;
    markerToggle.addEventListener("click", () => {
      marked = !marked;
      markerState.textContent = marked ? "Pagina marcada" : "Sem marca ativa";
      markerState.classList.toggle("is-marked", marked);
      markerToggle.textContent = marked ? "Desmarcar pagina" : "Marcar pagina";
    });
  }

  if (!hasSavedState && chapters.length) {
    saveBookState(book.id, {
      progress: resume.progress,
      chapterIndex: resume.chapterIndex,
      chapterTitle: book.chaptersList[resume.chapterIndex] || book.title,
    });
  }
}

function renderDashboardPage(root) {
  const availableBooks = getAvailableBooks();
  const states = getBookStates();
  const history = getRecentHistory();
  const dashboardCards = Array.from(root.querySelectorAll("[data-history-slot]"));

  const overall = getOverallProgress();
  setText(root, "[data-overall-progress]", `${overall}%`);
  setText(root, "[data-overall-progress-label]", availableBooks.length > 1 ? "ecosistema ativo" : "jornada inicial");

  const recentEntries = history
    .map((entry) => {
      const book = getBookById(entry.bookId);
      return {
        ...entry,
        book,
      };
    })
    .filter((entry) => entry.book.status === "available");

  const sortedBooks = [...availableBooks].sort((a, b) => {
    const stateA = states[a.id];
    const stateB = states[b.id];
    const scoreA = (stateA && typeof stateA.updatedAt === "number" ? stateA.updatedAt : 0) + (stateA && typeof stateA.progress === "number" ? stateA.progress : a.progress);
    const scoreB = (stateB && typeof stateB.updatedAt === "number" ? stateB.updatedAt : 0) + (stateB && typeof stateB.progress === "number" ? stateB.progress : b.progress);
    return scoreB - scoreA;
  });

  const featured = recentEntries[0] || sortedBooks[0] || getBookById(DEFAULT_BOOK_ID);
  const featuredState = states[featured.id] || {};
  const featuredProgress = typeof featuredState.progress === "number" ? featuredState.progress : featured.progress;
  const featuredIndex = typeof featuredState.chapterIndex === "number" ? featuredState.chapterIndex : 0;
  const featuredChapter = featured.chaptersList[featuredIndex] || formatChapterLabel(featuredIndex);

  setText(root, "[data-continue-status]", featuredProgress > 0 ? "Retomada recente" : "Disponivel agora");
  setText(root, "[data-continue-title]", featured.title);
  setText(root, "[data-continue-description]", featured.description);
  setText(root, "[data-continue-state]", `${getReadingStatusText(featuredProgress)} - ${featuredChapter}`);
  setText(root, "[data-continue-remaining]", getRemainingText(featured, featuredProgress));
  setText(root, "[data-continue-chapters]", `${featured.chapters} capitulos`);
  setText(root, "[data-continue-progress]", `${featuredProgress}% lido`);

  const continueLink = root.querySelector("[data-continue-link]");
  if (continueLink) {
    continueLink.href = `leitor.html?book=${featured.id}`;
  }

  const readerLink = root.querySelector("[data-continue-reader-link]");
  if (readerLink) {
    readerLink.href = `leitor.html?book=${featured.id}`;
  }

  const continueBookLink = root.querySelector("[data-continue-book-link]");
  if (continueBookLink) {
    continueBookLink.href = featured.route;
  }

  const continueCover = root.querySelector(".continue-feature .book-cover span");
  if (continueCover) {
    continueCover.textContent = featured.title;
  }

  const historyFallbacks = [
    featured,
    sortedBooks.find((book) => book.id !== featured.id) || getBookById("manual-do-lider-estoico"),
    getBookById("arquitetura-da-mente"),
  ];

  dashboardCards.forEach((card, index) => {
    const entry = recentEntries[index] || null;
    const book = entry ? entry.book : historyFallbacks[index] || featured;
    const state = states[book.id] || {};
    const progress = typeof state.progress === "number" ? state.progress : book.progress;
    const chapterIndex = typeof state.chapterIndex === "number" ? state.chapterIndex : Math.max(0, Math.round((progress / 100) * Math.max((book.chaptersList.length || 1) - 1, 0)));
    const chapterLabel = state.chapterTitle || book.chaptersList[chapterIndex] || formatChapterLabel(chapterIndex);
    const statusNode = card.querySelector("[data-history-status]");
    const titleNode = card.querySelector("[data-history-title]");
    const copyNode = card.querySelector("[data-history-copy]");

    if (statusNode) {
      statusNode.textContent = book.status === "available" ? (progress > 0 ? "Retomada recente" : "Leitura aberta") : "Biblioteca";
      statusNode.classList.toggle("available", book.status === "available");
      statusNode.classList.toggle("locked-status", book.status !== "available");
    }

    if (titleNode) {
      titleNode.textContent = book.title;
    }

    if (copyNode) {
      copyNode.textContent = book.status === "available"
        ? `${chapterLabel}, ${progress}% salvo. O portal manteve a posicao sem quebrar a imersao.`
        : "Entrada reservada para um proximo ciclo do acervo premium.";
    }
  });

  const libraryAvailable = root.querySelector("[data-library-available-count]");
  const librarySoon = root.querySelector("[data-library-soon-count]");
  const libraryProgress = root.querySelector("[data-library-progress-summary]");
  if (libraryAvailable) {
    libraryAvailable.textContent = `${availableBooks.length} livros liberados`;
  }
  if (librarySoon) {
    const comingSoon = Object.values(BOOK_CATALOG).filter((book) => book.status !== "available").length;
    librarySoon.textContent = `${comingSoon} em breve`;
  }
  if (libraryProgress) {
    libraryProgress.textContent = `${overall}% media de leitura`;
  }
}

function renderLibraryPage(root) {
  const states = getBookStates();
  const availableBooks = getAvailableBooks();
  const comingSoonBooks = Object.values(BOOK_CATALOG).filter((book) => book.status !== "available");
  const totalProgress = getOverallProgress();

  setText(root, "[data-library-available-count]", `${availableBooks.length} livros liberados`);
  setText(root, "[data-library-soon-count]", `${comingSoonBooks.length} em breve`);
  setText(root, "[data-library-progress-summary]", `${totalProgress}% media de leitura`);

  root.querySelectorAll("[data-book-card-id]").forEach((card) => {
    const book = BOOK_CATALOG[card.dataset.bookCardId];
    if (!book) return;

    const state = states[book.id] || {};
    const progress = book.status === "available" ? (typeof state.progress === "number" ? state.progress : book.progress) : 0;
    const chapterIndex = typeof state.chapterIndex === "number" ? state.chapterIndex : Math.max(0, Math.round((progress / 100) * Math.max((book.chaptersList.length || 1) - 1, 0)));

    const statusNode = card.querySelector(".status");
    const progressBar = card.querySelector("[data-book-card-progress-bar]");
    const progressText = card.querySelector("[data-book-card-progress]");
    const positionText = card.querySelector("[data-book-card-position]");
    const action = card.querySelector(".button");

    if (statusNode) {
      if (book.status === "available") {
        statusNode.textContent = progress > 0 ? "Retomada recente" : "Liberado";
        statusNode.classList.add("available");
        statusNode.classList.remove("locked-status");
      } else {
        statusNode.textContent = "Em breve";
        statusNode.classList.remove("available");
        statusNode.classList.add("locked-status");
      }
    }

    if (progressBar) {
      progressBar.style.width = `${Math.max(progress, 8)}%`;
    }
    if (progressText) {
      progressText.textContent = `${progress}%`;
    }
    if (positionText) {
      positionText.textContent = book.status === "available" ? (state.chapterTitle || formatChapterLabel(chapterIndex)) : "Entrada reservada";
    }
    if (action) {
      if (book.status === "available") {
        action.textContent = progress > 0 ? "Retomar" : "Ler agora";
        if ("href" in action) {
          action.href = book.route;
        }
        action.removeAttribute("disabled");
        action.classList.remove("is-disabled");
      } else {
        action.textContent = "Bloqueado";
        if ("href" in action) {
          action.href = "#";
        }
        action.setAttribute("disabled", "true");
        action.classList.add("is-disabled");
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-ready");

  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const isBookPage = currentPage.startsWith("manual-do-");

  document.querySelectorAll(".nav-links a, .topbar .button[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPage || (isBookPage && href === "livro.html")) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });

  document.querySelectorAll("button[disabled]").forEach((button) => {
    button.setAttribute("title", "Conteudo preparado para liberacao futura");
  });

  const portalPage = document.querySelector(".portal-page");
  if (!portalPage) return;

  const revealTargets = portalPage.querySelectorAll(
    ".cinematic-panel, .cinematic-card, .book-tile, .continue-feature, .continue-side, .book-stat-card"
  );

  revealTargets.forEach((element, index) => {
    element.style.setProperty("--enter-delay", `${Math.min(index * 45, 360)}ms`);
  });

  const motionLayers = Array.from(document.querySelectorAll(".page-haze, .portal-scene-ring, .portal-scene-core, .portal-scene-glow, .entry-portal-ring, .entry-portal-core"));
  let rafId = 0;

  window.addEventListener("mousemove", (event) => {
    if (rafId) return;

    rafId = window.requestAnimationFrame(() => {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;

      motionLayers.forEach((layer, index) => {
        const depth = (index + 1) * 0.65;
        layer.style.transform = `translate3d(${x * depth * 1.6}px, ${y * depth * 1.1}px, 0)`;
      });

      rafId = 0;
    });
  });

  portalPage.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;

    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") return;
      event.preventDefault();

      document.body.classList.remove("is-ready");
      window.setTimeout(() => {
        window.location.href = href;
      }, 220);
    });
  });

  const bookPage = document.querySelector("[data-book-page]");
  if (bookPage) {
    renderBookPage(bookPage);
  }

  const dashboardPage = document.querySelector("[data-dashboard-page]");
  if (dashboardPage) {
    renderDashboardPage(dashboardPage);
  }

  const libraryPage = document.querySelector("[data-library-page]");
  if (libraryPage) {
    renderLibraryPage(libraryPage);
  }

  const readerPage = document.querySelector(".reader-page");
  if (readerPage) {
    renderPDFReader(readerPage);
  }
});
