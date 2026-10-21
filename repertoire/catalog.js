const search=document.querySelector('#catalog-search');
const clear=document.querySelector('#catalog-clear');
const status=document.querySelector('#catalog-status');
const normalize=value=>value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
const sections=[...document.querySelectorAll('.rep-section')].map(section=>({section,rows:[...section.querySelectorAll('.rep-song')].map(row=>({row,text:normalize(row.textContent)}))}));
function filter(){
 const terms=normalize(search.value).split(/\s+/).filter(Boolean);let count=0;
 for(const {section,rows} of sections){let visible=0;for(const {row,text} of rows){row.hidden=!terms.every(term=>text.includes(term));if(!row.hidden)visible++;}section.hidden=!visible;count+=visible;document.querySelector(`.b-category-links a[href="#${section.id}"]`).hidden=!visible;}
 clear.hidden=!search.value;
 status.textContent=terms.length?(count?`Найдено песен: ${count}`:'Ничего не найдено. Попробуйте другое название или исполнителя.'):'Все 210 песен';
}
search.addEventListener('input',filter);
clear.addEventListener('click',()=>{search.value='';filter();search.focus();});
search.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();clear.click();}});
filter();
