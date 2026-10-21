/* Contact details stay in memory. Only song changes are saved by the separate store. */
(() => {
  'use strict';
  if(window.bogemaForms)return;
  const scriptURL=document.currentScript?.src||document.querySelector('script[src$="forms.js"]')?.src||new URL('forms.js',document.baseURI).href;
  const blank=()=>({name:'',phone:'',preferredChannel:'',date:'',consent:false});
  let repertoire=false;
  let draft=blank(),phase='loading',notice='',prepared=null,attempt=null,lastRequestId='';
  let contract,store,currentProgramSnapshot,controller,excludeConfirmed='',confirmExclusion=false;
  let config={mode:'unavailable',enabled:false,endpoint:null,statusEndpoint:null};
  const editable=()=>phase==='draft';
  const frozen=()=>['pending','rejected','catalog_changed','uncertain','partial'].includes(phase);
  const snap=()=>(store?currentProgramSnapshot(store.getSnapshot()):null)||{ready:false,selected:[],deprecated:[],counts:{want:0,skip:0}};
  const q=selector=>controller.form.querySelector(selector);
  const exclusionKey=()=>JSON.stringify([snap().catalogVersion,snap().selected.map(({program,id,status})=>[program,id,status]),snap().deprecated.map(({program,id,status})=>[program,id,status])]);
  function render(){if(controller)controller.render();}
  function error(name,message=''){
    const field=controller.fields[name],label=q('[data-error="'+name+'"]');
    if(!field||!label)return;
    field.setAttribute('aria-invalid',message?'true':'false');label.textContent=message;label.hidden=!message;
  }
  function focusName(){controller.fields.name.focus({preventScroll:true});}
  function changed(){if(!editable())return;notice='';prepared=null;confirmExclusion=false;excludeConfirmed='';render();}
  async function loadConfig(){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
    try{
      const response=await fetch(new URL('forms-config.json',scriptURL),{credentials:'same-origin',cache:'no-cache',signal:abort.signal});
      if(!response.ok)throw new Error();
      return contract.endpointConfig(await response.json(),scriptURL);
    }catch{return {mode:'unavailable',enabled:false,endpoint:null,statusEndpoint:null};}
    finally{clearTimeout(timer);}
  }
  function mount(host){
    repertoire=host.dataset.source==='repertoire';
    const submitLabel=repertoire?'Отправить пожелания':'Связаться со мной';
    const wishesHref='#songs';
    const form=document.createElement('form');form.className='bf-form';form.noValidate=true;form.setAttribute('aria-label',submitLabel);
    form.addEventListener('submit',event=>{event.preventDefault();submit();});
    form.innerHTML=`<div class="bf-root">
      <div class="bf-editable-fields">
        <div class="bf-fields">
          <div class="bf-field"><label for="bf-name">Имя</label><input id="bf-name" name="name" type="text" autocomplete="name" required maxlength="80" aria-describedby="bf-name-error"><p class="bf-field-error" id="bf-name-error" data-error="name" hidden></p></div>
          <div class="bf-field"><label for="bf-phone">Телефон</label><input id="bf-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="50" placeholder="+7 (___) ___-__-__" aria-describedby="bf-phone-error"><p class="bf-field-error" id="bf-phone-error" data-error="phone" hidden></p></div>
        </div>
        ${repertoire?`<section class="bf-exclusion" tabindex="-1" hidden aria-labelledby="bf-exclusion-heading"><h4 id="bf-exclusion-heading">Некоторые песни больше недоступны</h4><p>Они останутся в сохранённых пожеланиях, но не попадут в заявку<br>Продолжить без них?</p><div class="bf-recovery"><button class="bf-secondary bf-exclude" type="button">Отправить без недоступных</button><a class="bf-text-button" href="${wishesHref}">Вернуться к пожеланиям</a><button class="bf-text-button bf-exclude-cancel" type="button">Назад к форме</button></div></section>`:''}
      </div>
      <div class="bf-consent"><label class="bf-check"><input id="bf-consent" name="consent" type="checkbox" required aria-describedby="bf-consent-error"><span>Я соглашаюсь с политикой конфиденциальности и даю согласие на обработку персональных данных</span></label><p class="bf-field-error" id="bf-consent-error" data-error="consent" hidden></p></div>
      <p class="bf-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <p class="bf-request-id" hidden></p>
      <button class="bf-primary" type="submit" disabled>${submitLabel}</button>
      <div class="bf-recovery"><button class="bf-secondary bf-retry" type="button" hidden>Повторить отправку</button><button class="bf-secondary bf-check-status" type="button" hidden>Проверить результат</button><button class="bf-secondary bf-edit" type="button" hidden>Изменить данные</button></div>
      <section class="bf-confirmation" tabindex="-1" hidden><h3 class="bf-confirmation-title">${repertoire?"Пожелания отправлены":"Заявка отправлена"}</h3><p>${repertoire?"Спасибо! Свяжемся с вами, чтобы обсудить выбранные песни и согласовать программу":"Спасибо! Свяжемся с вами, чтобы обсудить выступление и подтвердить дату"}</p><button class="bf-secondary bf-new" type="button">${repertoire?"Отправить ещё":"Новая заявка"}</button></section>
    </div>`;
    host.replaceChildren(form);
    const fields=Object.fromEntries(['name','phone','preferredChannel','date','consent'].map(name=>[name,form.elements.namedItem(name)]).filter(([,field])=>field));
    controller={form,fields,render(){
      const snapshot=snap(),locked=!editable(),success=['accepted','delivered'].includes(phase);
      form.dataset.state=phase;form.dataset.mode=config.mode;form.dataset.deliveryEnabled=String(config.enabled);
      form.setAttribute('aria-busy',String(phase==='pending'));
      if(repertoire&&store?.setLocked)store.setLocked(frozen());
      for(const name of Object.keys(fields)){if(name==='consent')fields[name].checked=draft[name];else if(fields[name].value!==draft[name])fields[name].value=draft[name];fields[name].disabled=locked;}
      q('.bf-editable-fields').hidden=success;
      q('.bf-consent').hidden=success;
      if(repertoire){
        q('.bf-exclusion').hidden=!confirmExclusion||!editable();
      }
      q('.bf-status').textContent=notice;
      q('.bf-status').hidden=!notice;
      q('.bf-primary').disabled=!editable()||confirmExclusion;
      q('.bf-primary').textContent=phase==='pending'?'Отправляем':submitLabel;
      q('.bf-primary').hidden=success||['rejected','catalog_changed','uncertain','partial'].includes(phase);
      q('.bf-retry').hidden=phase!=='rejected'||!attempt?.result.retryable;
      q('.bf-check-status').hidden=!['uncertain','partial'].includes(phase)||!config.statusEndpoint;
      q('.bf-edit').hidden=!['rejected','catalog_changed'].includes(phase);
      q('.bf-edit').textContent=repertoire&&phase==='catalog_changed'?'Пересмотреть пожелания':'Изменить данные';
      const requestId=prepared?.requestId||lastRequestId;
      q('.bf-request-id').hidden=!requestId||config.mode==='demo';
      q('.bf-request-id').textContent=requestId?'Номер заявки: '+requestId:'';
      q('.bf-confirmation').hidden=!success;
      q('.bf-confirmation-title').textContent=repertoire?(phase==='accepted'?'Пожелания приняты':'Пожелания отправлены.'):(phase==='accepted'?'Заявка принята':'Заявка отправлена');
    }};
    for(const name of Object.keys(fields)){
      const update=()=>{if(editable()){draft[name]=name==='consent'?fields[name].checked:fields[name].value;error(name);changed();}};
      fields[name].addEventListener('input',update);fields[name].addEventListener('change',update);
    }
    if(repertoire){
      q('.bf-exclude').addEventListener('click',()=>{if(!editable()||!confirmExclusion)return;excludeConfirmed=exclusionKey();confirmExclusion=false;submit();});
      q('.bf-exclude-cancel').addEventListener('click',()=>{confirmExclusion=false;excludeConfirmed='';render();fields.name.focus({preventScroll:true});});
      q('.bf-exclusion').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();q('.bf-exclude-cancel').click();}});
    }
    q('.bf-retry').addEventListener('click',()=>deliver(false));
    q('.bf-check-status').addEventListener('click',()=>deliver(true));
    q('.bf-edit').addEventListener('click',()=>{
      if(!['rejected','catalog_changed'].includes(phase))return;
      attempt=null;prepared=null;phase='draft';excludeConfirmed='';confirmExclusion=false;
      notice='Проверьте данные перед новой отправкой';
      render();focusName();
    });
    q('.bf-new').addEventListener('click',()=>{
      if(!['accepted','delivered'].includes(phase))return;
      phase='draft';lastRequestId='';notice='';render();focusName();
    });
    render();
  }
  function submit(){
    if(!editable())return;
    for(const name of Object.keys(draft))error(name);
    const checked=contract.validateContact(draft,controller.fields.date?.validity.valid??true);
    if(checked.errors.length){for(const [name,message]of checked.errors)error(name,message);notice='Проверьте выделенные поля';render();controller.fields[checked.errors[0][0]].focus();return;}
    if(repertoire&&!snap().selected.length){notice='Пока ничего не отмечено. Выберите важные для вас песни перед отправкой пожеланий.';render();q('.bf-status').scrollIntoView({block:'center',behavior:'auto'});return;}
    if(!config.enabled){notice='Отправка пока не подключена. Данные не отправлены.';render();return;}
    if(repertoire&&snap().selected.some(song=>song.status==='maybe')){notice='Отправка отметок «Можно» ещё не подключена. Выбор остаётся на этой странице.';render();return;}
    if(repertoire&&snap().deprecated.length&&excludeConfirmed!==exclusionKey()){
      confirmExclusion=true;notice='';render();q('.bf-exclusion').focus({preventScroll:true});return;
    }
    try{
      prepared=contract.createFrozenRequest(draft,snap(),repertoire,undefined,{excludeDeprecated:!!excludeConfirmed});
      attempt=config.mode==='demo'?null:new contract.RequestAttempt(prepared,config);
      deliver(false);
    }catch(failure){notice=failure.message||'Проверьте данные перед отправкой';render();}
  }
  function completed(status){
    lastRequestId=prepared?.requestId||'';draft=blank();prepared=null;attempt=null;confirmExclusion=false;excludeConfirmed='';
    phase=status;notice='';for(const name of Object.keys(draft))error(name);render();q('.bf-confirmation').focus({preventScroll:true});
  }
  async function deliver(checking){
    if(phase==='pending')return;
    if(checking&&!['uncertain','partial'].includes(phase))return;
    if(!checking&&!['draft','rejected'].includes(phase))return;
    if(config.mode==='demo'){
      phase='draft';notice='Отправка пока не подключена';render();return;
    }
    if(!attempt)return;
    phase='pending';notice=checking?'Проверяем результат заявки':'';render();
    const result=await(checking?attempt.check():attempt.send());phase=result.status;
    if(['accepted','delivered'].includes(phase)){completed(phase);return;}
    if(phase==='catalog_changed'&&repertoire){
      await store.reloadCatalog();store.markUnavailable(result.missing);
      notice='Репертуар обновился, проверьте пожелания перед отправкой: недоступные песни не попадут в заявку';
    }else if(phase==='catalog_changed')notice='Проверьте данные перед новой отправкой';
    else if(phase==='partial')notice='Получена только часть заявки: '+result.parts.confirmed+' из '+result.parts.total+', проверьте результат: повторная отправка пока отключена';
    else if(phase==='rejected')notice=result.message+', данные сохранены';
    else{phase='uncertain';notice=(result.message||'Результат заявки неизвестен')+', данные сохранены на этой странице, результат можно проверить по номеру заявки';}
    render();
  }
  window.bogemaForms=Object.freeze({get mode(){return config.mode;},refresh:render});
  // Browser back restores the in-memory draft; personal details are never persisted.
  window.addEventListener('beforeunload',event=>{if(config.mode!=='demo'&&['pending','uncertain','partial'].includes(phase)){event.preventDefault();event.returnValue='';}});
  async function start(){
    const host=document.querySelector('[data-request-form]');if(!host)return;
    mount(host);
    try{
      const modules=await Promise.all([import(new URL('request-contract.mjs?v=20261014-unified1',scriptURL).href),import(new URL('phone-input.mjs',scriptURL).href)]);
      contract=modules[0];config=await loadConfig();modules[1].attachPhoneMask(controller.fields.phone);controller.form.dataset.phoneMask='ready';
      if(repertoire){
        const preferences=await import(new URL('preferences-store.mjs?v=20261022-release',scriptURL).href);
        store=preferences.preferencesStore;currentProgramSnapshot=preferences.currentProgramSnapshot;
        store.subscribe(()=>{
          if(editable()){
            confirmExclusion=false;excludeConfirmed='';prepared=null;
          }
          render();
        });
        await store.ready;
      }
      phase='draft';render();
    }catch{phase='unavailable';notice='Форма не загрузилась, попробуйте обновить страницу';render();}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
