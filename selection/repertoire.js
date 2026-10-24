import {preferencesStore as store,STATUS_LABELS,currentProgramSnapshot} from './preferences-store.mjs?v=20261022-release';
const $=s=>document.querySelector(s), make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
let snapshot=store.getSnapshot(),catalog=null,rows=new Map(),reviewing=false,catalogScroll=0,category='',categories=[];
const search=$('#song-search'),clear=$('#search-clear'),marked=$('#only-marked');
const controlsLocked=()=>snapshot.locked;
function choices(song,review=false){
 const group=make('div',undefined,'rep-song-choices');group.setAttribute('role','group');group.setAttribute('aria-label',`Пожелание: ${song.title}, ${song.artist||'Исполнитель не указан'}`);
 for(const [status,title]of Object.entries(STATUS_LABELS)){
  const button=make('button',title,'rep-status-choice');button.type='button';button.dataset.song=song.id;button.dataset.status=status;button.dataset.review=String(review);button.setAttribute('aria-pressed','false');group.append(button);
 }return group;
}
function initialize(){
 catalog=store.getCatalog();rows.clear();const list=$('#song-list-all'),existing=new Map([...list.children].map(e=>[e.dataset.songId,e])),fragment=document.createDocumentFragment();
 for(const [index,song]of catalog.lineups.all.songs.entries()){
  let row=existing.get(song.id);
  if(!row){row=make('li',undefined,'rep-song-row');row.dataset.songId=song.id;const info=make('div',undefined,'rep-song-info');info.append(make('span','','rep-song-number'),make('h3'),make('span','','rep-song-artist'));row.append(info,make('div','','rep-choice-host'));}
  row.querySelector('.rep-song-number').textContent=String(index+1).padStart(2,'0');row.querySelector('h3').textContent=song.title;row.querySelector('.rep-song-artist').textContent=song.artist||'Исполнитель не указан';row.querySelector('.rep-choice-host').replaceChildren(choices(song));rows.set(song.id,row);fragment.append(row);
 }
 list.replaceChildren(fragment);search.disabled=false;$('#catalog-loading').hidden=true;$('#catalog-error').hidden=true;document.documentElement.dataset.repertoireReady='true';document.documentElement.classList.add('repertoire-ready');
}
function applyFilter(){
 if(!catalog)return;const terms=normalize(search.value).split(/\s+/).filter(Boolean),ids=categories.find(c=>c.id===category)?.songIds;let visible=0;
 for(const song of catalog.lineups.all.songs){const row=rows.get(song.id);row.hidden=!terms.every(t=>normalize(`${song.title} ${song.artist||''}`).includes(t))||(marked.checked&&store.getStatus('all',song.id)==='maybe')||(ids&&!ids.includes(song.id));if(!row.hidden)visible++;}
 clear.hidden=!search.value;
 $('#search-status').textContent=(terms.length||marked.checked||category)?(visible?`Показано песен: ${visible}`:'Ничего не найдено. Попробуйте другое название, исполнителя или категорию.'):'';
 $('#list-title').textContent=categories.find(c=>c.id===category)?.title||'Все песни';
 for(const button of $('#client-categories').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.category===category));
}
function updateChoices(root){for(const button of root.querySelectorAll('.rep-status-choice')){button.setAttribute('aria-pressed',String(store.getStatus('all',button.dataset.song)===button.dataset.status));button.disabled=controlsLocked();}}
function renderReview(){
 const active=document.activeElement,focus=active?.matches('#selection-review .rep-status-choice')?{id:active.dataset.song,status:active.dataset.status}:null;
 const content=$('#review-groups'),fragment=document.createDocumentFragment();
 for(const [status,title]of Object.entries(STATUS_LABELS)){
  const songs=snapshot.selected.filter(s=>s.status===status);if(!songs.length)continue;
  const group=make('section',undefined,'rep-review-group'),heading=make('h3',`${title} · ${songs.length}`),list=make('ul',undefined,'rep-review-list');group.append(heading,list);
  for(const song of songs){const row=make('li',undefined,'rep-song-row');row.dataset.songId=song.id;row.dataset.status=status;const info=make('div',undefined,'rep-song-info');info.append(make('h4',song.title),make('span',song.artist||'Исполнитель не указан','rep-song-artist'));row.append(info,choices(song,true));list.append(row);}fragment.append(group);
 }
 content.replaceChildren(fragment);$('#review-empty').hidden=!!snapshot.selected.length;updateChoices(content);
 if(focus){const target=[...content.querySelectorAll('button')].find(b=>b.dataset.song===focus.id&&b.dataset.status===focus.status)||content.querySelector('button')||$('#back-to-catalog');target.focus({preventScroll:true});}
}
function renderDeprecated(){const section=$('#deprecated-section');section.hidden=!snapshot.deprecated.length;const list=$('#deprecated-songs');list.replaceChildren();for(const song of snapshot.deprecated){const item=make('li'),label=make('span',`${song.title||song.id} · ${STATUS_LABELS[song.status]}`),button=make('button','Снять отметку','rep-text-button');button.type='button';button.dataset.removeSong=song.id;button.dataset.program=song.program;button.disabled=controlsLocked();item.append(label,button);list.append(item);}}
function refresh(value){
 snapshot=value;if(snapshot.ready&&(!catalog||catalog.version!==snapshot.catalogVersion||rows.size!==snapshot.maxSelections))initialize();
 if(snapshot.catalogError&&!snapshot.ready){$('#catalog-loading').hidden=true;$('#catalog-error').hidden=false;}
 $('#companion-total').textContent=snapshot.maxSelections;$('#selected-total').textContent=snapshot.changedCount;
 for(const status of Object.keys(STATUS_LABELS))$('#count-'+status).textContent=snapshot.counts[status];
 for(const [id,row]of rows){row.dataset.status=store.getStatus('all',id)||'';updateChoices(row);}
 $('#reset-open').disabled=controlsLocked()||!(snapshot.changedCount+snapshot.deprecated.length);
 if(reviewing)renderReview();applyFilter();renderDeprecated();syncOffsets();
}
function syncOffsets(){const panel=$('#repertoire-companion'),height=panel.getBoundingClientRect().height;document.documentElement.style.setProperty('--rep-companion-height',`${height}px`);}
new ResizeObserver(syncOffsets).observe($('#repertoire-companion'));addEventListener('resize',syncOffsets,{passive:true});
// Native focus scrolling may put a row under the compact sticky summary.
document.addEventListener('focusin',event=>{
 const target=event.target;if(!target.closest('.rep-main-column'))return;
 requestAnimationFrame(()=>{
  if(document.activeElement!==target||!matchMedia('(max-width:1040px)').matches)return;
  const panel=$('#repertoire-companion');if(getComputedStyle(panel).position!=='sticky')return;
  const bounds=panel.getBoundingClientRect(),field=target.getBoundingClientRect();
  if(bounds.top<=1&&field.top<bounds.bottom+16)scrollBy({top:field.top-bounds.bottom-16,behavior:'instant'});
 });
});
// The review is another view of this same store, never a second selection.
function review(){catalogScroll=scrollY;reviewing=true;$('#songs').hidden=true;$('#selection-review').hidden=false;$('.rep-request').hidden=false;$('.rep-send-link').hidden=true;document.body.classList.add('is-reviewing');renderReview();$('#selection-review').scrollIntoView({block:'start',behavior:'instant'});$('#review-title').focus({preventScroll:true});}
function back(){reviewing=false;$('#songs').hidden=false;$('#selection-review').hidden=true;$('.rep-request').hidden=true;$('.rep-send-link').hidden=false;document.body.classList.remove('is-reviewing');scrollTo({top:catalogScroll,behavior:'instant'});search.focus({preventScroll:true});}
$('.rep-send-link').addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;event.preventDefault();review();});$('#back-to-catalog').addEventListener('click',back);
document.addEventListener('click',event=>{
 const button=event.target.closest('.rep-status-choice');if(button){const id=button.dataset.song,old=store.getStatus('all',id);store.setStatus('all',id,old===button.dataset.status?null:button.dataset.status);const counts=snapshot.counts;$('#wishes-status').textContent=`Очень хочу: ${counts.want}, можно: ${counts.maybe}, не надо: ${counts.skip}`;if(!reviewing&&rows.get(id)?.hidden){const next=[...rows.values()].find(r=>!r.hidden)?.querySelector('button')||search;next.focus({preventScroll:true});}return;}
 const remove=event.target.closest('[data-remove-song]');if(remove){store.setStatus(remove.dataset.program,remove.dataset.removeSong,null);$('#deprecated-section').hidden?search.focus({preventScroll:true}):$('#deprecated-songs button')?.focus({preventScroll:true});}
});
search.addEventListener('input',applyFilter);clear.addEventListener('click',()=>{search.value='';applyFilter();search.focus();});search.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();clear.click();}});marked.addEventListener('change',applyFilter);
$('#client-categories').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(button){category=button.dataset.category;applyFilter();}});
$('#reset-open').addEventListener('click',()=>{
 store.clearMarks();
 $('#reset-status').textContent='Изменения сброшены.';
 if($('#reset-open').disabled)search.focus({preventScroll:true});
});
$('#retry-catalog').addEventListener('click',()=>{store.reloadCatalog();});
try{const response=await fetch('catalog-categories.json');if(!response.ok)throw Error();categories=await response.json();const nav=$('#client-categories');for(const c of [{id:'',title:'Все категории'},...categories]){const button=make('button',c.title);button.type='button';button.dataset.category=c.id;button.setAttribute('aria-pressed',String(!c.id));nav.append(button);}}catch{$('#client-categories').hidden=true;}
store.subscribe(refresh);refresh(store.getSnapshot());store.ready.then(()=>refresh(store.getSnapshot()));
