(() => {
  'use strict';
  const T = window.PythonTasks;
  const C = window.PythonCore;
  const P = window.PySandbox;
  const $ = (selector) => document.querySelector(selector);
  const STORAGE_KEY = `python7:v1:${location.pathname.replace(/index\.html$/, '').replace(/\/$/, '')}`;
  const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paths = {
    types: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><circle cx="17.5" cy="17.5" r="3.5"/>',
    code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 20"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
    audio: '<path d="M3 10v4M7 6v12M12 3v18M17 7v10M21 10v4"/>',
    transfer: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    flag: '<path d="M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.image}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

  let session = null;
  let questions = [];
  let active = false;
  let tickHandle = null;
  let storageAvailable = true;
  let lockAvailable = false;
  let toastHandle;
  let fullScreenWasActive = false;
  let suppressFocusUntil = 0;
  let warnedMinute = false;
  let warnedFiveMinutes = false;
  let currentFilter = 'all';
  let wallStart = Date.now();
  let perfStart = performance.now();
  const now = () => Math.max(Date.now(), wallStart + performance.now() - perfStart, session?.lastSeenAt || 0);
  const durationText = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const dateText = (time) => new Date(time).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  const answered = () => session.answers.filter((a,i) => T.isAnswered(questions[i],a)).length;
  const activityCount = (type) => session.events.filter(event => event.type === type).length;
  function toast(message) {
    clearTimeout(toastHandle);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastHandle = setTimeout(() => { $('#toast').hidden = true; }, 5500);
  }
  function announce(message) { $('#announcer').textContent = message; }
  function persist() {
    if (!session) return;
    session.lastSeenAt = now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); }
    catch {
      if (storageAvailable) toast('Браузер запретил сохранение. Не закрывайте страницу до завершения работы.');
      storageAvailable = false;
      $('#save-status').textContent = 'Автосохранение недоступно. Не закрывайте эту страницу.';
    }
  }
  function loadSession() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const value = JSON.parse(stored);
      if (C.validateSession(value)) {
        session = value;
        wallStart = Math.max(Date.now(), value.lastSeenAt);
        perfStart = performance.now();
      } else toast('Сохранённая работа несовместима с этой версией. Можно начать новую.');
    } catch { storageAvailable = false; }
  }
  function showScreen(name) {
    for (const screen of ['home', 'exam', 'results']) $(`#${screen}-screen`).hidden = screen !== name;
    $('#home-header').hidden = name !== 'home';
    $('#exam-header').hidden = name !== 'exam';
    $('#result-header').hidden = name !== 'results';
    document.title = name === 'exam' ? 'Практика Python — Код с нуля' : name === 'results' ? 'Результат — Код с нуля' : 'Код с нуля — Python, 7 класс';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function prefill() {
    if (!session) return;
    $('#first-name').value = session.profile.firstName;
    $('#last-name').value = session.profile.lastName;
    $('#class-name').value = session.profile.className;
    $('#question-count').value = session.count;
    $('#duration').value = session.minutes;
  }
  function home() {
    active = false;
    clearInterval(tickHandle);
    prefill();
    showScreen('home');
    $('#resume-banner').hidden = !session;
    if (!session) return;
    const finished = session.finishedAt !== null;
    $('#resume-title').textContent = finished ? 'Последняя работа сохранена' : 'Есть незавершённая работа';
    $('#resume-description').textContent = `${session.profile.firstName} ${session.profile.lastName} · ${session.profile.className} · ${dateText(session.startedAt)}${finished ? '' : ' · Таймер продолжает идти'}`;
    $('#resume-button').textContent = finished ? 'Посмотреть результат' : 'Продолжить';
  }
  function dialog(title, body, actions) {
    const element = $('#app-dialog');
    if (element.open) element.close();
    $('#dialog-content').innerHTML = `<button type="button" class="dialog-close" aria-label="Закрыть">×</button><h2 id="dialog-title">${escape(title)}</h2>${body}<div class="button-row">${actions.map((action, i) => `<button type="button" class="button ${action.kind || 'outline'}" data-dialog-action="${i}">${escape(action.label)}</button>`).join('')}</div>`;
    $('.dialog-close').onclick = () => element.close();
    actions.forEach((action, i) => {
      $(`[data-dialog-action="${i}"]`).onclick = () => { element.close(); action.run?.(); };
    });
    element.showModal();
  }
  $('#help-button').addEventListener('click', () => dialog('Один шаг ближе к баллу', `
    <ol><li><strong>Представься.</strong> Укажи имя, фамилию и класс, выбери количество задач и время.</li><li><strong>Решай в любом порядке.</strong> Ответ сохраняется при вводе. Отмечай сложные задания флажком и возвращайся к ним позже.</li><li><strong>Следи за временем.</strong> Когда оно закончится, работа завершится автоматически. Перезагрузка не сбрасывает таймер.</li><li><strong>Посмотри результат.</strong> Получишь оценку, разбор каждого решения и отчёт для скачивания.</li></ol>
    <div class="dialog-note"><p>Фиксируются потеря фокуса, скрытие страницы и выход из полного экрана. Браузер не сообщает, какую вкладку ты открыл. Эти события не снижают оценку автоматически.</p></div>
    <p>Авторские задания по основам Python 3 для 7 класса ИТ-вертикали. Выбирай ответ, определяй вывод, сопоставляй пары и изменяй строки кода. За каждое задание — один балл; в сопоставлении нужны все верные пары. Все результаты хранятся только в этом браузере.</p>`, [{ label: 'Всё понятно', kind: 'primary' }]));

  const fullscreenSupported = Boolean(document.documentElement.requestFullscreen && document.fullscreenEnabled);
  if (!fullscreenSupported) {
    $('#fullscreen-setting').checked = false;
    $('#fullscreen-setting').disabled = true;
    $('#fullscreen-support').textContent = 'Этот браузер не поддерживает полный экран';
    $('#fullscreen-button').hidden = true;
  }
  function requestFullScreen() {
    if (!fullscreenSupported) return;
    suppressFocusUntil = Date.now() + 1200;
    try {
      const request = document.documentElement.requestFullscreen();
      request?.catch(() => toast('Полный экран недоступен. Продолжайте работу в окне браузера.'));
    } catch { toast('Не удалось включить полный экран. Работа продолжается в обычном режиме.'); }
  }
  $('#fullscreen-button').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else requestFullScreen();
  });
  document.addEventListener('fullscreenchange', () => {
    const isFullScreen = Boolean(document.fullscreenElement);
    $('#fullscreen-button-label').textContent = isFullScreen ? 'Выйти из полного экрана' : 'Во весь экран';
    if (active && fullScreenWasActive && !isFullScreen) {
      session.events.push({ type: 'fullscreen-exit', at: now() });
      persist();
      toast('Выход из полноэкранного режима отмечен в отчёте.');
    }
    if (active && isFullScreen) { session.fullscreenUsed = true; persist(); }
    fullScreenWasActive = isFullScreen;
  });

  $('#start-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!lockAvailable) return toast('Тренажёр уже открыт в другой вкладке. Продолжите работу там.');
    if (session && session.finishedAt === null) return dialog('Сначала заверши текущую работу', '<p>Таймер уже запущен. Продолжи сохранённую работу или удали её с помощью кнопки над формой.</p>', [{ label: 'Продолжить работу', kind: 'primary', run: resume }]);
    const form = new FormData(event.currentTarget);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    try {
      session = C.createSession({ firstName: form.get('firstName'), lastName: form.get('lastName'), className: form.get('className') }, Number(form.get('count')), Number(form.get('minutes')), seed);
    } catch (error) {
      $('#form-error').textContent = error.message;
      $('#form-error').hidden = false;
      return;
    }
    $('#form-error').hidden = true;
    session.fullscreenSupported = fullscreenSupported;
    session.fullscreenUsed = false;
    wallStart = Date.now();
    perfStart = performance.now();
    persist();
    startExam();
    if ($('#fullscreen-setting').checked) requestFullScreen();
  });
  function startExam() {
    if (C.remainingMs(session, now()) <= 0) { complete('timeout'); return; }
    active = true;
    warnedMinute = false;
    warnedFiveMinutes = false;
    questions = T.generateQuestions(session.count, session.seed);
    $('#header-person').textContent = `${session.profile.firstName} ${session.profile.lastName} · ${session.profile.className}`;
    showScreen('exam');
    renderQuestion();
    updateNav();
    updateMonitor();
    clearInterval(tickHandle);
    tick();
    tickHandle = setInterval(tick, 250);
    if (!storageAvailable) $('#save-status').textContent = 'Автосохранение недоступно. Не закрывайте эту страницу.';
    announce('Тренировка началась. Таймер запущен.');
  }
  function resume() {
    if (!session || !lockAvailable) return;
    if (session.finishedAt !== null) return renderResults();
    C.endAway(session, now());
    persist();
    startExam();
  }
  $('#resume-button').addEventListener('click', resume);
  $('#discard-button').addEventListener('click', () => dialog('Удалить сохранённую работу?', '<p>Ответы, результат и журнал этой работы будут удалены из браузера. После этого можно начать новый вариант.</p>', [
    { label: 'Оставить' },
    { label: 'Удалить', kind: 'danger', run: () => {
      session = null;
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* In-memory mode. */ }
      $('#start-form').reset();
      if (!fullscreenSupported) $('#fullscreen-setting').checked = false;
      home();
      toast('Сохранённая работа удалена.');
    } },
  ]));
  $('#brand-link').addEventListener('click', (event) => {
    event.preventDefault();
    if (active) toast('Работа продолжается. Для выхода сначала завершите её.');
    else home();
  });
  function tick() {
    if (!active) return;
    const remaining = C.remainingMs(session, now());
    if (remaining <= 0) { complete('timeout'); return; }
    const totalSeconds = Math.ceil(remaining / 1000);
    $('#timer').textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    $('#timer').classList.toggle('urgent', remaining <= 60000);
    $('#timer-bar').style.width = `${remaining / (session.minutes * 60000) * 100}%`;
    $('#timer-hint').textContent = remaining <= 60000 ? 'Минута на последние ответы.' : remaining <= 300000 ? 'Проверь задания без ответа.' : 'Хороший темп — твой темп.';
    if (remaining <= 300000 && !warnedFiveMinutes) { warnedFiveMinutes = true; announce('Осталось меньше пяти минут.'); toast('Осталось 5 минут. Проверьте задания без ответа.'); }
    if (remaining <= 60000 && !warnedMinute) { warnedMinute = true; announce('Осталась одна минута.'); toast('Осталась 1 минута. Работа завершится автоматически.'); }
    if (now() - session.lastSeenAt >= 5000) persist();
  }
  function updateNav() {
    $('#answered-count').textContent = `${answered()} / ${session.count}`;
    $('#question-nav').innerHTML = session.answers.map((answer, i) => {
      const hasAnswer = T.isAnswered(questions[i],answer);
      return `<button type="button" class="nav-question${hasAnswer ? ' answered' : ''}${i === session.current ? ' current' : ''}${session.flags[i] ? ' flagged' : ''}" data-question="${i}" ${i === session.current ? 'aria-current="step"' : ''} aria-label="Задание ${i + 1}${hasAnswer ? ', есть ответ' : ', без ответа'}${session.flags[i] ? ', отмечено на потом' : ''}">${i + 1}</button>`;
    }).join('');
    document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => navigate(Number(button.dataset.question))));
  }
  function programBlock(q, edit = null) {
    if (!q.code) return '';
    return `<div class="program-box"><div class="program-toolbar"><span><i></i><i></i><i></i></span><span>main.py · Python 3</span></div><pre class="program-code" aria-label="Код программы">${q.code.map((line,i) => `<span class="code-line${q.kind === 'code' && i === q.editLine ? ' editable-line' : ''}"><span class="code-number" aria-hidden="true">${i+1}</span><code>${escape(edit !== null && i === q.editLine ? edit : line)}</code></span>`).join('')}</pre></div>`;
  }
  function answerFields(q,value) {
    if (q.kind === 'choice') return `<fieldset class="choices"><legend class="sr-only">Выбери один ответ</legend>${q.choices.map((o,i)=>`<label class="choice-option"><input type="radio" name="choice" value="${escape(o.id)}" ${value===o.id?'checked':''}><span class="choice-letter">${String.fromCharCode(65+i)}</span><span>${escape(o.text)}</span></label>`).join('')}</fieldset>`;
    if (q.kind === 'match') {
      const map=T.parsePairs(value);
      return `<div class="matching-list">${q.pairs.map((pair,i)=>`<div class="matching-row"><label for="pair-${i}"><span>${i+1}</span><code>${escape(pair.left)}</code></label><span class="match-arrow" aria-hidden="true">→</span><select id="pair-${i}" data-pair="${pair.id}" aria-label="Соответствие для ${escape(pair.left)}"><option value="">Выбери соответствие</option>${q.options.map(o=>`<option value="${o.id}" ${map[pair.id]===o.id?'selected':''}>${escape(o.text)}</option>`).join('')}</select></div>`).join('')}</div><p class="answer-help">Один балл за все верные пары. Незаполненное сопоставление ещё не считается ответом.</p>`;
    }
    if(q.kind==='code') return `<label class="editor-label" for="answer-input">Новая строка ${q.editLine+1}</label><textarea id="answer-input" class="code-editor" rows="2" maxlength="500" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="answer-help">${escape(value || q.code[q.editLine])}</textarea><div class="editor-actions"><button type="button" class="button subtle small" id="run-code">▷ Запустить пример</button><span>Проверка на ${q.tests.length} наборах данных — после завершения</span></div><p id="answer-help" class="answer-help">Редактируй одну строку. Можно использовать другой способ решения. Песочница: print, input, int, float, str, bool, len, операции и списки.</p><div id="run-output" class="run-output" role="status" hidden></div>`;
    return `<label class="sr-only" for="answer-input">Вывод программы</label><input type="text" id="answer-input" class="output-input" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="500" placeholder="Что появится на экране?" value="${escape(value)}" aria-describedby="answer-help"><p id="answer-help" class="answer-help">Запиши вывод без внешних кавычек. Регистр и пробелы внутри строки имеют значение.</p>`;
  }
  function renderQuestion(focus = false) {
    const q = questions[session.current];
    const category = T.categories[q.category];
    $('#question-card').innerHTML = `
      <div class="question-top"><span class="question-category"><span class="icon">${icon(category.icon)}</span>${category.label}</span><span class="question-position">Задание ${session.current+1} из ${session.count}</span></div>
      <h2 id="question-title">${q.title}</h2><span class="question-level">${q.level} · ${T.kindLabels[q.kind]}</span>
      <div class="question-text">${q.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</div>
      ${programBlock(q)}
      ${q.kind==='code'?`<div class="sample-grid"><div><span>Входные данные</span><pre>${escape(q.sampleInput.join('\n'))}</pre></div><div><span>Нужный результат</span><pre>${escape(q.sampleOutput)}</pre></div></div>`:''}
      <div class="answer-area"><div class="answer-top"><span class="answer-caption">${T.kindLabels[q.kind]}</span><button type="button" class="flag-button${session.flags[session.current]?' is-flagged':''}" id="flag-button" aria-pressed="${session.flags[session.current]}"><span class="icon">${icon('flag')}</span><span>${session.flags[session.current]?'Отмечено на потом':'Отметить на потом'}</span></button></div>${answerFields(q,session.answers[session.current])}</div>
      <div class="question-controls"><button type="button" class="button outline" id="previous-button" ${session.current===0?'disabled':''}>← Назад</button><button type="button" class="button primary" id="next-button">${session.current===session.count-1?'К завершению ↗':'Дальше →'}</button></div>`;
    if($('#answer-input')) {
      $('#answer-input').addEventListener('input',saveAnswer);
      $('#answer-input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(q.kind==='code')runExample();else next();}});
    }
    document.querySelectorAll('input[name="choice"], [data-pair]').forEach(el=>el.addEventListener('change',saveAnswer));
    if($('#run-code'))$('#run-code').onclick=runExample;
    $('#flag-button').addEventListener('click',()=>{
      if(!ensureActive())return;
      session.flags[session.current]=!session.flags[session.current];persist();
      const marked=session.flags[session.current];
      $('#flag-button').classList.toggle('is-flagged',marked);
      $('#flag-button').setAttribute('aria-pressed',String(marked));
      $('#flag-button span:last-child').textContent=marked?'Отмечено на потом':'Отметить на потом';updateNav();
    });
    $('#previous-button').onclick=()=>navigate(session.current-1);
    $('#next-button').onclick=next;
    if(focus)$('#question-title').setAttribute('tabindex','-1');
    if(focus)$('#question-title').focus({preventScroll:true});
  }
  function runExample() {
    if(!ensureActive())return;
    saveAnswer();
    const q=questions[session.current];
    const source=T.programFor(q,session.answers[session.current]);
    const result=source===null?{ok:false,error:'Нужно изменить ровно одну непустую строку.'}:P.run(source,q.sampleInput);
    const box=$('#run-output');box.hidden=false;box.classList.toggle('run-error',!result.ok);
    box.textContent=result.ok?`Вывод программы:\n${result.output || '(пусто)'}`:result.error;
  }
  function ensureActive() {
    if (!active) return false;
    if (C.remainingMs(session, now()) <= 0) { complete('timeout'); return false; }
    return true;
  }
  function saveAnswer() {
    if(!ensureActive())return;
    const q=questions[session.current];
    if(q.kind==='choice')session.answers[session.current]=$('input[name="choice"]:checked')?.value || '';
    else if(q.kind==='match')session.answers[session.current]=JSON.stringify(Object.fromEntries([...document.querySelectorAll('[data-pair]')].map(el=>[el.dataset.pair,el.value])));
    else session.answers[session.current]=$('#answer-input').value;
    if($('#run-output'))$('#run-output').hidden=true;
    persist();updateNav();
  }
  function navigate(index) {
    if (!ensureActive() || index < 0 || index >= session.count) return;
    session.current = index;
    persist();
    renderQuestion(true);
    updateNav();
    announce(`Задание ${index + 1} из ${session.count}`);
  }
  function next() {
    if (!ensureActive()) return;
    if (session.current === session.count - 1) askFinish();
    else navigate(session.current + 1);
  }
  function askFinish() {
    if (!ensureActive()) return;
    const empty = session.count - answered();
    const flagged = session.flags.filter(Boolean).length;
    dialog('Завершить работу?', `<p>Ответы записаны: <strong>${answered()} из ${session.count}</strong>. ${empty ? `Без полного ответа: <strong>${empty}</strong>. Они будут засчитаны как неверные.` : 'Все задания заполнены.'}${flagged ? ` Отмечено на потом: <strong>${flagged}</strong>.` : ''}</p><p>После завершения изменить ответы не получится. Откроются оценка и разбор решений. Пока это окно открыто, таймер идёт.</p>`, [
      { label: 'Ещё порешаю' }, { label: 'Завершить', kind: 'primary', run: () => complete('manual') },
    ]);
  }
  $('#finish-button').addEventListener('click', askFinish);
  function complete(reason) {
    if (!session || session.finishedAt !== null) return;
    C.finishSession(session, reason, now());
    active = false;
    clearInterval(tickHandle);
    if ($('#app-dialog').open) $('#app-dialog').close();
    persist();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    renderResults();
    if (session.finishReason === 'timeout') toast('Время вышло. Сохранённые ответы проверены автоматически.');
    announce('Работа завершена. Результат готов.');
  }

  function updateMonitor() { $('#away-count').textContent = String(activityCount('away')); }
  function handleAway(kind) {
    if (!active || (kind === 'blur' && Date.now() < suppressFocusUntil)) return;
    if (!ensureActive()) return;
    C.beginAway(session, kind, now());
    persist();
    updateMonitor();
  }
  function handleReturn() {
    if (!active || document.hidden || !document.hasFocus()) return;
    if (!ensureActive()) return;
    if (session.awaySince !== null) {
      C.endAway(session, now());
      persist();
      updateMonitor();
      toast('Возвращение отмечено. Таймер продолжает идти.');
    }
    tick();
  }
  window.addEventListener('blur', () => handleAway('blur'));
  window.addEventListener('focus', handleReturn);
  document.addEventListener('visibilitychange', () => { if (document.hidden) handleAway('hidden'); else handleReturn(); });
  window.addEventListener('pagehide', () => {
    if (!active) return;
    C.beginAway(session, 'pagehide', now());
    persist();
  });
  window.addEventListener('pageshow', event => { if (event.persisted && active) { handleReturn(); tick(); } });

  function eventLabel(event) {
    if (event.type === 'fullscreen-exit') return 'Выход из полного экрана';
    if (event.type === 'reload') return 'Восстановление работы после загрузки страницы';
    if (event.type === 'clock-change') return 'Изменение системного времени';
    if (event.kinds.includes('pagehide')) return 'Закрытие или перезагрузка страницы';
    return event.kinds.includes('hidden') ? 'Страница скрыта / переключение вкладки' : 'Потеря фокуса окна';
  }
  function renderResults() {
    active = false;
    clearInterval(tickHandle);
    const score = C.scoreSession(session);
    const elapsed = session.finishedAt - session.startedAt;
    const tips = {
      5: 'Уверенная работа! Попробуй новый вариант, чтобы закрепить результат.',
      4: 'Хороший результат. Разбери ошибки — до отличной оценки уже близко.',
      3: 'Основа есть. Найди трудные места в разборе и попробуй ещё раз.',
      2: 'Некоторые темы стоит повторить. Начни с пошаговых решений ниже.',
      1: 'Первый шаг сделан. Разбор покажет, как подступиться к каждой задаче.',
    };
    const percentText = score.percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    const fullscreenStatus = session.fullscreenUsed ? 'использовался' : session.fullscreenSupported === false ? 'не поддерживается' : 'не включался';
    $('#results-screen').innerHTML = `
      <div class="results-topline"><div><div class="eyebrow">ПРАКТИКА ЗАВЕРШЕНА</div><h1 id="results-title">Теперь всё по полочкам.</h1><p>${escape(session.profile.firstName)} ${escape(session.profile.lastName)} · ${escape(session.profile.className)} · ${dateText(session.startedAt)}</p></div><div class="button-row"><button type="button" class="button outline small" id="new-session">Новая тренировка</button><button type="button" class="button primary small" id="download-report"><span class="icon">${icon('download')}</span>Скачать отчёт</button></div></div>
      <div class="score-card"><div class="grade-circle"><strong>${score.grade}</strong><span>оценка из 5</span></div><div class="score-message"><h2>${score.label}</h2><p>${tips[score.grade]}</p></div><div class="score-right"><div class="score-ratio">${score.correct}<small>/ ${score.total}</small></div><div class="score-ratio-label">верных ответов</div><div class="score-percent">${percentText}% результата</div></div></div>
      <div class="result-stats"><div class="stat-card"><span>Время работы</span><strong>${durationText(elapsed)}</strong><small>из ${session.minutes} минут</small></div><div class="stat-card"><span>Уходы со страницы</span><strong>${activityCount('away')}</strong><small>Всего вне страницы: ${durationText(session.awayMs)}</small></div><div class="stat-card"><span>Выходы из полного экрана</span><strong>${activityCount('fullscreen-exit')}</strong><small>Полный экран: ${fullscreenStatus}</small></div><div class="stat-card"><span>Работа завершена</span><strong style="font-size:20px">${session.finishReason === 'timeout' ? 'Время вышло' : 'Самостоятельно'}</strong><small>Восстановлений: ${activityCount('reload')}</small></div></div>
      <section class="result-section"><h2>Как получилось по темам</h2><div class="topic-results">${Object.entries(T.categories).map(([key, category]) => {
        const group = score.results.filter(q => q.category === key);
        const correct = group.filter(q => q.correct).length;
        return `<div class="topic-result"><div><span class="icon">${icon(category.icon)}</span>${category.label}<b>${correct} / ${group.length}</b></div><div class="topic-progress"><span style="width:${group.length ? correct / group.length * 100 : 0}%"></span></div><p>${correct === group.length ? 'Все ответы верные. Так держать!' : 'Вернись к решениям этой темы в разборе.'}</p></div>`;
      }).join('')}</div></section>
      <section class="result-section"><div class="review-heading"><h2>Разбор твоей работы</h2><div class="filter-tabs" aria-label="Фильтр разбора"><button type="button" data-filter="all" aria-pressed="true">Все (${session.count})</button><button type="button" data-filter="errors" aria-pressed="false">Ошибки (${session.count - score.correct})</button><button type="button" data-filter="correct" aria-pressed="false">Верные (${score.correct})</button></div></div><div id="review-list" class="review-list"></div></section>
      <details class="activity-details"><summary>Журнал активности · ${session.events.length} событий</summary><p>Журнал фиксирует сигналы браузера и не определяет, какой сайт был открыт. Потерю фокуса могут вызвать другая программа или системное окно. События не изменяют оценку за ответы.</p>${session.events.length ? `<div class="activity-table-wrap"><table class="activity-table"><thead><tr><th>ОТ НАЧАЛА</th><th>СОБЫТИЕ</th><th>ДЛИТЕЛЬНОСТЬ</th></tr></thead><tbody>${session.events.map(e => `<tr><td>${durationText(e.at - session.startedAt)}</td><td>${eventLabel(e)}</td><td>${e.type === 'away' ? durationText((e.endedAt ?? session.finishedAt) - e.at) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p>Уходов со страницы, восстановлений и выходов из полного экрана не зафиксировано.</p>'}</details>
      <p class="print-only">Уходы: ${activityCount('away')} · Вне страницы: ${durationText(session.awayMs)} · Выходы из полного экрана: ${activityCount('fullscreen-exit')} · Восстановления: ${activityCount('reload')}. Вариант: ${session.seed}.</p>
      <div class="result-bottom"><p>Учебная шкала: 5 — от 85%; 4 — от 70%; 3 — от 50%; 2 — от 20%; 1 — ниже 20%.<br>Результат хранится только в этом браузере. Скачай отчёт, чтобы передать его учителю.</p><div class="button-row"><button type="button" class="button outline small" id="print-report">Печать / PDF</button><button type="button" class="button subtle small" id="delete-result">Удалить данные</button></div></div>`;
    currentFilter = 'all';
    renderReviews(score);
    document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
      currentFilter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      renderReviews(score);
    }));
    $('#new-session').onclick = home;
    $('#download-report').onclick = downloadReport;
    $('#print-report').onclick = () => window.print();
    $('#delete-result').onclick = () => $('#discard-button').click();
    showScreen('results');
  }
  function renderReviews(score) {
    let shown=0;
    $('#review-list').innerHTML=score.results.map((q,i)=>{
      if((currentFilter==='errors'&&q.correct)||(currentFilter==='correct'&&!q.correct))return '';
      shown++;
      return `<details class="review-item"><summary><span class="review-number">${String(i+1).padStart(2,'0')}</span><span>${q.title}</span><span class="review-status ${q.correct?'correct':'incorrect'}">${q.correct?'Верно':!T.isAnswered(q,q.input)?'Нет полного ответа':'Ошибка'}</span></summary><div class="review-content">${q.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}${programBlock(q)}${q.kind==='code'?`<p>Пример ввода: <code>${escape(q.sampleInput.join(', '))}</code>. Нужный вывод: <code>${escape(q.sampleOutput)}</code>.</p>`:''}<div class="answer-comparison"><div>Твой ответ:<pre class="${q.correct?'correct':'incorrect'}">${escape(T.answerText(q,q.input))}</pre></div><div>${q.kind==='code'?'Пример верного решения':'Верный ответ'}:<pre>${escape(T.answerText(q,q.answer))}</pre></div></div><div class="solution"><h3>Как разобраться</h3><ol>${q.solution.map(s=>`<li>${escape(s)}</li>`).join('')}</ol></div></div></details>`;
    }).join('');
    if(!shown)$('#review-list').innerHTML=`<div class="empty-review">${currentFilter==='errors'?'Ни одной ошибки. Отличная работа!':'Пока нет верных ответов. Посмотри решения во вкладке «Все».'}</div>`;
  }
  let printState = null;
  window.addEventListener('beforeprint', () => {
    if (!session || session.finishedAt === null) return;
    printState = currentFilter;
    currentFilter = 'all';
    renderReviews(C.scoreSession(session));
    document.querySelectorAll('.review-item').forEach(d => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (printState === null) return;
    currentFilter = printState;
    printState = null;
    renderReviews(C.scoreSession(session));
  });
  function downloadReport() {
    const score = C.scoreSession(session);
    const lines = [
      'КОД С НУЛЯ — PYTHON, 7 КЛАСС ИТ-ВЕРТИКАЛИ', '',
      `Ученик: ${session.profile.lastName} ${session.profile.firstName}`, `Класс: ${session.profile.className}`,
      `Начало: ${dateText(session.startedAt)}`, `Завершение: ${dateText(session.finishedAt)}`, `Вариант: ${session.seed}`,
      `Оценка: ${score.grade} из 5 (${score.label})`, `Верно: ${score.correct} из ${score.total} (${score.percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%)`,
      `Время работы: ${durationText(session.finishedAt - session.startedAt)} из ${session.minutes} мин.`,
      `Причина завершения: ${session.finishReason === 'timeout' ? 'время истекло' : 'самостоятельно'}`,
      `Уходы со страницы: ${activityCount('away')}; вне страницы: ${durationText(session.awayMs)}`,
      `Выходы из полного экрана: ${activityCount('fullscreen-exit')}; восстановлений страницы: ${activityCount('reload')}`,
      `Полный экран: ${session.fullscreenUsed ? 'использовался' : session.fullscreenSupported === false ? 'не поддерживается' : 'не включался'}`,
      'Учебная шкала: 5 — от 85%; 4 — от 70%; 3 — от 50%; 2 — от 20%; 1 — ниже 20%.', '',
      'РАЗБОР РЕШЕНИЙ',
    ];
    score.results.forEach((q,i)=>{
      lines.push('',`${i+1}. ${q.title} — ${q.correct?'ВЕРНО':'НЕВЕРНО'}`,...q.paragraphs);
      if(q.code)lines.push('Исходный код:',...q.code);
      if(q.kind==='code')lines.push(`Пример ввода: ${q.sampleInput.join(', ')}`,`Нужный вывод: ${q.sampleOutput}`);
      lines.push(`Ответ ученика: ${T.answerText(q,q.input)}`,`${q.kind==='code'?'Пример верного решения':'Верный ответ'}: ${T.answerText(q,q.answer)}`,'Объяснение:',...q.solution.map((s,j)=>`  ${j+1}) ${s}`));
    });
    lines.push('', 'ЖУРНАЛ АКТИВНОСТИ');
    if (!session.events.length) lines.push('Событий не зафиксировано.');
    session.events.forEach(e => lines.push(`${durationText(e.at - session.startedAt)} | ${eventLabel(e)}${e.type === 'away' ? ` | ${durationText((e.endedAt ?? session.finishedAt) - e.at)}` : ''}`));
    lines.push('', 'Отчёт сформирован локальным тренажёром без серверной проверки. Данные можно изменить средствами браузера. Журнал не является доказательством списывания; оценки не снижаются за события.');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    const filename = `${session.profile.lastName}_${session.profile.firstName}`.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 80);
    link.download = `Python7_${filename}_${session.seed}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Отчёт подготовлен для скачивания.');
  }
  // Web Locks prevents a second tab from overwriting the same local attempt.
  async function initialise() {
    loadSession();
    prefill();
    if (navigator.locks) {
      lockAvailable = await new Promise(resolve => {
        navigator.locks.request(STORAGE_KEY, { ifAvailable: true }, lock => {
          resolve(Boolean(lock));
          if (lock) return new Promise(() => {}); // Browser releases the lock when this page closes.
        }).catch(() => resolve(true));
      });
    } else lockAvailable = true;
    if (!lockAvailable) {
      $('#start-form button[type="submit"]').disabled = true;
      $('#form-error').textContent = 'Тренажёр уже открыт в другой вкладке. Продолжите там или закройте её и обновите эту страницу.';
      $('#form-error').hidden = false;
      return;
    }
    if (session && session.finishedAt === null) {
      session.events.push({ type: 'reload', at: Math.min(now(), session.deadline) });
      // If pagehide was unavailable, the unobserved interval is recorded conservatively.
      if (session.awaySince === null && now() - session.lastSeenAt > 1500) C.beginAway(session, 'pagehide', session.lastSeenAt);
      C.endAway(session, now());
      persist();
      startExam();
      if (active) toast('Работа восстановлена. Ответы сохранены, таймер продолжает идти.');
    } else home();
  }
  initialise();
})();
