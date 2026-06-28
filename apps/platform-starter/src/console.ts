/**
 * Minimal browser task console for the platform starter. Served as a single static
 * HTML document with vanilla JS — no front-end framework, no build step. It talks to
 * the existing JSON API (`/api/tasks`, `/api/tasks/:id`, `/api/tasks/:id/mock-patch`).
 *
 * The client script below intentionally avoids template literals and `${...}` so it
 * can live inside this module's outer template literal without interpolation. All
 * task-derived text is rendered via `textContent`, never `innerHTML`.
 */
export const CONSOLE_MESSAGES = {
  en: {
    appTitle: "webAnnotation Task Console",
    languageLabel: "Language",
    refresh: "Refresh",
    tasksHeading: "Tasks",
    detailHeading: "Detail",
    selectTask: "Select a task to see its details.",
    noTasks: "No tasks yet. POST an annotation to /api/annotations.",
    annotationsLabel: "annotations",
    proposalIdLabel: "proposal",
    taskLabel: "Task",
    statusField: "Status",
    projectField: "Project",
    pageField: "Page",
    urlField: "URL",
    annotationsHeading: "Annotations",
    messageField: "Message",
    targetField: "Target",
    selectorField: "Selector",
    sourceField: "Source",
    patchProposalHeading: "补丁建议",
    summaryField: "Summary",
    suggestedFilesField: "Suggested files",
    generateMockPatch: "Generate mock patch",
    loadTasksError: "Failed to load tasks",
    loadTaskError: "Failed to load task",
    mockPatchFailed: "Mock patch failed",
    mockPatchRequestFailed: "Mock patch request failed",
  },
  zh: {
    appTitle: "webAnnotation 任务台",
    languageLabel: "语言",
    refresh: "刷新",
    tasksHeading: "任务",
    detailHeading: "详情",
    selectTask: "选择一个任务查看详情。",
    noTasks: "暂无任务。请向 /api/annotations 提交一条批注。",
    annotationsLabel: "批注数",
    proposalIdLabel: "proposal",
    taskLabel: "任务",
    statusField: "状态",
    projectField: "项目",
    pageField: "页面",
    urlField: "URL",
    annotationsHeading: "批注",
    messageField: "批注内容",
    targetField: "目标",
    selectorField: "选择器",
    sourceField: "源码",
    patchProposalHeading: "Patch Proposal",
    summaryField: "摘要",
    suggestedFilesField: "建议文件",
    generateMockPatch: "生成 mock patch",
    loadTasksError: "加载任务失败",
    loadTaskError: "加载任务失败",
    mockPatchFailed: "Mock patch 生成失败",
    mockPatchRequestFailed: "Mock patch 请求失败",
  },
} as const

export type ConsoleLanguage = keyof typeof CONSOLE_MESSAGES

export function renderConsoleHtml(): string {
  const messagesJson = JSON.stringify(CONSOLE_MESSAGES).replace(/</g, "\\u003c")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title></title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; line-height: 1.5; }
    header { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border-bottom: 1px solid #8884; }
    header h1 { font-size: 1.1rem; margin: 0; flex: 1; }
    label { font-size: 0.85rem; opacity: 0.75; }
    select { font: inherit; border: 1px solid #8886; background: #8881; border-radius: 6px; padding: 0.25rem 0.45rem; }
    main { display: grid; grid-template-columns: 320px 1fr; gap: 1rem; padding: 1rem; align-items: start; }
    h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; margin: 0 0 0.5rem; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 0.5rem 0; border-bottom: 1px solid #8882; }
    li div { font-size: 0.8rem; opacity: 0.75; margin-top: 0.15rem; }
    button { font: inherit; cursor: pointer; border: 1px solid #8886; background: #8881; border-radius: 6px; padding: 0.3rem 0.6rem; }
    button.task-link { width: 100%; text-align: left; font-weight: 600; }
    button.primary { background: #2563eb22; border-color: #2563eb88; }
    .annotation { border: 1px solid #8883; border-radius: 6px; padding: 0.5rem 0.75rem; margin: 0.5rem 0; }
    p { margin: 0.25rem 0; }
    pre.diff { background: #8881; border-radius: 6px; padding: 0.75rem; overflow: auto; font-size: 0.8rem; }
    .error { color: #b91c1c; padding: 0.5rem 1rem; margin: 0; background: #b91c1c1a; }
    #task-detail { font-size: 0.9rem; }
  </style>
</head>
<body>
  <header>
    <h1 data-i18n="appTitle"></h1>
    <label for="language-select" data-i18n="languageLabel"></label>
    <select id="language-select" data-i18n-aria-label="languageLabel">
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
    <button id="refresh" data-i18n="refresh"></button>
  </header>
  <p id="error" class="error" hidden></p>
  <main id="console-root">
    <section id="task-list-panel">
      <h2 data-i18n="tasksHeading"></h2>
      <ul id="task-list"></ul>
    </section>
    <section id="task-detail-panel">
      <h2 data-i18n="detailHeading"></h2>
      <div id="task-detail"></div>
    </section>
  </main>
  <script>
  (function () {
    var messages = ${messagesJson};
    var storageKey = 'webAnnotation.console.language';
    var listEl = document.getElementById('task-list');
    var detailEl = document.getElementById('task-detail');
    var errorEl = document.getElementById('error');
    var languageSelect = document.getElementById('language-select');
    var currentTasks = [];
    var selectedTask = null;
    var language = getInitialLanguage();

    function normalizeLanguage(value) {
      var raw = String(value || '').toLowerCase();
      return raw.indexOf('zh') === 0 ? 'zh' : 'en';
    }
    function getInitialLanguage() {
      try {
        var saved = window.localStorage && window.localStorage.getItem(storageKey);
        if (saved && messages[saved]) return saved;
      } catch (error) {}
      return normalizeLanguage(window.navigator && window.navigator.language);
    }
    function t(key) {
      return (messages[language] && messages[language][key]) || messages.en[key] || key;
    }
    function applyLanguage() {
      document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
      document.title = t('appTitle');
      languageSelect.value = language;
      document.querySelectorAll('[data-i18n]').forEach(function (node) {
        node.textContent = t(node.getAttribute('data-i18n'));
      });
      document.querySelectorAll('[data-i18n-aria-label]').forEach(function (node) {
        node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria-label')));
      });
    }
    function setLanguage(nextLanguage) {
      language = normalizeLanguage(nextLanguage);
      try {
        window.localStorage && window.localStorage.setItem(storageKey, language);
      } catch (error) {}
      applyLanguage();
      renderTaskList(currentTasks);
      if (selectedTask) {
        renderDetail(selectedTask);
      } else {
        renderEmptyDetail();
      }
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
    function clearError() {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
    function el(tag, text) {
      var node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function field(label, value) {
      var p = el('p');
      p.appendChild(el('strong', label + ': '));
      p.appendChild(document.createTextNode(value === null || value === undefined ? '-' : String(value)));
      return p;
    }
    function renderEmptyDetail() {
      selectedTask = null;
      detailEl.textContent = t('selectTask');
    }

    function loadTasks() {
      clearError();
      fetch('/api/tasks').then(function (r) { return r.json(); }).then(function (data) {
        currentTasks = (data && data.tasks) || [];
        renderTaskList((data && data.tasks) || []);
      }).catch(function () { showError(t('loadTasksError')); });
    }

    function renderTaskList(tasks) {
      listEl.textContent = '';
      if (tasks.length === 0) {
        listEl.appendChild(el('li', t('noTasks')));
        return;
      }
      tasks.forEach(function (task) {
        var li = el('li');
        var btn = el('button', task.id + ' [' + task.status + ']');
        btn.className = 'task-link';
        btn.addEventListener('click', function () { selectTask(task.id); });
        li.appendChild(btn);
        var meta = task.projectId + ' · ' + task.route + ' · ' + t('annotationsLabel') + ': ' + task.annotationCount;
        if (task.patchProposalId) meta += ' · ' + t('proposalIdLabel') + ': ' + task.patchProposalId;
        li.appendChild(el('div', meta));
        listEl.appendChild(li);
      });
    }

    function selectTask(id) {
      clearError();
      fetch('/api/tasks/' + encodeURIComponent(id)).then(function (r) {
        if (!r.ok) throw new Error('not found');
        return r.json();
      }).then(function (data) {
        renderDetail(data.task);
      }).catch(function () { showError(t('loadTaskError') + ' ' + id); });
    }

    function renderDetail(task) {
      selectedTask = task;
      detailEl.textContent = '';
      var ctx = task.promptContext;
      detailEl.appendChild(el('h3', t('taskLabel') + ' ' + task.id));
      detailEl.appendChild(field(t('statusField'), task.status));
      detailEl.appendChild(field(t('projectField'), ctx.project.projectId + (ctx.project.environment ? ' (' + ctx.project.environment + ')' : '')));
      detailEl.appendChild(field(t('pageField'), ctx.page.title + ' — ' + ctx.page.route));
      detailEl.appendChild(field(t('urlField'), ctx.page.url));

      detailEl.appendChild(el('h4', t('annotationsHeading')));
      ctx.annotations.forEach(function (a) {
        var box = el('div');
        box.className = 'annotation';
        box.appendChild(field(t('messageField'), a.message));
        box.appendChild(field(t('targetField'), a.target.tagName + ' "' + a.target.text + '"'));
        box.appendChild(field(t('selectorField'), a.target.cssPath || a.target.selector));
        if (a.source) {
          var loc = a.source.file
            ? (a.source.file + (a.source.line ? ':' + a.source.line : ''))
            : '(safe: ' + a.source.sourceId + ')';
          if (a.source.component) loc += ' · ' + a.source.component;
          box.appendChild(field(t('sourceField'), loc));
        }
        detailEl.appendChild(box);
      });

      detailEl.appendChild(el('h4', t('patchProposalHeading')));
      if (task.patchProposal) {
        var p = task.patchProposal;
        detailEl.appendChild(field(t('summaryField'), p.summary));
        detailEl.appendChild(field(t('suggestedFilesField'), (p.suggestedFiles || []).join(', ')));
        var pre = el('pre', p.diffPreview);
        pre.className = 'diff';
        detailEl.appendChild(pre);
      } else {
        var gen = el('button', t('generateMockPatch'));
        gen.className = 'primary';
        gen.addEventListener('click', function () { generatePatch(task.id); });
        detailEl.appendChild(gen);
      }
    }

    function generatePatch(id) {
      clearError();
      fetch('/api/tasks/' + encodeURIComponent(id) + '/mock-patch', { method: 'POST' }).then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      }).then(function (res) {
        if (!res.ok) { showError(t('mockPatchFailed') + ': ' + (res.body && res.body.error)); return; }
        selectTask(id);
        loadTasks();
      }).catch(function () { showError(t('mockPatchRequestFailed')); });
    }

    languageSelect.addEventListener('change', function () { setLanguage(languageSelect.value); });
    document.getElementById('refresh').addEventListener('click', loadTasks);
    applyLanguage();
    renderEmptyDetail();
    loadTasks();
  })();
  </script>
</body>
</html>`
}
