(() => {
  const Store = window.ProFitnessStore;
  let state = Store.migrateData(Store.createEmptySnapshot());
  let authSession = null;
  let activeDate = Store.todayISO();
  let deferredGestorInstallPrompt = null;
  const GESTOR_VIEWS = ["resumo", "academia", "financeiro", "alertas"];
  const requestedGestorView = new URLSearchParams(window.location.search).get("view");
  const initialGestorView = GESTOR_VIEWS.includes(requestedGestorView) ? requestedGestorView : "resumo";
  const $ = (id) => document.getElementById(id);
  const safe = (v) => Array.isArray(v) ? v : [];
  const money = (v) => Store.currency(Number(v || 0));
  const dateKey = (value) => String(value || '').slice(0, 10);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const normalize = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const dateFromRecord = (record, fields) => fields.map((f) => dateKey(record?.[f])).find(Boolean) || '';
  const minutesBetween = (a,b) => { const x=new Date(a).getTime(), y=new Date(b).getTime(); return Number.isFinite(x)&&Number.isFinite(y)&&y>x ? Math.round((y-x)/60000) : 0; };
  const duration = (mins) => { mins=Math.max(0,Number(mins||0)); const h=Math.floor(mins/60),m=mins%60; return h ? `${h}h${String(m).padStart(2,'0')}` : `${m} min`; };


  function isStandaloneGestorApp() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function isIOSDevice() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }
  function renderGestorInstallOption() {
    const button = $("gestorInstall");
    if (!button) return;
    button.hidden = isStandaloneGestorApp();
    button.classList.toggle("ready", Boolean(deferredGestorInstallPrompt));
    button.title = deferredGestorInstallPrompt ? "Instalar Gestor Mobile agora" : "Como instalar o Gestor Mobile";
  }
  function showGestorToast(message, tone = "info") {
    const toast = $("gestorToast");
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add("visible");
    window.clearTimeout(showGestorToast.timer);
    showGestorToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 4200);
  }
  async function installGestorApp() {
    if (isStandaloneGestorApp()) {
      showGestorToast("O Gestor Mobile já está aberto como aplicativo.", "success");
      renderGestorInstallOption();
      return;
    }
    if (location.protocol === "file:") {
      showGestorToast("Para instalar, abra o Gestor pelo endereço HTTPS publicado da academia.", "warning");
      return;
    }
    if (deferredGestorInstallPrompt) {
      deferredGestorInstallPrompt.prompt();
      const choice = await deferredGestorInstallPrompt.userChoice;
      deferredGestorInstallPrompt = null;
      renderGestorInstallOption();
      if (choice?.outcome === "accepted") showGestorToast("Instalação iniciada.", "success");
      return;
    }
    showGestorToast(isIOSDevice()
      ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
      : "No menu do navegador, escolha Instalar app ou Adicionar à tela inicial.", "warning");
  }

  function getDatasetDate() {
    const dates = [...safe(state.checkins).map(x=>dateKey(x.date||x.checkedInAt)), ...safe(state.staffTimeEntries).map(x=>dateKey(x.date||x.clockIn)), ...safe(state.movements).map(x=>dateKey(x.date||x.createdAt)), ...safe(state.payments).map(x=>dateKey(x.paidAt))].filter(Boolean).sort();
    return dates.includes(Store.todayISO()) ? Store.todayISO() : (dates.at(-1) || Store.todayISO());
  }
  function todayCheckins(){ return safe(state.checkins).filter(x=>dateKey(x.date||x.checkedInAt)===activeDate && normalize(x.type||'access')!=='workout'); }
  function isInside(x){ return !x.checkedOutAt && !['outside','saida','concluido'].includes(normalize(x.presenceStatus)); }
  function todayStaff(){ return safe(state.staffTimeEntries).filter(x=>dateKey(x.date||x.clockIn)===activeDate); }
  function isStaffInside(x){ return !x.clockOut && !['concluido','finalizado','outside'].includes(normalize(x.status)); }
  function todayMovements(){ return safe(state.movements).filter(x=>dateKey(x.date||x.createdAt)===activeDate && normalize(x.status)!=='cancelado'); }
  function todayPayments(){ return safe(state.payments).filter(x=>dateKey(x.paidAt)===activeDate && Number(x.paidAmount||0)>0 && normalize(x.status)!=='cancelado'); }
  function studentName(id){ return safe(state.students).find(x=>x.id===id)?.name || 'Aluno'; }
  function nowMinutes(entry){ return entry.durationMinutes || minutesBetween(entry.clockIn, entry.clockOut || new Date().toISOString()); }
  function movementAmount(m){ return Number(m.amount||0) * (normalize(m.type)==='saida' ? -1 : 1); }

  function buildAlerts() {
    const alerts=[]; const today=activeDate; const soon=new Date(`${today}T12:00:00`); soon.setDate(soon.getDate()+7); const soonKey=dateKey(soon.toISOString());
    const overdue=safe(state.payments).filter(p=>Number(p.netAmount||p.amount||0)>Number(p.paidAmount||0)&&p.dueDate<today&&!['pago','cancelado'].includes(normalize(p.status)));
    const dueSoon=safe(state.payments).filter(p=>p.dueDate>=today&&p.dueDate<=soonKey&&Number(p.netAmount||p.amount||0)>Number(p.paidAmount||0)&&normalize(p.status)!=='cancelado');
    const blocked=safe(state.students).filter(s=>normalize(s.status)==='bloqueado'||s.accessBlockReason);
    const openLong=todayStaff().filter(x=>isStaffInside(x)&&nowMinutes(x)>600);
    const closing=safe(state.cashClosings).find(x=>dateKey(x.date)===today);
    if(overdue.length) alerts.push({tone:'danger',title:`${overdue.length} mensalidade(s) vencida(s)`,detail:`Total em aberto: ${money(overdue.reduce((s,p)=>s+Math.max(0,Number(p.netAmount||p.amount||0)-Number(p.paidAmount||0)),0))}`});
    if(dueSoon.length) alerts.push({tone:'warning',title:`${dueSoon.length} mensalidade(s) vencem em até 7 dias`,detail:'Acompanhe preventivamente a cobrança.'});
    if(blocked.length) alerts.push({tone:'warning',title:`${blocked.length} aluno(s) com acesso bloqueado`,detail:'Confira motivos financeiros ou administrativos.'});
    if(openLong.length) alerts.push({tone:'warning',title:'Permanência de professor acima de 10 horas',detail:openLong.map(x=>x.staffName).join(', ')});
    if(closing && Math.abs(Number(closing.difference||0))>.01) alerts.push({tone:'danger',title:'Diferença no fechamento de caixa',detail:`Diferença registrada: ${money(closing.difference)}`});
    if(!todayStaff().length) alerts.push({tone:'warning',title:'Nenhuma presença da equipe registrada',detail:'Confira se os professores registraram entrada.'});
    if(!alerts.length) alerts.push({tone:'ok',title:'Operação sem alertas críticos',detail:'Os indicadores principais estão dentro do esperado.'});
    return {alerts,overdue,dueSoon};
  }

  function renderAlerts(alerts){
    const html=alerts.map((a,i)=>`<article class="alert-row ${a.tone}"><span class="alert-icon">${a.tone==='ok'?'✓':a.tone==='danger'?'!':'•'}</span><div><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.detail)}</span></div></article>`).join('');
    $('executiveAlerts').innerHTML=html; $('allAlerts').innerHTML=html; $('alertCount').textContent=alerts.filter(a=>a.tone!=='ok').length;
    const count=alerts.filter(a=>a.tone!=='ok').length; $('navAlertBadge').hidden=!count; $('navAlertBadge').textContent=count;
  }
  function renderHourChart(checkins){
    const groups=new Map(); checkins.forEach(c=>{const h=String(c.time||Store.formatTime(c.checkedInAt)||'--').slice(0,2); if(/^\d{2}$/.test(h)) groups.set(h,(groups.get(h)||0)+1)});
    const entries=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])); const max=Math.max(1,...entries.map(x=>x[1]));
    $('hourChart').innerHTML=entries.length?entries.map(([h,n])=>`<div class="hour-bar" title="${n} entrada(s)"><i style="height:${Math.max(5,Math.round(n/max*105))}px"></i><span>${h}h</span></div>`).join(''):'<div class="empty-state">Sem entradas registradas.</div>';
    const peak=entries.sort((a,b)=>b[1]-a[1])[0]; $('peakHourLabel').textContent=peak?`Pico às ${peak[0]}h · ${peak[1]} entradas`:'Sem pico identificado';
  }
  function render() {
    activeDate=getDatasetDate(); const checkins=todayCheckins(), inside=checkins.filter(isInside), staff=todayStaff(), staffInside=staff.filter(isStaffInside), movements=todayMovements(), payments=todayPayments();
    const revenue=movements.filter(m=>normalize(m.type)==='entrada').reduce((s,m)=>s+Number(m.amount||0),0) || payments.reduce((s,p)=>s+Number(p.paidAmount||0),0);
    const cashMovements=movements.filter(m=>normalize(m.method)==='dinheiro'); const closing=safe(state.cashClosings).find(x=>dateKey(x.date)===activeDate); const cashBalance=closing?Number((closing.countedCash ?? closing.expectedCash) || 0):cashMovements.reduce((s,m)=>s+movementAmount(m),0);
    const uniqueStudents=new Set(checkins.map(x=>x.studentId));
    $('metricStudentsToday').textContent=uniqueStudents.size; $('metricStudentsInside').textContent=inside.length; $('metricRevenueToday').textContent=money(revenue); $('metricPaymentsToday').textContent=`${payments.length} mensalidade${payments.length===1?'':'s'}`; $('metricCashBalance').textContent=money(cashBalance); $('metricCashStatus').textContent=closing?'caixa fechado':'posição parcial';
    $('gestorDataLabel').textContent=activeDate===Store.todayISO()?'Resumo de hoje':`Dados mais recentes: ${Store.formatDate(activeDate)}`;
    const sessionName=authSession?.account?.name||authSession?.account?.login||'Gestor'; $('gestorUserName').textContent=sessionName.split(' ')[0];
    const {alerts,overdue,dueSoon}=buildAlerts(); renderAlerts(alerts);
    $('professorsSummary').innerHTML=staff.length?staff.slice(0,4).map(x=>`<article class="staff-row"><div><strong>${escapeHtml(x.staffName||'Professor')}</strong><span>${Store.formatTime(x.clockIn)} · ${x.clockOut?Store.formatTime(x.clockOut):'presente agora'}</span></div><small>${duration(nowMinutes(x))}</small></article>`).join(''):'<div class="empty-state">Nenhum professor registrado no dia.</div>';
    renderHourChart(checkins);
    const completed=checkins.filter(x=>x.checkedOutAt); const avg=completed.length?Math.round(completed.reduce((s,x)=>s+minutesBetween(x.checkedInAt,x.checkedOutAt),0)/completed.length):0;
    $('avgStudentStay').textContent=avg?duration(avg):'--'; $('professorsInside').textContent=staffInside.length; $('professorsToday').textContent=new Set(staff.map(x=>x.staffId||x.staffName)).size; $('insideStudentsCount').textContent=inside.length;
    $('insideStudents').innerHTML=inside.length?inside.map(x=>`<article class="list-row"><div><strong>${escapeHtml(studentName(x.studentId))}</strong><span>Entrada às ${escapeHtml(x.time||Store.formatTime(x.checkedInAt))}</span></div><span class="status-pill inside">Presente</span></article>`).join(''):'<div class="empty-state">Nenhum aluno presente agora.</div>';
    $('staffPresenceList').innerHTML=staff.length?staff.map(x=>`<article class="staff-row"><div><strong>${escapeHtml(x.staffName||'Professor')}</strong><span>${Store.formatTime(x.clockIn)} → ${x.clockOut?Store.formatTime(x.clockOut):'agora'}</span></div><div><span class="status-pill ${isStaffInside(x)?'inside':'outside'}">${isStaffInside(x)?'Presente':'Saiu'}</span><small>${duration(nowMinutes(x))}</small></div></article>`).join(''):'<div class="empty-state">Sem registros da equipe.</div>';
    const weekday=new Date(`${activeDate}T12:00:00`).getDay(); const classes=safe(state.schedule).filter(x=>normalize(x.status)!=='cancelado'&&(dateKey(x.date)===activeDate||Number(x.dayOfWeek)===weekday)); $('classesTodayCount').textContent=classes.length; $('classesTodayList').innerHTML=classes.length?classes.slice(0,8).map(x=>`<article class="list-row"><div><strong>${escapeHtml(x.title||x.type||'Atividade')}</strong><span>${escapeHtml(x.teacherName||'Professor não informado')} · ${escapeHtml(x.location||'Academia')}</span></div><small>${escapeHtml(x.startTime||x.time||'--:--')}</small></article>`).join(''):'<div class="empty-state">Nenhuma aula registrada.</div>';
    $('paidCountToday').textContent=payments.length; $('overdueCount').textContent=overdue.length; $('dueSoonCount').textContent=dueSoon.length;
    const methods={}; movements.filter(m=>normalize(m.type)==='entrada').forEach(m=>methods[m.method||'outros']=(methods[m.method||'outros']||0)+Number(m.amount||0)); if(!Object.keys(methods).length) payments.forEach(p=>methods[p.method||'outros']=(methods[p.method||'outros']||0)+Number(p.paidAmount||0)); $('paymentMethods').innerHTML=Object.keys(methods).length?Object.entries(methods).map(([k,v])=>`<article class="method-card"><span>${escapeHtml(k)}</span><strong>${money(v)}</strong></article>`).join(''):'<div class="empty-state">Sem recebimentos no período.</div>';
    const income=movements.filter(m=>normalize(m.type)==='entrada').reduce((s,m)=>s+Number(m.amount||0),0), expense=movements.filter(m=>normalize(m.type)==='saida').reduce((s,m)=>s+Number(m.amount||0),0); $('cashSummary').innerHTML=`<div class="cash-line"><span>Entradas</span><strong>${money(income)}</strong></div><div class="cash-line"><span>Saídas</span><strong>${money(expense)}</strong></div><div class="cash-line"><span>Saldo do movimento</span><strong>${money(income-expense)}</strong></div>${closing?`<div class="cash-line"><span>Valor contado</span><strong>${money(closing.countedCash)}</strong></div>`:''}`;
    $('latestPayments').innerHTML=payments.length?payments.sort((a,b)=>String(b.paidAt).localeCompare(String(a.paidAt))).slice(0,8).map(p=>`<article class="list-row"><div><strong>${escapeHtml(studentName(p.studentId))}</strong><span>${escapeHtml(p.method||'forma não informada')} · ${Store.formatTime(p.paidAt)}</span></div><small>${money(p.paidAmount)}</small></article>`).join(''):'<div class="empty-state">Nenhum pagamento registrado.</div>';
    $('lastUpdateText').textContent=`Atualizado em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date())}.`;
  }

  function showAccess(logged){
    const authView=$('gestorAuthView');
    const appShell=$('gestorAppShell');
    authView.hidden=logged;
    appShell.hidden=!logged;
    authView.setAttribute('aria-hidden', String(logged));
    appShell.setAttribute('aria-hidden', String(!logged));
    document.body.classList.toggle('gestor-authenticated', logged);
    document.body.classList.toggle('gestor-login-active', !logged);
    if(logged) window.scrollTo({top:0,left:0,behavior:'auto'});
  }
  async function refresh(){ $('gestorStatusText').textContent='Atualizando'; $('gestorStatusDot').classList.remove('online'); state=await Store.hydrateFromRemoteIfConfigured(); render(); $('gestorStatusText').textContent=navigator.onLine?'Online':'Offline'; $('gestorStatusDot').classList.toggle('online',navigator.onLine); }
  async function login(login,password){ const feedback=$('gestorLoginFeedback'); feedback.textContent='Entrando com segurança...'; try{const session=await Store.loginRemote(login,password); if(session.account?.role!=='admin'){await Store.logoutRemote();throw new Error('Esta conta não possui acesso administrativo.')} authSession=session; showAccess(true); openView(initialGestorView); await refresh(); feedback.textContent='';}catch(e){feedback.textContent=e.message||'Não foi possível entrar.'}}
  async function logout(){await Store.logoutRemote();authSession=null;openView('resumo');showAccess(false);$('gestorLoginForm').reset();}
  function openView(name){document.querySelectorAll('.gestor-view').forEach(v=>{const active=v.dataset.view===name;v.hidden=!active;v.classList.toggle('active',active)});document.querySelectorAll('[data-view-target]').forEach(b=>b.classList.toggle('active',b.dataset.viewTarget===name));window.scrollTo({top:0,behavior:'smooth'})}
  $('gestorLoginForm').addEventListener('submit',async e=>{e.preventDefault();if(e.currentTarget.dataset.busy==='true')return;Store.setFormBusy(e.currentTarget,true,'Entrando...');const f=new FormData(e.currentTarget);try{await login(f.get('login'),f.get('password'))}finally{Store.setFormBusy(e.currentTarget,false)}});
  $('gestorLogout').addEventListener('click',logout); $('gestorRefresh').addEventListener('click',refresh); $('gestorInstall').addEventListener('click',installGestorApp); document.querySelectorAll('[data-view-target]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.viewTarget))); document.querySelectorAll('[data-open-view]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.openView))); window.addEventListener('online',()=>refresh()); window.addEventListener('offline',()=>{$('gestorStatusText').textContent='Offline';$('gestorStatusDot').classList.remove('online')});
  window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();deferredGestorInstallPrompt=event;renderGestorInstallOption();});
  window.addEventListener('appinstalled',()=>{deferredGestorInstallPrompt=null;renderGestorInstallOption();showGestorToast('Gestor Mobile instalado com sucesso.','success');});
  Store.applyRuntimeEnvironment(); authSession=Store.loadAuthSession(); renderGestorInstallOption(); if(authSession?.account?.role==='admin'&&Store.isAuthSessionLocallyValid(authSession)){showAccess(true);openView(initialGestorView);refresh()}else{showAccess(false)};
})();
