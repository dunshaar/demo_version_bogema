/* The same original portraits persist while the chosen lineup grows. */
(() => {
  const section = document.querySelector('.ensemble-section');
  if (!section) return;
  const stage = section.querySelector('.ensemble-stage');
  const buttons = [...section.querySelectorAll('[data-ensemble]')];
  const portraits = [...stage.querySelectorAll('[data-member]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const sets = {
    solo: {name:'Вокалист-гитарист', description:'Мужской вокал, гитара', members:['guitar']},
    trio: {name:'Трио', description:'Мужской и женский вокал, гитара, барабаны', members:['guitar','vocal','drums']},
    optimal: {name:'Оптимальный состав', description:'Мужской и женский вокал, гитара, бас, барабаны', members:['guitar','vocal','drums','bass']},
    full: {name:'Полный состав', description:'Мужской и женский вокал, гитара, саксофон, бас, барабаны', members:['guitar','vocal','drums','bass','sax']},
    extended: {name:'Расширенный состав', description:'Мужской и женский вокал, гитара, саксофон, клавишные, бас, барабаны', members:['guitar','vocal','drums','bass','sax','keys']}
  };
  const mobileLayout = matchMedia('(max-width:809px), (max-width:1023px) and (max-height:500px)');
  const selector = section.querySelector('.ensemble-selector');
  function warmPortraits() {
    if (!mobileLayout.matches) return;
    // Fetch the real portraits before a hidden musician is added to the stage.
    for (const image of stage.querySelectorAll('img')) image.loading = 'eager';
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (mobileLayout.matches && entries.some(entry => entry.isIntersecting)) {
        warmPortraits();observer.disconnect();
      }
    }, {rootMargin:'400px 0px'});
    observer.observe(section);
  } else warmPortraits();
  function revealCompleteLineup() {
    if (!mobileLayout.matches) return;
    const header = document.querySelector('.site-header');
    const pinned = header && ['sticky','fixed'].includes(getComputedStyle(header).position);
    const inset = (pinned ? Math.max(0,header.getBoundingClientRect().bottom) : 0) + 12;
    const controls = selector.getBoundingClientRect();
    if (controls.top >= inset && stage.getBoundingClientRect().bottom <= innerHeight - 12) return;
    window.scrollTo({top:Math.max(0,scrollY + controls.top - inset),behavior:motion.matches ? 'auto' : 'smooth'});
  }
  let selected = 'trio';
  function select(key) {
    if (!sets[key]) return;
    warmPortraits();
    const active = buttons.find(button => button.dataset.ensemble === key);
    if (selector.scrollWidth > selector.clientWidth) {
      const left = active.offsetLeft - selector.offsetLeft;
      selector.scrollTo({left:Math.max(0,Math.min(left, left + active.offsetWidth - selector.clientWidth)),behavior:'instant'});
    }
    if (key === selected) { revealCompleteLineup();return; }
    const before = new Map();
    for (const card of portraits) {
      card.getAnimations().forEach(animation => animation.cancel());
      if (!card.hidden) before.set(card, card.getBoundingClientRect());
    }
    selected = key;
    const lineup = sets[key];
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.ensemble === key));
    section.querySelector('#ensemble-name').textContent = lineup.name;
    section.querySelector('#ensemble-description').textContent = lineup.description;
    const count = lineup.members.length;
    section.querySelector('#ensemble-count').textContent = `${count} ${count === 1 ? 'музыкант' : count < 5 ? 'музыканта' : 'музыкантов'}`;
    stage.dataset.count = String(count);
    for (const card of portraits) card.hidden = !lineup.members.includes(card.dataset.member);
    if (!motion.matches) {
      let added = 0;
      for (const card of portraits.filter(card => !card.hidden)) {
        const old = before.get(card), current = card.getBoundingClientRect();
        if (old) {
          card.animate([{transform:`translate(${old.x-current.x}px,${old.y-current.y}px)`},{transform:'translate(0,0)'}], {duration:400,easing:'cubic-bezier(.22,.7,.2,1)'});
        } else {
          card.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}], {duration:450,delay:added++*65,fill:'backwards',easing:'cubic-bezier(.22,.7,.2,1)'});
        }
      }
    }
    window.dispatchEvent(new Event('bogema:layout'));
    revealCompleteLineup();
  }
  buttons.forEach((button,index) => {
    button.addEventListener('click', () => select(button.dataset.ensemble));
    button.addEventListener('keydown', event => {
      const movement = {ArrowLeft:-1,ArrowRight:1};
      let next;
      if (event.key in movement) next = (index + movement[event.key] + buttons.length) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();buttons[next].focus();select(buttons[next].dataset.ensemble);
    });
  });
})();
