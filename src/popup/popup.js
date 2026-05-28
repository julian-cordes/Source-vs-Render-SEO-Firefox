/**
 * popup.js
 * Pure display layer. Reads data from the service worker (which reads from
 * chrome.storage.session). Never mutates SEO analysis state directly.
 */

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  root.appendChild(stateMessage('Loading...'));

  chrome.runtime.sendMessage({ type: 'GET_SEO_DATA' }, (data) => {
    root.replaceChildren();
    if (chrome.runtime.lastError || !data) {
      root.appendChild(stateMessage('No data yet. Navigate to a page.'));
      return;
    }
    root.appendChild(renderAll(data));
  });
});

const ANALYSIS_MODES = [
  { value: 'compare', label: 'Compare', icon: 'compare' },
  { value: 'html', label: 'HTML', icon: 'code' },
  { value: 'rendered', label: 'Rendered', icon: 'eye' },
];

const FIELD_LABELS = {
  title: 'Title',
  metaDescription: 'Meta Description',
  metaRobots: 'Meta Robots',
  canonical: 'Canonical',
  h1s: 'H1',
  hreflangs: 'Hreflangs',
};

const IMPORTANT_FIELDS = ['title', 'metaDescription', 'h1s', 'hreflangs'];
const QUICK_FIELDS = ['url', 'metaRobots', 'canonical'];

function renderAll(data) {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderModeControls(data.analysisMode));
  frag.appendChild(renderShell(data));
  return frag;
}

function renderShell(data) {
  const shell = div('shell');
  shell.appendChild(renderHeader());
  shell.appendChild(renderOverview(data));
  shell.appendChild(renderAnalysisNotice(data));
  shell.appendChild(renderQuickCheck(data));
  shell.appendChild(renderImportantSignals(data));
  return shell;
}

function renderHeader() {
  const el = div('header');
  const brand = div('brand');
  const logo = document.createElement('img');
  logo.className = 'brand__logo';
  logo.src = chrome.runtime.getURL('icons/store/source-vs-render-seo-48.png');
  logo.alt = '';

  const copy = div('brand__copy');
  const title = div('brand__title');
  title.textContent = 'Source vs Render SEO';
  const subtitle = div('brand__subtitle');
  subtitle.textContent = 'Diff Inspector';
  copy.appendChild(title);
  copy.appendChild(subtitle);

  brand.appendChild(logo);
  brand.appendChild(copy);
  el.appendChild(brand);
  return el;
}

function renderModeControls(activeMode) {
  const el = div('mode');
  ANALYSIS_MODES.forEach((mode) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode__button';
    button.dataset.mode = mode.value;
    button.setAttribute('aria-pressed', String(mode.value === activeMode));
    if (mode.value === activeMode) button.classList.add('mode__button--active');

    const icon = span('mode__icon');
    icon.appendChild(svgIcon(mode.icon));
    const text = span('mode__text');
    text.textContent = mode.label;
    button.appendChild(icon);
    button.appendChild(text);

    button.addEventListener('click', () => setAnalysisMode(mode.value));
    el.appendChild(button);
  });
  return el;
}

function setAnalysisMode(mode) {
  const root = document.getElementById('root');
  setModeButtonsDisabled(true);

  chrome.runtime.sendMessage({ type: 'SET_ANALYSIS_MODE', mode }, (resp) => {
    root.replaceChildren();
    if (chrome.runtime.lastError || !resp?.ok) {
      root.appendChild(renderModeControls(mode));
      root.appendChild(stateMessage('Could not update mode.'));
      return;
    }

    if (!resp.data) {
      root.appendChild(stateMessage('No data yet. Navigate to a page.'));
      return;
    }

    root.appendChild(renderAll(resp.data));
  });
}

function setModeButtonsDisabled(disabled) {
  document.querySelectorAll('.mode__button').forEach((button) => {
    button.disabled = disabled;
  });
}

function renderOverview(data) {
  const wrap = div('overview');
  const indexable = isDisplayedIndexable(data);
  const hasDiff = hasRenderDifference(data);
  const httpOk = isStatusOk(data.httpStatus);

  wrap.appendChild(statusCard({
    tone: indexable ? 'green' : 'red',
    icon: indexable ? 'ok' : '!',
    title: indexable ? 'Index' : 'No\nIndex',
    subtitle: '',
  }));

  wrap.appendChild(statusCard({
    tone: hasDiff ? 'red' : 'green',
    icon: hasDiff ? '!' : 'ok',
    title: hasDiff ? 'Render\nChange' : 'No\nChange',
    subtitle: '',
  }));

  wrap.appendChild(statusCard({
    tone: httpOk ? 'green' : 'red',
    icon: httpOk ? 'ok' : '!',
    title: String(data.httpStatus ?? 'N/A'),
    subtitle: '',
  }));
  return wrap;
}

function statusCard({ tone, icon, title, subtitle }) {
  const card = div(`status-card status-card--${tone}`);
  const mark = span(`status-card__icon status-card__icon--${tone}`);
  mark.appendChild(svgIcon(icon === 'ok' ? 'check' : 'warning'));
  const copy = div('status-card__copy');
  const heading = div('status-card__title');
  heading.textContent = title;
  const sub = div('status-card__subtitle');
  sub.textContent = subtitle;
  copy.appendChild(heading);
  copy.appendChild(sub);
  card.appendChild(mark);
  card.appendChild(copy);
  return card;
}

function renderAnalysisNotice(data) {
  const notice = div('analysis-notice');
  if (data.analysisState === 'ok') return notice;

  const title = div('analysis-notice__title');
  title.textContent = 'Analysis incomplete';
  const text = div('analysis-notice__text');

  if (data.url?.startsWith('file://') && data.analysisState === 'source_unavailable') {
    text.textContent = 'Firefox cannot reliably read raw HTML source from file:// pages. Serve the page over local HTTP and reload it.';
  } else if (data.analysisState === 'source_unavailable') {
    text.textContent = 'Raw HTML source could not be fetched. Rendered DOM data may still be available.';
  } else if (data.analysisState === 'rendered_unavailable') {
    text.textContent = 'Rendered DOM data could not be read from the tab.';
  } else if (data.analysisState === 'both_unavailable') {
    text.textContent = 'Raw HTML source and rendered DOM data could not be read for this page.';
  } else {
    text.textContent = 'Only partial SEO data is available for this page.';
  }

  notice.appendChild(title);
  notice.appendChild(text);
  return notice;
}

function renderQuickCheck(data) {
  const section = div('section section--quick');
  const list = div('info-list');
  QUICK_FIELDS.forEach((key) => list.appendChild(renderQuickRow(key, data)));
  section.appendChild(list);
  return section;
}

function renderQuickRow(key, data) {
  if (key === 'url') {
    return infoRow('link', 'URL', data.url, { link: data.url });
  }

  if (key === 'metaRobots') {
    return signalRow('metaRobots', data);
  }

  return canonicalQuickRow(data);
}

function canonicalQuickRow(data) {
  const fieldResult = data.comparison?.fields?.canonical;
  const row = infoRow('target', 'Canonical', getFieldValue('canonical', data), {
    fieldKey: 'canonical',
    data,
  });

  if (data.analysisMode !== 'compare' || !fieldResult?.diff) {
    return row;
  }

  const valueEl = row.querySelector('.info-row__value');
  if (!valueEl) return row;

  valueEl.replaceChildren();
  appendInlineDiff(valueEl, 'canonical', fieldResult.source, fieldResult.rendered, data);
  return row;
}

function renderImportantSignals(data) {
  const section = renderSection('Additional Checks');
  const list = div('info-list');
  IMPORTANT_FIELDS.forEach((key) => {
    list.appendChild(signalRow(key, data));
  });
  section.appendChild(list);
  return section;
}

function signalRow(key, data) {
  const fieldResult = data.comparison?.fields?.[key];
  const row = infoRow(fieldIcon(key), FIELD_LABELS[key], getFieldValue(key, data), { fieldKey: key, data });

  if (data.analysisMode !== 'compare' || !fieldResult?.diff) {
    return row;
  }

  const valueEl = row.querySelector('.info-row__value');
  if (!valueEl) return row;
  valueEl.replaceChildren();
  appendInlineDiff(valueEl, key, fieldResult.source, fieldResult.rendered, data);
  return row;
}

function renderSection(title) {
  const section = div('section');
  const heading = div('section__title');
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function infoRow(icon, label, value, options = {}) {
  const row = div('info-row');
  const iconEl = span(`info-row__icon info-row__icon--${icon}`);
  iconEl.appendChild(svgIcon(icon));
  const labelEl = div('info-row__label');
  labelEl.textContent = label;
  const valueEl = div(`info-row__value${options.tone ? ` info-row__value--${options.tone}` : ''}`);

  if (options.link) {
    valueEl.appendChild(renderExternalLink(options.link, value));
  } else if (options.fieldKey) {
    appendValueContent(valueEl, options.fieldKey, value, options.data);
  } else {
    valueEl.textContent = value ?? 'not set';
  }

  row.appendChild(iconEl);
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function getFieldValue(key, data) {
  if (data.analysisMode === 'rendered') return data.renderedFields?.[key] ?? null;
  if (data.analysisMode === 'html') return data.sourceFields?.[key] ?? null;
  const fieldResult = data.comparison?.fields?.[key];
  if (fieldResult && !fieldResult.diff) return fieldResult.source;
  return data.renderedFields?.[key] ?? data.sourceFields?.[key] ?? null;
}

function displayValue(key, value, data) {
  if (key === 'canonical' && value && isSelfReferencingCanonical(value, data.url)) {
    return 'Self-referencing';
  }
  return value;
}

function appendValueContent(el, key, value, data) {
  if (value === null || value === undefined) {
    el.textContent = 'not set';
    el.classList.add('muted');
    return;
  }

  const display = displayValue(key, value, data);
  if (key === 'h1s') {
    renderArrayValue(el, display);
  } else if (key === 'hreflangs') {
    renderHreflangs(el, display, data);
  } else if (key === 'metaRobots') {
    el.textContent = display;
  } else if (key === 'canonical') {
    renderCanonicalValue(el, display, data);
  } else {
    el.textContent = display;
  }
}

function renderCanonicalValue(el, value, data) {
  if (value === 'Self-referencing' || !data?.url || isSelfReferencingCanonical(value, data.url)) {
    el.textContent = value;
    return;
  }

  let href;
  try {
    href = new URL(value, data.url).href;
  } catch {
    el.textContent = value;
    el.classList.add('indexability-cause');
    return;
  }

  el.appendChild(renderExternalLink(href, value));
  el.classList.add('indexability-cause');
}

function appendPlainCanonicalValue(el, value, data) {
  if (value === null || value === undefined) {
    el.textContent = 'not set';
    el.classList.add('muted');
    return;
  }

  const display = displayValue('canonical', value, data);
  if (display === 'Self-referencing' || !data?.url) {
    el.textContent = display;
    return;
  }

  try {
    const href = new URL(value, data.url).href;
    el.appendChild(renderExternalLink(href, display));
  } catch {
    el.textContent = display;
  }
}

function appendInlineDiff(el, key, sourceValue, renderedValue, data) {
  const sourceLine = div('inline-diff__line');
  appendPlainValue(sourceLine, key, sourceValue, data);

  const renderedLine = div('inline-diff__line inline-diff__line--rendered');
  const renderedValueEl = span('inline-diff__value');
  appendPlainValue(renderedValueEl, key, renderedValue, data);
  renderedLine.appendChild(renderedValueEl);

  el.appendChild(sourceLine);
  el.appendChild(renderedLine);
}

function appendPlainValue(el, key, value, data) {
  if (key === 'canonical') {
    appendPlainCanonicalValue(el, value, data);
    return;
  }
  appendValueContent(el, key, value, data);
}

function renderArrayValue(el, value) {
  if (!Array.isArray(value) || value.length === 0) {
    el.textContent = 'none';
    return;
  }

  if (value.length === 1) {
    el.textContent = value[0];
    return;
  }

  const list = document.createElement('ol');
  list.className = 'value-list';
  value.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  el.appendChild(list);
}

function renderHreflangs(el, items) {
  if (!Array.isArray(items) || items.length === 0) {
    el.textContent = 'none';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'value-list';
  items.forEach(({ lang, href }) => {
    const li = document.createElement('li');
    const langPart = document.createElement('strong');
    langPart.textContent = `${lang}: `;
    li.appendChild(langPart);
    li.appendChild(renderExternalLink(href, href));
    list.appendChild(li);
  });
  el.appendChild(list);
}

function renderExternalLink(href, text) {
  const link = document.createElement('a');
  link.className = 'external-link external-link--plain';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const label = span('external-link__text');
  const title = text ?? href;
  link.title = title;
  label.title = title;
  label.textContent = text;
  link.appendChild(label);
  return link;
}

function hasRenderDifference(data) {
  return data.analysisMode === 'compare' && Boolean(data.comparison?.hasDiff);
}

function fieldIcon(key) {
  if (key === 'title') return 'text';
  if (key === 'metaDescription') return 'comment';
  if (key === 'metaRobots') return 'robot';
  if (key === 'canonical') return 'target';
  if (key === 'h1s') return 'heading';
  if (key === 'hreflangs') return 'globe';
  return 'info';
}

function svgIcon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const paths = {
    check: [
      ['path', { d: 'M20 6 9 17l-5-5' }],
    ],
    warning: [
      ['path', { d: 'M12 9v4' }],
      ['path', { d: 'M12 17h.01' }],
      ['path', { d: 'M10.3 4.2 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z' }],
    ],
    link: [
      ['path', { d: 'M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1L10.9 5' }],
      ['path', { d: 'M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 0 0 7.1 7.1l1.2-1.2' }],
    ],
    external: [
      ['path', { d: 'M15 3h6v6' }],
      ['path', { d: 'M10 14 21 3' }],
      ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
    ],
    info: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M12 16v-4' }],
      ['path', { d: 'M12 8h.01' }],
    ],
    target: [
      ['circle', { cx: '12', cy: '12', r: '8' }],
      ['circle', { cx: '12', cy: '12', r: '3' }],
      ['path', { d: 'M12 2v3' }],
      ['path', { d: 'M12 19v3' }],
      ['path', { d: 'M2 12h3' }],
      ['path', { d: 'M19 12h3' }],
    ],
    text: [
      ['path', { d: 'M4 7V5h16v2' }],
      ['path', { d: 'M9 20h6' }],
      ['path', { d: 'M12 5v15' }],
    ],
    heading: [
      ['path', { d: 'M5 19V5' }],
      ['path', { d: 'M19 19V5' }],
      ['path', { d: 'M5 12h14' }],
    ],
    comment: [
      ['path', { d: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-4-.9L3 20l1.4-4.2a8.1 8.1 0 0 1-.4-2.6A8.5 8.5 0 1 1 21 11.5Z' }],
    ],
    robot: [
      ['rect', { x: '5', y: '8', width: '14', height: '10', rx: '3' }],
      ['path', { d: 'M12 8V4' }],
      ['path', { d: 'M8.5 13h.01' }],
      ['path', { d: 'M15.5 13h.01' }],
      ['path', { d: 'M9 18v2' }],
      ['path', { d: 'M15 18v2' }],
    ],
    compare: [
      ['path', { d: 'M8 7 4 11l4 4' }],
      ['path', { d: 'M16 7l4 4-4 4' }],
      ['path', { d: 'M14 4 10 20' }],
    ],
    code: [
      ['path', { d: 'm9 18-6-6 6-6' }],
      ['path', { d: 'm15 6 6 6-6 6' }],
    ],
    eye: [
      ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z' }],
      ['circle', { cx: '12', cy: '12', r: '3' }],
    ],
    globe: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M2 12h20' }],
      ['path', { d: 'M12 2a15.3 15.3 0 0 1 0 20' }],
      ['path', { d: 'M12 2a15.3 15.3 0 0 0 0 20' }],
    ],
    file: [
      ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z' }],
      ['path', { d: 'M14 2v6h6' }],
    ],
  };

  const iconPaths = paths[name] ?? paths.info;
  iconPaths.forEach(([tag, attrs]) => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => child.setAttribute(key, value));
    svg.appendChild(child);
  });

  return svg;
}

function div(className) {
  const el = document.createElement('div');
  if (className) el.className = className;
  return el;
}

function span(className) {
  const el = document.createElement('span');
  if (className) el.className = className;
  return el;
}

function stateMessage(text) {
  const el = div('state-message');
  el.textContent = text;
  return el;
}

function isStatusOk(status) {
  return status !== null && status >= 200 && status < 300;
}

function isIconStateIndexable(iconState) {
  return typeof iconState === 'string' && iconState.startsWith('indexable-');
}

function isDisplayedIndexable(data) {
  const fields = data.analysisMode === 'html'
    ? data.sourceFields
    : (data.renderedFields ?? data.sourceFields);
  if (!fields) return isIconStateIndexable(data.iconState);
  return !hasNoindexDirective(fields.metaRobots) && isSelfReferencingCanonical(fields.canonical, data.url);
}

function hasNoindexDirective(metaRobots) {
  if (!metaRobots) return false;
  const directives = String(metaRobots)
    .toLowerCase()
    .split(',')
    .map((part) => part.trim());
  return directives.includes('noindex') || directives.includes('none');
}

function isSelfReferencingCanonical(canonical, pageUrl) {
  if (!canonical) return true;
  return normalizeComparableUrl(canonical, pageUrl) === normalizeComparableUrl(pageUrl, pageUrl);
}

function normalizeComparableUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}${url.search}`;
  } catch {
    return String(value).trim();
  }
}
