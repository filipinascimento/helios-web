import { colormapToCssGradient } from '../utils/colormapPreview.js';

const DEFAULT_GROUP_ORDER = ['d3', 'cmasher', 'CET', 'helios', 'other'];

function fallbackGradient() {
  return 'linear-gradient(90deg, rgba(120,120,120,1), rgba(40,40,40,1))';
}

function thumbPlaceholderGradient() {
  return 'linear-gradient(90deg, rgba(60,60,60,1), rgba(30,30,30,1))';
}

export class ColormapPickerControl {
  constructor({
    catalog,
    portalRoot = null,
    value = null,
    fallbackValue = 'interpolateInferno',
    searchPlaceholder = 'Search colormaps…',
    groupOrder = DEFAULT_GROUP_ORDER,
    formatDisplay = null,
    filters = [],
    onChange = null,
  } = {}) {
    this.catalog = catalog ?? { entries: [], byKey: new Map() };
    this.portalRoot = portalRoot;
    this.fallbackValue = String(fallbackValue ?? 'interpolateInferno');
    this.groupOrder = Array.isArray(groupOrder) && groupOrder.length ? [...groupOrder] : [...DEFAULT_GROUP_ORDER];
    this.formatDisplay = typeof formatDisplay === 'function'
      ? formatDisplay
      : ((entry, key) => (entry ? `${entry.group}: ${entry.label}` : key));
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.filterStates = new Map();
    this.filters = Array.isArray(filters)
      ? filters
          .filter((filter) => filter && typeof filter.id === 'string' && typeof filter.predicate === 'function')
          .map((filter) => {
            const id = filter.id;
            this.filterStates.set(id, filter.active === true);
            return {
              id,
              label: String(filter.label ?? id),
              title: filter.title != null ? String(filter.title) : '',
              predicate: filter.predicate,
            };
          })
      : [];
    this.value = null;
    this.lastQuery = '';

    this.element = document.createElement('div');
    this.element.className = 'helios-ui-colormap-picker';

    this.display = document.createElement('button');
    this.display.type = 'button';
    this.display.className = 'helios-ui-select helios-ui-colormap-picker__display';
    this.display.dataset.interfaceFocusControl = 'true';

    this.displayLabel = document.createElement('span');
    this.displayLabel.className = 'helios-ui-ellipsis';
    this.display.appendChild(this.displayLabel);

    this.preview = document.createElement('div');
    this.preview.className = 'helios-ui-colormap-picker__preview helios-ui-colormap-thumb';
    this.preview.dataset.interfaceFocusControl = 'true';

    this.popover = document.createElement('div');
    this.popover.className = 'helios-ui-colormap-popover';
    this.popover.hidden = true;

    this.popoverPanel = document.createElement('div');
    this.popoverPanel.className = 'helios-ui-colormap-popover__panel';
    this.popover.appendChild(this.popoverPanel);

    this.popoverHeader = document.createElement('div');
    this.popoverHeader.className = 'helios-ui-colormap-popover__header';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'helios-ui-text helios-ui-colormap-popover__search';
    this.searchInput.placeholder = String(searchPlaceholder ?? 'Search colormaps…');
    this.popoverHeader.appendChild(this.searchInput);

    this.filterBar = document.createElement('div');
    this.filterBar.className = 'helios-ui-colormap-popover__filters';
    this.filterButtons = new Map();
    for (const filter of this.filters) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'helios-ui-colormap-popover__filter';
      button.dataset.interfaceFocusControl = 'true';
      button.textContent = filter.label;
      button.title = filter.title;
      button.dataset.filterId = filter.id;
      button.dataset.active = this.filterStates.get(filter.id) === true ? 'true' : 'false';
      button.setAttribute('aria-pressed', this.filterStates.get(filter.id) === true ? 'true' : 'false');
      button.addEventListener('click', () => {
        this.setFilterActive(filter.id, this.filterStates.get(filter.id) !== true);
      });
      this.filterBar.appendChild(button);
      this.filterButtons.set(filter.id, button);
    }
    this.filterBar.hidden = this.filters.length === 0;
    this.popoverHeader.appendChild(this.filterBar);
    this.popoverPanel.appendChild(this.popoverHeader);

    this.popoverList = document.createElement('div');
    this.popoverList.className = 'helios-ui-colormap-popover__list';
    this.popoverPanel.appendChild(this.popoverList);

    this.element.appendChild(this.display);
    this.element.appendChild(this.preview);
    this._ensurePortalRoot();

    this.cleanups = [];
    this.thumbObserver = null;

    this.addCleanup(() => this.popover.remove());

    const onDocPointerDown = (event) => {
      const target = event.target;
      if (this.popover.hidden) return;
      if (target && (this.popover.contains(target) || this.element.contains(target))) return;
      this.closePopover();
    };

    let pendingPosition = false;
    const schedulePosition = () => {
      if (pendingPosition) return;
      pendingPosition = true;
      requestAnimationFrame(() => {
        pendingPosition = false;
        this.positionPopover();
      });
    };

    const onDocScroll = (event) => {
      if (this.popover.hidden) return;
      const target = event?.target;
      if (target && this.popoverPanel.contains(target)) return;
      schedulePosition();
    };

    const onDisplayClick = () => this.openPopover();
    const onDisplayKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.openPopover();
        return;
      }
      if (event.key && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        this.openPopover({ seedQuery: event.key });
      }
    };

    const onSearchInput = () => {
      this.lastQuery = String(this.searchInput.value ?? '');
      this.renderPopover(this.searchInput.value);
      this.positionPopover();
    };

    const onSearchKeyDown = (event) => {
      if (event.key === 'Escape') {
        this.closePopover();
        this.display.focus();
        return;
      }
      if (event.key === 'Enter' && (this.searchInput.value ?? '').trim()) {
        this.closePopover();
        const typed = String(this.searchInput.value ?? '').trim();
        if (this.catalog.byKey.has(typed)) this.selectValue(typed, { emit: true });
      }
    };

    const onElementFocusOut = () => {
      queueMicrotask(() => {
        if (!this.element.contains(document.activeElement) && !this.popover.contains(document.activeElement)) {
          this.closePopover();
        }
      });
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('scroll', onDocScroll, true);
    window.addEventListener('resize', schedulePosition);
    this.display.addEventListener('click', onDisplayClick);
    this.display.addEventListener('keydown', onDisplayKeyDown);
    this.preview.addEventListener('click', onDisplayClick);
    this.searchInput.addEventListener('input', onSearchInput);
    this.searchInput.addEventListener('keydown', onSearchKeyDown);
    this.element.addEventListener('focusout', onElementFocusOut);

    this.addCleanup(() => document.removeEventListener('pointerdown', onDocPointerDown, true));
    this.addCleanup(() => document.removeEventListener('scroll', onDocScroll, true));
    this.addCleanup(() => window.removeEventListener('resize', schedulePosition));
    this.addCleanup(() => this.display.removeEventListener('click', onDisplayClick));
    this.addCleanup(() => this.display.removeEventListener('keydown', onDisplayKeyDown));
    this.addCleanup(() => this.preview.removeEventListener('click', onDisplayClick));
    this.addCleanup(() => this.searchInput.removeEventListener('input', onSearchInput));
    this.addCleanup(() => this.searchInput.removeEventListener('keydown', onSearchKeyDown));
    this.addCleanup(() => this.element.removeEventListener('focusout', onElementFocusOut));
    this.addCleanup(() => {
      this.thumbObserver?.disconnect?.();
      this.thumbObserver = null;
    });

    this.selectValue(value ?? this.fallbackValue, { emit: false });
  }

  addCleanup(fn) {
    if (typeof fn === 'function') this.cleanups.push(fn);
  }

  _ensurePortalRoot() {
    const nextRoot = this.portalRoot ?? this.element.closest?.('.helios-ui') ?? document.body;
    if (!nextRoot) return;
    if (this.popover.parentElement !== nextRoot) nextRoot.appendChild(this.popover);
  }

  _syncFocusMetadata() {
    const scope = this.element.closest?.('.helios-ui-row') ?? null;
    if (scope) {
      if (!scope.dataset.interfaceFocusScopeId) {
        scope.dataset.interfaceFocusScopeId = `helios-ui-scope-${Math.random().toString(16).slice(2)}`;
      }
      this.popover.dataset.interfaceFocusScopeId = scope.dataset.interfaceFocusScopeId;
    } else {
      delete this.popover.dataset.interfaceFocusScopeId;
    }
    const panelId = this.element.closest?.('.helios-ui-panel')?.dataset?.panelId ?? '';
    if (panelId) this.popover.dataset.interfacePanelId = panelId;
    else delete this.popover.dataset.interfacePanelId;
  }

  resolveEntry(keyRaw) {
    const key = String(keyRaw ?? '').trim();
    if (!key) return null;
    return this.catalog.byKey.get(key) ?? null;
  }

  applySelectionToUi(keyRaw) {
    const key = String(keyRaw ?? '').trim() || this.fallbackValue;
    this.value = key;
    const entry = this.resolveEntry(key);
    const text = this.formatDisplay(entry, key);
    this.displayLabel.textContent = text;
    this.display.title = text;
    this.display.dataset.colormapKey = key;
    const gradient = colormapToCssGradient(key, { samples: 32, alpha: 1 });
    this.preview.style.backgroundImage = gradient ?? fallbackGradient();
  }

  selectValue(keyRaw, { emit = false } = {}) {
    const key = String(keyRaw ?? '').trim() || this.fallbackValue;
    this.applySelectionToUi(key);
    if (emit) this.onChange?.(key);
  }

  setValue(keyRaw) {
    this.selectValue(keyRaw, { emit: false });
  }

  setFilterActive(id, active, { render = true } = {}) {
    if (!this.filterStates.has(id)) return;
    const next = active === true;
    this.filterStates.set(id, next);
    const button = this.filterButtons.get(id);
    if (button) {
      button.dataset.active = next ? 'true' : 'false';
      button.setAttribute('aria-pressed', next ? 'true' : 'false');
    }
    if (render && !this.popover.hidden) {
      this.renderPopover(this.searchInput.value);
      this.positionPopover();
      this.scrollSelectedItemIntoView();
    }
  }

  applyEntryFilters(entries) {
    let filtered = entries;
    for (const filter of this.filters) {
      if (this.filterStates.get(filter.id) !== true) continue;
      filtered = filtered.filter((entry) => {
        try {
          return filter.predicate(entry) === true;
        } catch (_) {
          return false;
        }
      });
    }
    return filtered;
  }

  ensureThumbObserver() {
    if (this.thumbObserver) return this.thumbObserver;
    if (typeof IntersectionObserver !== 'function') return null;

    this.thumbObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target;
        const key = element?.dataset?.colormapKey;
        if (!key) continue;
        if (element.dataset.colormapReady === '1') continue;
        element.dataset.colormapReady = '1';
        const gradient = colormapToCssGradient(key, { samples: 28, alpha: 1 });
        element.style.backgroundImage = gradient ?? fallbackGradient();
        this.thumbObserver.unobserve(element);
      }
    }, { root: this.popoverPanel, rootMargin: '64px' });

    return this.thumbObserver;
  }

  renderPopover(queryRaw) {
    this.popoverList.replaceChildren();

    const query = String(queryRaw ?? '').trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);

    const textMatches = tokens.length
      ? this.catalog.entries.filter((entry) => tokens.every((token) => entry.search.includes(token)))
      : this.catalog.entries;
    const matches = this.applyEntryFilters(textMatches);

    if (!matches.length) {
      const note = document.createElement('div');
      note.className = 'helios-ui-colormap-picker__note';
      note.textContent = 'No matches.';
      this.popoverList.appendChild(note);
      return;
    }

    const matchesByGroup = new Map();
    for (const entry of matches) {
      const list = matchesByGroup.get(entry.group) ?? [];
      list.push(entry);
      matchesByGroup.set(entry.group, list);
    }
    for (const list of matchesByGroup.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label));
    }

    const capPerGroup = tokens.length ? 60 : 5000;
    const capTotal = tokens.length ? 220 : 5000;
    let total = 0;
    const observer = this.ensureThumbObserver();

    for (const group of this.groupOrder) {
      const list = matchesByGroup.get(group);
      if (!list?.length) continue;

      const section = document.createElement('div');
      section.className = 'helios-ui-colormap-section';

      const title = document.createElement('div');
      title.className = 'helios-ui-colormap-section__title';
      title.textContent = group;
      section.appendChild(title);

      const body = document.createElement('div');
      body.className = 'helios-ui-colormap-section__body';

      const visible = list.slice(0, capPerGroup);
      for (const entry of visible) {
        if (total >= capTotal) break;
        total += 1;

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'helios-ui-colormap-picker__item';
        item.dataset.interfaceFocusControl = 'true';
        item.dataset.key = entry.key;
        const selected = entry.key === this.value;
        item.dataset.selected = selected ? 'true' : 'false';
        item.setAttribute('aria-selected', selected ? 'true' : 'false');

        const itemTitle = document.createElement('div');
        itemTitle.className = 'helios-ui-colormap-picker__item-title helios-ui-ellipsis';
        itemTitle.textContent = entry.label;
        itemTitle.title = entry.key;

        const itemThumb = document.createElement('div');
        itemThumb.className = 'helios-ui-colormap-thumb helios-ui-colormap-thumb--small';
        itemThumb.dataset.colormapKey = entry.key;
        itemThumb.dataset.colormapReady = '0';
        itemThumb.style.backgroundImage = thumbPlaceholderGradient();
        observer?.observe?.(itemThumb);

        item.appendChild(itemTitle);
        item.appendChild(itemThumb);
        item.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          this.selectValue(entry.key, { emit: true });
          this.closePopover();
        });

        body.appendChild(item);
      }

      if (list.length > capPerGroup) {
        const note = document.createElement('div');
        note.className = 'helios-ui-colormap-picker__note';
        note.textContent = `Showing ${capPerGroup} of ${list.length} in ${group}.`;
        body.appendChild(note);
      }

      section.appendChild(body);
      this.popoverList.appendChild(section);
      if (total >= capTotal) break;
    }

    if (matches.length > capTotal) {
      const note = document.createElement('div');
      note.className = 'helios-ui-colormap-picker__note';
      note.textContent = `Showing ${capTotal} of ${matches.length}. Refine your search.`;
      this.popoverList.appendChild(note);
    }
  }

  positionPopover() {
    if (this.popover.hidden) return;

    const OFFSET = 6;
    const MARGIN = 10;
    const MIN_HEIGHT = 180;
    const MIN_WIDTH = 240;
    const MAX_WIDTH = 420;
    const MAX_HEIGHT = 420;

    const anchor = this.display.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - anchor.bottom - MARGIN;
    const spaceAbove = anchor.top - MARGIN;
    const spaceRight = vw - anchor.right - MARGIN;
    const spaceLeft = anchor.left - MARGIN;

    const targetW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, anchor.width));
    this.popover.style.width = `${targetW}px`;
    this.popover.style.left = '0px';
    this.popover.style.top = '0px';
    this.popover.hidden = false;
    this.popoverPanel.style.height = '';
    this.popoverPanel.style.maxHeight = '';

    const measured = this.popoverPanel.getBoundingClientRect();
    const desiredW = measured.width || Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, anchor.width));
    const desiredH = this.popoverPanel.scrollHeight || measured.height || MIN_HEIGHT;

    const canVertical = Math.max(spaceBelow, spaceAbove) >= MIN_HEIGHT;
    const preferBelow = spaceBelow >= spaceAbove;
    const canHorizontal = Math.max(spaceRight, spaceLeft) >= MIN_WIDTH;
    const preferRight = spaceRight >= spaceLeft;

    let placement = 'bottom';
    if (canVertical) {
      placement = preferBelow ? 'bottom' : 'top';
    } else if (canHorizontal) {
      placement = preferRight ? 'right' : 'left';
    } else {
      const best = [
        { side: 'bottom', size: spaceBelow },
        { side: 'top', size: spaceAbove },
        { side: 'right', size: spaceRight },
        { side: 'left', size: spaceLeft },
      ].sort((a, b) => b.size - a.size)[0];
      placement = best?.side ?? 'bottom';
    }

    let left = anchor.left;
    let top = anchor.bottom + OFFSET;

    if (placement === 'top') {
      top = Math.max(MARGIN, anchor.top - OFFSET - Math.min(desiredH, Math.max(80, spaceAbove)));
    } else if (placement === 'right') {
      left = anchor.right + OFFSET;
      top = anchor.top;
    } else if (placement === 'left') {
      left = Math.max(MARGIN, anchor.left - OFFSET - desiredW);
      top = anchor.top;
    }

    left = Math.max(MARGIN, Math.min(vw - MARGIN - desiredW, left));
    top = Math.max(MARGIN, Math.min(vh - MARGIN - 80, top));

    this.popover.style.width = `${Math.min(desiredW, vw - 2 * MARGIN)}px`;
    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;

    const bottomLimit = placement === 'top' ? Math.max(MARGIN, anchor.top - OFFSET) : vh - MARGIN;
    const availableH = Math.max(120, bottomLimit - top);
    const stableH = Math.min(MAX_HEIGHT, availableH);
    this.popoverPanel.style.height = `${stableH}px`;
    this.popoverPanel.style.maxHeight = `${stableH}px`;
    this.popoverList.style.maxHeight = '';
  }

  openPopover({ seedQuery } = {}) {
    this._ensurePortalRoot();
    this._syncFocusMetadata();
    this.popover.hidden = false;
    this.searchInput.value = seedQuery != null ? String(seedQuery) : this.lastQuery;
    this.lastQuery = this.searchInput.value;
    this.renderPopover(this.searchInput.value);
    this.positionPopover();
    this.scrollSelectedItemIntoView();
    queueMicrotask(() => this.searchInput.focus());
  }

  closePopover() {
    this.popover.hidden = true;
    this.lastQuery = String(this.searchInput.value ?? '');
  }

  scrollSelectedItemIntoView() {
    const selected = this.popoverList.querySelector('.helios-ui-colormap-picker__item[data-selected="true"]');
    if (!selected) return;
    requestAnimationFrame(() => {
      selected.scrollIntoView({ block: 'nearest' });
    });
  }

  destroy() {
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        // ignore
      }
    }
    this.element.remove();
  }
}

export default ColormapPickerControl;
