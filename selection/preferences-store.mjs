const moduleLocation = new URL(import.meta.url);
const storagePath = /^https?:$/.test(moduleLocation.protocol) ? new URL('.', moduleLocation).pathname : '/';
const storagePrefix = storagePath === '/' ? 'bogema:preferences' : 'bogema:' + storagePath + ':preferences';
export const STORAGE_KEY = storagePrefix + ':v6';
export const PREVIOUS_STORAGE_KEY = storagePrefix + ':v5';
export const LEGACY_STORAGE_KEY = storagePrefix + ':v3';
export const STATUS_LABELS = Object.freeze({ want: 'Очень хочу', maybe: 'Можно', skip: 'Не надо' });
export const PROGRAMS = Object.freeze(['all']);
const PROGRAM_LABELS = { all: 'Репертуар' };
const clone = value => JSON.parse(JSON.stringify(value));
const validID = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const keyFor = (program, id) => `${program}:${id}`;
const emptyCount = () => ({ total: 0, want: 0, maybe: 0, skip: 0 });
export const DEFAULT_STATUS = 'maybe';

export function validateCatalog(value) {
  if (typeof value?.version !== 'string') throw new Error('catalog-version');
  for (const program of PROGRAMS) {
    const lineup = value.lineups?.[program];
    if (!lineup || typeof lineup.label !== 'string' || !Array.isArray(lineup.songs) || !lineup.songs.length) throw new Error('catalog-program');
    const ids = new Set();
    for (const song of lineup.songs) {
      if (!validID(song.id) || ids.has(song.id) || typeof song.title !== 'string' || !song.title.trim() || !(song.artist === null || typeof song.artist === 'string') || !Array.isArray(song.aliases)) throw new Error('catalog-song');
      ids.add(song.id);
    }
  }
  return value;
}

export function createPreferencesStore({ catalog = null, storage = null, search = '' } = {}) {
  let data = catalog ? validateCatalog(clone(catalog)) : null;
  let program = 'all', catalogError = false;
  let records = new Map(), unavailable = new Set(), urlWarning = '', migrating = false, legacyProgram = 'group';
  const listeners = new Set();
  const pendingEdits = new Set();
  let pendingRecords=null, observedRaw=null, externalConflict=false, locked=false;
  const storageState = { read: 'unavailable', write: 'untested', message: '' };
  let catalogVersion = data?.version || null;
  let catalogRequest = null;
  const lookup = (programID, id) => PROGRAMS.includes(programID) ? data?.lineups?.[programID]?.songs.find(song => song.id === id) : undefined;

  function storageMessage() {
    const issues = [];
    if (storageState.read === 'blocked' || storageState.read === 'unavailable') issues.push('Сохранение недоступно: пожелания работают только на этой открытой странице и могут потеряться после обновления или перехода, не закрывайте страницу до завершения работы');
    if (storageState.read === 'corrupt') issues.push('Сохранённые данные не удалось восстановить, но вы можете заново отметить песни на этой странице');
    if (storageState.read === 'unsupported') issues.push('Версия сохранённых данных не поддерживается, поэтому пожелания не перенесены автоматически');
    if (storageState.read === 'partial') issues.push('Часть сохранённых данных не удалось восстановить, проверьте пожелания');
    if (storageState.write === 'blocked' && !['blocked', 'unavailable'].includes(storageState.read)) issues.push('Браузер не сохранил последние изменения, выбор пока доступен только на этой странице');
    if(externalConflict)issues.push('Сохранённый выбор изменился в другой вкладке. Здесь остаётся ваш текущий выбор; он больше не перезаписывает сохранённый.');
    storageState.message = issues.join('\n');
  }
  function readSaved() {
    if (!storage) { storageState.read = 'unavailable'; storageMessage(); return false; }
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY); observedRaw=raw; migrating = false;
      if (raw === null) { raw = storage.getItem(PREVIOUS_STORAGE_KEY); migrating = raw !== null; }
      if (raw === null) { raw = storage.getItem(LEGACY_STORAGE_KEY); migrating = raw !== null; }
      storageState.read = 'ok';
    } catch { storageState.read = 'blocked'; storageMessage(); return false; }
    if (raw === null) { records = new Map(); program = 'all'; storageMessage(); return true; }
    let saved;
    try { saved = JSON.parse(raw); } catch { storageState.read = 'corrupt'; storageMessage(); return false; }
    if (!saved || !(migrating ? [3, 5] : [6]).includes(saved.schema)) { storageState.read = 'unsupported'; storageMessage(); return false; }
    let invalid = 0;
    const restored = new Map();
    if (!Array.isArray(saved.marks)) invalid++;
    for (const mark of Array.isArray(saved.marks) ? saved.marks : []) {
      if (!mark || !validID(mark.program) || !validID(mark.id) || !Object.hasOwn(STATUS_LABELS, mark.status)) { invalid++; continue; }
      // A saved maybe already matches the baseline; keep only meaningful overrides.
      if (mark.status === DEFAULT_STATUS) continue;
      const key = keyFor(mark.program, mark.id);
      if (restored.has(key)) { invalid++; continue; }
      const snapshot = {};
      for (const field of ['title', 'artist', 'programLabel']) {
        const value = mark.snapshot?.[field];
        if (typeof value === 'string' && value.length <= 2000) snapshot[field] = value;
        else if (field === 'artist' && value === null) snapshot.artist = null;
        else if (value !== undefined) invalid++;
      }
      restored.set(key, { program: mark.program, id: mark.id, status: mark.status, snapshot });
    }
    pendingRecords = restored.size ? restored : null;
    records = new Map();
    program = 'all';
    if (migrating) legacyProgram = saved.program === 'trio' ? 'trio' : 'group';
    else if (saved.program !== undefined && saved.program !== 'all') invalid++;
    if (typeof saved.catalogVersion === 'string') catalogVersion = saved.catalogVersion;
    storageState.read = invalid ? 'partial' : 'ok';
    storageMessage();
    return true;
  }
  function migrateRecords() {
    if (pendingRecords || !migrating || !data || !['ok', 'partial'].includes(storageState.read)) return;
    const aliases = new Map();
    for (const song of data.lineups.all.songs) for (const key of song.legacyKeys || []) aliases.set(key, song);
    const converted = new Map();
    let conflicts = false;
    // Prefer the last active legacy list when it disagrees with the other list.
    const marks = [...records.values()].sort((a,b) => Number(b.program === legacyProgram) - Number(a.program === legacyProgram));
    marks.forEach((mark, index) => {
      const song = aliases.get(keyFor(mark.program, mark.id));
      const id = song?.id || `legacy-${index}-${mark.id}`.slice(0,120);
      const key = keyFor('all', id);
      if (converted.has(key)) { if (converted.get(key).status !== mark.status) conflicts = true; return; }
      converted.set(key, {program:'all', id, status:mark.status, snapshot:{title:song?.title || mark.snapshot?.title || null, artist:song?.artist ?? mark.snapshot?.artist ?? null, programLabel:'Репертуар'}});
    });
    records = converted; program = 'all'; migrating = false;
    if (conflicts) urlWarning = 'Сохранённые пожелания объединены. Для песен с разными отметками оставлен выбор из последнего открытого списка, проверьте его';
    // Conversion is in memory only after explicit restoration; old keys stay intact.
  }
  function applySearch() { program = 'all'; }
  function persist() {
    // Wait for the identity map before replacing a legacy draft. Keep its old key for rollback.
    if (pendingRecords || externalConflict || (migrating && !data)) return;
    if (!storage || storageState.read === 'blocked' || storageState.read === 'unavailable') { storageState.write = 'blocked'; storageMessage(); return; }
    if(['corrupt','unsupported'].includes(storageState.read)){storageState.write='blocked';storageMessage();return;}
    const saved = { schema: 6, explicitStatuses:true, program, catalogVersion: data?.version || catalogVersion, marks: [...records.values()] };
    try {
      if(storage.getItem(STORAGE_KEY)!==observedRaw){externalConflict=true;storageMessage();return;}
      const serialized=JSON.stringify(saved);storage.setItem(STORAGE_KEY, serialized);observedRaw=serialized;storageState.write = 'ok';
      // Previous keys stay intact so rolling back the website also restores its drafts.
    } catch { storageState.write = 'blocked'; }
    storageMessage();
  }
  function getSnapshot() {
    const selected = [], deprecated = [];
    const counts = { ...emptyCount(), deprecated: 0, byProgram: { all: emptyCount() } };
    if (data) for (const programID of PROGRAMS) for (const song of data.lineups[programID].songs) {
      const key = keyFor(programID, song.id);
      if (unavailable.has(key)) continue;
      const status = records.get(key)?.status || DEFAULT_STATUS;
      selected.push({ program: programID, id: song.id, status, title: song.title, artist: song.artist, programLabel: data.lineups[programID].label });
      counts.total++; counts[status]++; counts.byProgram[programID].total++; counts.byProgram[programID][status]++;
    }
    if (data) for (const [key, mark] of records) {
      if (lookup(mark.program, mark.id) && !unavailable.has(key)) continue;
      const current = lookup(mark.program, mark.id);
      deprecated.push({ key, program: mark.program, id: mark.id, status: mark.status, title: current?.title || mark.snapshot?.title || null, artist: current?.artist ?? mark.snapshot?.artist ?? null, programLabel: (PROGRAMS.includes(mark.program) ? data.lineups[mark.program].label : null) || mark.snapshot?.programLabel || (PROGRAMS.includes(mark.program) ? PROGRAM_LABELS[mark.program] : null) || `Программа ${mark.program}` });
    }
    counts.deprecated = deprecated.length;
    return clone({ ready: !!data, catalogError, catalogVersion: data?.version || catalogVersion, program, selected, deprecated, maxSelections: data ? PROGRAMS.reduce((n, key) => n + data.lineups[key].songs.filter(song => !unavailable.has(keyFor(key, song.id))).length, 0) : 0, counts, changedCount: counts.want + counts.skip, storage: storageState, urlWarning, locked, draft:{pending:!!pendingRecords,count:pendingRecords?.size||0,edited:!!pendingRecords&&pendingEdits.size>0,externalConflict} });
  }
  function notify() { const snapshot = getSnapshot(); for (const callback of listeners) callback(snapshot); }
  function changed() { persist(); notify(); }
  readSaved();
  // Resume the local selection without introducing a draft-management step.
  if(pendingRecords){records=pendingRecords;pendingRecords=null;}
  applySearch(search); migrateRecords();
  const api = {
    getSnapshot,
    getCatalog: () => { if (!data) return null; const copy = clone(data); for (const key of PROGRAMS) copy.lineups[key].songs = copy.lineups[key].songs.filter(song => !unavailable.has(keyFor(key, song.id))); return copy; },
    getStatus: (programID, id) => lookup(programID, id) && !unavailable.has(keyFor(programID, id)) ? records.get(keyFor(programID, id))?.status || DEFAULT_STATUS : null,
    setLocked(value){if(locked===!!value)return;locked=!!value;notify();},
    restoreSaved(){
      if(locked||!pendingRecords)return;
      // Explicit restoration must not replace choices made on the current page.
      const edits = new Map([...pendingEdits].map(key=>[key,records.get(key)||null]));
      records=pendingRecords;pendingRecords=null;migrateRecords();
      for(const [key,mark] of edits) { if(mark)records.set(key,mark);else records.delete(key); }
      pendingEdits.clear();
      if(edits.size)changed();else notify();
    },
    startNew(){
      if(locked)return;
      // Confirmed replacement keeps the fresh selection the visitor just made.
      if(!pendingRecords)records=new Map();
      pendingRecords=null;pendingEdits.clear();migrating=false;changed();
    },
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    setProgram(value) { if (!PROGRAMS.includes(value)) throw new Error('Unknown program'); program = value; urlWarning = ''; changed(); },
    applyUrl(value) { applySearch(value); notify(); },
    setStatus(programID, id, status) {
      if(locked)return;
      const key = keyFor(programID, id);
      if(pendingRecords)pendingEdits.add(key);
      if (status === null) { records.delete(key); changed(); return; }
      if (!['want', 'maybe', 'skip'].includes(status)) throw new Error('Unknown status');
      const song = lookup(programID, id);
      if (!song || unavailable.has(key)) throw new Error('Song unavailable');
      if (status === DEFAULT_STATUS) { records.delete(key); changed(); return; }
      records.set(key, { program: programID, id, status, snapshot: { title: song.title, artist: song.artist, programLabel: data.lineups[programID].label } });
      changed();
    },
    clearMarks(programID = null) {
      if(locked)return;
      if(pendingRecords)for(const [key,mark] of records)if(programID===null||mark.program===programID)pendingEdits.add(key);
      if (programID === null) records.clear();
      else for (const [key, mark] of records) if (mark.program === programID) records.delete(key);
      changed();
    },
    markUnavailable(items) { for (const item of items) if (validID(item?.program) && validID(item?.id)) unavailable.add(keyFor(item.program, item.id)); notify(); },
    refreshFromStorage() {
      if(!storage)return;
      try{if(storage.getItem(STORAGE_KEY)!==observedRaw){externalConflict=true;storageMessage();notify();}}catch{storageState.read='blocked';storageMessage();notify();}
    },
    setCatalog(value) { data = validateCatalog(clone(value)); catalogVersion = data.version; catalogError = false; unavailable.clear(); migrateRecords(); notify(); },
    loadCatalog(loader) {
      if (catalogRequest) return catalogRequest;
      catalogError = false;
      catalogRequest = Promise.resolve().then(loader).then(value => { api.setCatalog(value); return getSnapshot(); }).catch(() => { catalogError = true; notify(); return getSnapshot(); }).finally(() => { catalogRequest = null; });
      return catalogRequest;
    },
    ready: Promise.resolve(),
  };
  api.ready = Promise.resolve(getSnapshot());
  return api;
}

export function currentProgramSnapshot(snapshot) {
  const selected = (snapshot.selected || []).filter(item => item.program === snapshot.program);
  const deprecated = (snapshot.deprecated || []).filter(item => item.program === snapshot.program);
  return {...snapshot, selected, deprecated};
}
export function formatPreferences(snapshot, { includeDeprecated = true } = {}) {
  snapshot = currentProgramSnapshot(snapshot);
  const lines = ['БОГЕМА: МУЗЫКАЛЬНЫЕ ПОЖЕЛАНИЯ', 'Итоговую программу согласуем отдельно'];
  const selected = (snapshot.selected || []).filter(item => ['want', 'maybe', 'skip'].includes(item.status));
  if (!selected.length) lines.push('', 'Изменений по актуальным песням нет');
  for (const program of PROGRAMS) {
    const records = selected.filter(item => item.program === program);
    if (!records.length) continue;
    lines.push('');
    for (const status of ['want', 'maybe', 'skip']) {
      const songs = records.filter(item => item.status === status);
      if (!songs.length) continue;
      lines.push(`${STATUS_LABELS[status].toLocaleUpperCase('ru')} (${songs.length})`);
      songs.forEach((song, index) => lines.push(`${index + 1}. ${song.title}, ${song.artist || 'Исполнитель не указан'}`));
    }
  }
  if (includeDeprecated && snapshot.deprecated?.length) {
    lines.push('', 'НЕДОСТУПНЫ В ТЕКУЩЕМ РЕПЕРТУАРЕ: НЕ ПРИКРЕПЛЯЮТСЯ К ЗАЯВКЕ');
    snapshot.deprecated.forEach(song => lines.push(`${song.programLabel} · ${STATUS_LABELS[song.status]}: ${song.title || `Название восстановить не удалось (${song.id})`}, ${song.artist || 'Исполнитель не указан'}`));
  }
  return `${lines.join('\n')}\n`;
}
export function formatFullCatalog(catalog, program, selected = []) {
  const lineup = catalog?.lineups?.[program];
  if (!lineup) return '';
  const marks = new Map(selected.filter(item => item.program === program).map(item => [item.id, item.status]));
  return ['БОГЕМА: ПОЛНЫЙ РЕПЕРТУАР', `Версия: ${catalog.version}`, `Песен: ${lineup.songs.length}\nИтоговую программу согласуем отдельно`, '', ...lineup.songs.map((song, index) => `${index + 1}. ${song.title}, ${song.artist || 'Исполнитель не указан'} [${(STATUS_LABELS[marks.get(song.id) || DEFAULT_STATUS])}]`), ''].join('\n');
}
let browserStorage = null;
try { if (typeof window !== 'undefined') browserStorage = globalThis.localStorage || null; } catch { browserStorage = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } }; }
export const preferencesStore = createPreferencesStore({ storage: browserStorage, search: globalThis.location?.search || '' });
if (typeof window !== 'undefined') {
  const load = async () => {
    const response = await fetch(new URL('./data.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Catalog unavailable');
    return response.json();
  };
  preferencesStore.ready = preferencesStore.loadCatalog(load);
  preferencesStore.reloadCatalog = () => preferencesStore.loadCatalog(load);
  window.addEventListener('popstate', () => preferencesStore.applyUrl(window.location.search));
  window.addEventListener('pageshow', event => { if (event.persisted) preferencesStore.refreshFromStorage(window.location.search); });
  window.addEventListener('storage', event => { if ([STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY, null].includes(event.key)) preferencesStore.refreshFromStorage(window.location.search); });
}
