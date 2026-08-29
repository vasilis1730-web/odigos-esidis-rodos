/* ============================================================
   ΚΟΙΝΟΙ ΦΑΚΕΛΟΙ ΥΠΗΡΕΣΙΑΣ — σύνδεση και συγχρονισμός
   Απαιτεί: window.SECTOR ('erga' ή 'promitheies')
            window.LOCAL  {get(), set(obj), title()}
   ============================================================ */
(function(){
var CFG=window.ESIDIS_CONFIG||{};
var URL_=CFG.SUPABASE_URL;
var KEY_=CFG.SUPABASE_KEY;
var PROJECT_REF=CFG.PROJECT_REF||'';
var AUTO_MS=2200;
var SB=null, USER=null, FOLDER=null, LOADED_AT=null;
var timer=null, saving=false, pending=false, conflict=null, SUSPEND=false;

function el(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]})}
function when(d){ if(!d) return '—';
  var t=new Date(d), n=new Date(), s=(n-t)/1000;
  if(s<60) return 'μόλις τώρα';
  if(s<3600) return 'πριν '+Math.floor(s/60)+' λεπτά';
  if(t.toDateString()===n.toDateString()) return 'σήμερα '+t.toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'});
  return t.toLocaleDateString('el-GR')+' '+t.toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'});}

/* ---------- Γραμμή κατάστασης ---------- */
function statusHtml(){
  if(conflict) return '<span class="cl-warn">\u26a0 Ο φάκελος άλλαξε από '+esc(conflict.who||'συνάδελφο')+
    ' '+when(conflict.at)+'. Η αυτόματη αποθήκευση σταμάτησε.</span>'+
    '<button class="cl-btn" onclick="Cloud.reload()">Φόρτωση της δικής του έκδοσης</button>'+
    '<button class="cl-btn primary" onclick="Cloud.force()">Κράτα τη δική μου</button>';
  if(saving)  return '<span class="cl-meta">Αποθήκευση…</span>';
  if(pending) return '<span class="cl-meta">Αλλαγές — αποθηκεύονται σε λίγο</span>';
  return '<span class="cl-meta">Αποθηκεύτηκε '+when(FOLDER&&FOLDER.updated_at)+
    (FOLDER&&FOLDER.updated_by_email?' από '+esc(FOLDER.updated_by_email):'')+'</span>';
}
function bar(){
  var b=el('cloudBar'); if(!b) return;
  if(!USER){
    b.innerHTML='<span class="cl-off">Τοπική εργασία — δεν είστε συνδεδεμένοι</span>'+
      '<span class="cl-meta">τα στοιχεία μένουν μόνο σε αυτόν τον υπολογιστή</span>'+
      '<button class="cl-btn primary" onclick="Cloud.login()">Σύνδεση στους κοινούς φακέλους</button>';
    return;
  }
  b.innerHTML='<span class="cl-on">●</span><span class="cl-user">'+esc(USER.email)+'</span>'+
    (FOLDER?'<span class="cl-folder">'+esc(FOLDER.title)+'</span>'+statusHtml()
           :'<span class="cl-warn">Δεν έχει ανοίξει φάκελος — οι αλλαγές δεν αποθηκεύονται στην υπηρεσία</span>')+
    '<button class="cl-btn" onclick="Cloud.folders()">Φάκελοι υπηρεσίας</button>'+
    (IS_ADMIN?'<button class="cl-btn" onclick="Cloud.users()">Χρήστες</button>':'')+
    (FOLDER?'<button class="cl-btn" onclick="Cloud.save()">Αποθήκευση τώρα</button>':'')+
    '<button class="cl-btn ghost" onclick="Cloud.logout()">Έξοδος</button>';
}
function toast(msg,bad){
  var t=el('cloudToast'); if(!t) return;
  t.textContent=msg; t.className='cl-toast'+(bad?' bad':'')+' show';
  clearTimeout(t._h); t._h=setTimeout(function(){t.className='cl-toast'},3200);
}

/* ---------- Σύνδεση ---------- */
async function ensure(){
  if(SB) return SB;
  if(!URL_||!KEY_||/ΣΥΜΠΛΗΡΩΣΤΕ/.test(URL_)){
    throw new Error('Δεν έχουν συμπληρωθεί τα στοιχεία σύνδεσης στο config.js.');
  }
  if(!window.supabase){
    await new Promise(function(res,rej){
      var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload=res; s.onerror=function(){rej(new Error('Δεν φορτώθηκε η βιβλιοθήκη σύνδεσης. Ελέγξτε τη σύνδεση στο διαδίκτυο.'))};
      document.head.appendChild(s);
    });
  }
  SB=window.supabase.createClient(URL_,KEY_,{auth:{persistSession:true,autoRefreshToken:true}});
  return SB;
}
async function login(after){
  window.__afterLogin=after||null;
  try{ await ensure() }catch(e){ return alert(e.message) }
  openModal('Σύνδεση στους κοινούς φακέλους',
    '<div class="notice">Ο λογαριασμός σας είναι <b>αποκλειστικά για τον Οδηγό ΕΣΗΔΗΣ</b> — δεν είναι ο ίδιος '+
    'με της εφαρμογής Προμηθειών ή του ΥΔΕ. Οι φάκελοι είναι κοινοί για όλη την υπηρεσία: '+
    'ό,τι αποθηκεύετε το βλέπουν και συνεχίζουν οι συνάδελφοι.</div>'+
    '<div class="form-grid">'+
    '<div class="field"><label>Υπηρεσιακό email</label><input id="cl_mail" type="email" autocomplete="username"></div>'+
    '<div class="field"><label>Κωδικός</label><input id="cl_pass" type="password" autocomplete="current-password"></div>'+
    '</div><div id="cl_err" class="notice" style="display:none;border-left:6px solid #b91c1c"></div>',
    '<button class="btn" onclick="closeModal()">Ακύρωση</button>'+
    '<button class="btn success" onclick="Cloud.doLogin()">Σύνδεση</button>');
  setTimeout(function(){var m=el('cl_mail'); if(m){m.focus();
    m.onkeydown=el('cl_pass').onkeydown=function(e){if(e.key==='Enter')doLogin()}}},60);
}
async function doLogin(){
  var mail=(el('cl_mail')||{}).value, pass=(el('cl_pass')||{}).value;
  var err=el('cl_err');
  function fail(m){ if(err){err.style.display='';err.innerHTML='<b>'+esc(m)+'</b>'} }
  if(!mail||!pass) return fail('Συμπληρώστε email και κωδικό.');
  try{
    var r=await SB.auth.signInWithPassword({email:mail.trim(),password:pass});
    if(r.error) return fail(r.error.message==='Invalid login credentials'
      ?'Λάθος email ή κωδικός.':r.error.message);
    USER=r.data.user; IS_ADMIN=null; MY_ACTIVE=null;
    var ok=await loadProfile();
    if(!ok){ window.__afterLogin=null; return }
    closeModal(); bar();
    toast('Συνδεθήκατε ως '+USER.email+(IS_ADMIN?' — διαχειριστής':''));
    var a=window.__afterLogin; window.__afterLogin=null;
    if(typeof a==='function') a(); else folders();
  }catch(e){ fail('Σφάλμα σύνδεσης: '+e.message) }
}
async function logout(){
  if(pending&&!confirm('Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί ακόμη. Να γίνει έξοδος;')) return;
  clearTimeout(timer);
  if(SB) await SB.auth.signOut();
  USER=null; FOLDER=null; pending=false; conflict=null; bar(); toast('Αποσυνδεθήκατε');
}

/* ---------- Φάκελοι ---------- */
var IS_ADMIN=null, MY_ROLE=null, MY_ACTIVE=null;
/* Επιστρέφει true αν ο λογαριασμός επιτρέπεται να συνεχίσει.
   Απενεργοποιημένος ή χωρίς προφίλ αποσυνδέεται αμέσως. */
async function loadProfile(){
  try{
    var r=await SB.from('esidis_profiles').select('role,full_name,is_active').eq('id',USER.id).single();
    if(r.error||!r.data){
      await kick('Ο λογαριασμός σας δεν έχει προφίλ στην υπηρεσία.\n\n'+
        'Επικοινωνήστε με τον διαχειριστή για να σας δοθεί πρόσβαση.');
      return false;
    }
    MY_ROLE=r.data.role; MY_ACTIVE=r.data.is_active!==false; IS_ADMIN=(MY_ROLE==='admin');
    if(!MY_ACTIVE){
      await kick('Ο λογαριασμός σας έχει απενεργοποιηθεί από τον διαχειριστή.\n\n'+
        'Δεν έχετε πρόσβαση στους κοινούς φακέλους της υπηρεσίας.');
      return false;
    }
    return true;
  }catch(e){ IS_ADMIN=false; return true }
}
async function kick(msg){
  try{ if(SB) await SB.auth.signOut() }catch(e){}
  USER=null; FOLDER=null; IS_ADMIN=null; MY_ROLE=null; pending=false; conflict=null;
  clearTimeout(timer); closeModal(); bar();
  openModal('Δεν έχετε πρόσβαση',
    '<div class="notice" style="border-left:6px solid #b91c1c"><b>'+esc(msg.split('\n')[0])+'</b>'+
    '<div style="margin-top:8px">'+esc(msg.split('\n').slice(1).join(' ').trim())+'</div></div>'+
    '<div class="notice">Μπορείτε να συνεχίσετε να χρησιμοποιείτε τον οδηγό τοπικά. '+
    'Ό,τι συμπληρώνετε θα μένει μόνο σε αυτόν τον υπολογιστή.</div>',
    '<button class="btn" onclick="closeModal()">Κατάλαβα</button>');
}
async function checkAdmin(){ return IS_ADMIN===true }
async function folders(showArchived){
  if(!USER) return login();
  var admin=await checkAdmin();
  openModal('Φάκελοι υπηρεσίας','<div class="notice">Φόρτωση…</div>','');
  var q=SB.from('esidis_folders').select('*').eq('sector',window.SECTOR);
  if(!showArchived) q=q.eq('status','active');
  q=q.order('updated_at',{ascending:false});
  var res=await q;
  if(res.error) return openModal('Φάκελοι υπηρεσίας',
    '<div class="notice"><b>Σφάλμα:</b> '+esc(res.error.message)+'</div>',
    '<button class="btn" onclick="closeModal()">Κλείσιμο</button>');
  var rows=res.data||[];
  var active=rows.filter(function(r){return r.status==='active'});
  var archived=rows.filter(function(r){return r.status==='archived'});
  var h='<div class="notice">Κάθε φάκελος είναι ένα έργο ή μια διαδικασία. Ανοίγοντάς τον επανέρχονται '+
        '<b>όλα τα στοιχεία και το σημείο της ροής</b> όπως τα άφησε ο τελευταίος συνάδελφος. '+
        'Ό,τι συμπληρώνετε αποθηκεύεται αυτόματα.</div>'+
        '<button class="btn primary" onclick="Cloud.newProject()">+ Νέος φάκελος</button><hr style="margin:16px 0">';
  function rowHtml(r,isArchived){
    var cur=FOLDER&&FOLDER.id===r.id, st=r.state||{}, bits=[];
    if(st.ESIDIS_NO) bits.push('Α/Α ΕΣΗΔΗΣ '+esc(st.ESIDIS_NO));
    var bg=st.BUDGET_GROSS||st.GROSS; if(bg) bits.push(esc(bg)+' €');
    var color=isArchived?'#94a3b8':(cur?'#0f766e':'#c9ced6');
    var btns='';
    if(!isArchived){
      btns+=(cur?'':'<button class="btn small primary" onclick="Cloud.open(\''+r.id+'\')">Άνοιγμα</button> ');
      btns+='<button class="btn small" onclick="Cloud.rename(\''+r.id+'\')">Μετονομασία</button> ';
      btns+='<button class="btn small" onclick="Cloud.archive(\''+r.id+'\')">Αρχειοθέτηση</button>';
    } else {
      btns+='<button class="btn small" onclick="Cloud.unarchive(\''+r.id+'\')">Επαναφορά</button>';
      if(admin) btns+=' <button class="btn small" style="color:#b91c1c;border-color:#b91c1c" onclick="Cloud.del(\''+r.id+'\',\''+esc(r.title)+'\')">Διαγραφή</button>';
    }
    return '<div class="panel" style="margin:9px 0;border-left:6px solid '+color+'">'+
      (isArchived?'<span style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:.4px">ΑΡΧΕΙΟ · </span>':'')+
      '<b>'+esc(r.title)+'</b>'+(cur?' <span class="cl-tag">ανοιχτός</span>':'')+
      (bits.length?'<div class="side-note">'+bits.join(' · ')+'</div>':'')+
      '<div class="side-note">Ενημερώθηκε '+when(r.updated_at)+
      (r.updated_by_email?' από '+esc(r.updated_by_email):'')+'</div>'+
      btns+'</div>';
  }
  if(!active.length&&!showArchived)
    h+='<div class="side-note">Δεν υπάρχει ακόμη κανένας φάκελος σε αυτή την ενότητα.</div>';
  active.forEach(function(r){ h+=rowHtml(r,false) });
  if(showArchived&&archived.length){
    h+='<hr style="margin:18px 0"><div style="font-size:12px;font-weight:800;color:#94a3b8;letter-spacing:.5px">'+
       'ΑΡΧΕΙΟΘΕΤΗΜΕΝΟΙ ('+archived.length+')</div>';
    archived.forEach(function(r){ h+=rowHtml(r,true) });
  }
  var foot='<button class="btn" onclick="closeModal()">Κλείσιμο</button>';
  if(admin) foot+=(showArchived
    ?'<button class="btn" onclick="Cloud.folders(false)">Απόκρυψη αρχείου</button>'
    :'<button class="btn" onclick="Cloud.folders(true)">Εμφάνιση αρχείου</button>');
  openModal('Φάκελοι υπηρεσίας — '+(window.SECTOR==='erga'?'Δημόσια Έργα':'Προμήθειες και Υπηρεσίες'),h,foot);
}
function newProject(localFallback){
  if(!USER){
    if(!confirm('Δεν είστε συνδεδεμένοι, οπότε το νέο έργο δεν θα αποθηκευτεί στους κοινούς φακέλους '+
      'και δεν θα το βλέπουν οι συνάδελφοι.\n\nΝα συνδεθείτε πρώτα;')){
      if(typeof localFallback==='function') localFallback();
      return;
    }
    return login(function(){ newProject(localFallback) });
  }
  openModal('Νέος φάκελος '+(window.SECTOR==='erga'?'έργου':'διαδικασίας'),
    '<div class="notice">Δώστε μια ονομασία. Ο φάκελος δημιουργείται αμέσως και <b>ό,τι συμπληρώνετε '+
    'από εδώ και πέρα αποθηκεύεται αυτόματα σε αυτόν</b>. Μπορείτε να τον ξανανοίξετε οποτεδήποτε, '+
    'από οποιονδήποτε υπολογιστή, και να συνεχίσετε από το ίδιο σημείο.</div>'+
    '<div class="form-grid"><div class="field full"><label>Ονομασία φακέλου</label>'+
    '<input id="cl_new" placeholder="'+(window.SECTOR==='erga'
      ?'π.χ. Ανάπλαση πλατείας Αγίου Γεωργίου':'π.χ. Προμήθεια καυσίμων 2026')+'"></div></div>'+
    '<div id="cl_nerr" class="notice" style="display:none;border-left:6px solid #b91c1c"></div>',
    '<button class="btn" onclick="closeModal()">Ακύρωση</button>'+
    '<button class="btn success" onclick="Cloud.create()">Δημιουργία και έναρξη</button>');
  setTimeout(function(){var i=el('cl_new'); if(i){i.focus();
    i.onkeydown=function(e){if(e.key==='Enter')create()}}},60);
}
async function create(){
  var t=((el('cl_new')||{}).value||'').trim(), err=el('cl_nerr');
  if(!t){ if(err){err.style.display='';err.innerHTML='<b>Δώστε ονομασία στον φάκελο.</b>'} return }
  SUSPEND=true; clearTimeout(timer);
  FOLDER=null; LOADED_AT=null; pending=false; conflict=null;
  window.LOCAL.set({});
  window.LOCAL.setTitle(t);
  SUSPEND=false;
  var r=await SB.from('esidis_folders').insert({sector:window.SECTOR,title:t,
    state:window.LOCAL.get(),created_by:USER.id}).select().single();
  if(r.error){ if(err){err.style.display='';err.innerHTML='<b>Δεν δημιουργήθηκε: '+esc(r.error.message)+'</b>'} return }
  FOLDER=r.data; LOADED_AT=r.data.updated_at; bar();
  await log(r.data.id,'create','Δημιουργία φακέλου');
  closeModal(); toast('Ο φάκελος δημιουργήθηκε. Η αποθήκευση γίνεται πλέον αυτόματα.');
  if(typeof window.openProject==='function') setTimeout(window.openProject,220);
}
async function open_(id){
  if(pending&&!confirm('Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν ακόμη στον τρέχοντα φάκελο. Να συνεχίσω;')) return;
  var r=await SB.from('esidis_folders').select('*').eq('id',id).single();
  if(r.error) return alert('Δεν άνοιξε: '+r.error.message);
  clearTimeout(timer); conflict=null; adopt(r.data);
  closeModal(); toast('Άνοιξε ο φάκελος: '+r.data.title);
}
async function save(auto){
  if(!FOLDER) return folders();
  if(saving){ pending=true; return }
  clearTimeout(timer); saving=true; pending=false; bar();
  try{
    var chk=await SB.from('esidis_folders').select('updated_at,updated_by_email').eq('id',FOLDER.id).single();
    if(!chk.error && LOADED_AT && chk.data.updated_at!==LOADED_AT){
      if(auto){
        conflict={who:chk.data.updated_by_email,at:chk.data.updated_at};
        saving=false; bar(); toast('Ο φάκελος άλλαξε από άλλον. Η αυτόματη αποθήκευση σταμάτησε.',true);
        return;
      }
      if(!confirm('Ο φάκελος άλλαξε από '+(chk.data.updated_by_email||'άλλον συνάδελφο')+
        ' ('+when(chk.data.updated_at)+').\n\nΑν συνεχίσετε, θα αντικαταστήσετε τις δικές του αλλαγές.\nΝα συνεχίσω;')){
        saving=false; bar(); return;
      }
    }
    var r=await SB.from('esidis_folders').update({state:window.LOCAL.get(),
      title:(window.LOCAL.title()||'').trim()||FOLDER.title}).eq('id',FOLDER.id).select().single();
    saving=false;
    if(r.error){ bar(); return toast('Δεν αποθηκεύτηκε: '+r.error.message,true) }
    FOLDER=r.data; LOADED_AT=r.data.updated_at; conflict=null; bar();
    if(!auto) toast('Αποθηκεύτηκε στους κοινούς φακέλους');
  }catch(e){ saving=false; bar(); toast('Σφάλμα αποθήκευσης: '+e.message,true) }
}
async function reload(){
  if(!FOLDER) return;
  var r=await SB.from('esidis_folders').select('*').eq('id',FOLDER.id).single();
  if(r.error) return toast(r.error.message,true);
  conflict=null; adopt(r.data); toast('Φορτώθηκε η ενημερωμένη έκδοση του φακέλου');
}
function force(){ conflict=null; LOADED_AT=null; save(false) }
function adopt(row){
  SUSPEND=true; FOLDER=row; LOADED_AT=row.updated_at; pending=false;
  window.LOCAL.set(row.state||{}); SUSPEND=false; bar();
}
async function users(){
  if(!USER) return login();
  if(!await checkAdmin()) return alert('Η διαχείριση χρηστών είναι διαθέσιμη μόνο σε διαχειριστή.');
  openModal('Χρήστες','<div class="notice">Φόρτωση…</div>','');
  var q=await SB.from('esidis_profiles').select('id,email,full_name,role,is_active').order('email');
  if(q.error) return openModal('Χρήστες','<div class="notice"><b>Σφάλμα:</b> '+esc(q.error.message)+'</div>',
    '<button class="btn" onclick="closeModal()">Κλείσιμο</button>');
  var rows=q.data||[];
  var names={admin:'Διαχειριστής',member:'Μέλος υπηρεσίας',viewer:'Προβολή μόνο'};
  var h='<div class="notice"><b>Όλοι οι παρακάτω λογαριασμοί έχουν πρόσβαση στους κοινούς φακέλους</b>, '+
        'αρκεί να είναι ενεργοί. Ο ρόλος καθορίζει μόνο ποιος μπορεί να διαγράφει αρχειοθετημένους φακέλους '+
        'και να διαχειρίζεται χρήστες.</div>'+
        '<div class="notice">Νέος λογαριασμός δεν δημιουργείται από εδώ. Γίνεται στο Supabase: '+
        '<b>Authentication → Users → Add user</b>. Το προφίλ δημιουργείται αυτόματα με ρόλο «Προβολή» '+
        'και τον αλλάζετε από εδώ.'+
        '<div style="margin-top:8px"><button class="btn small primary" '+
        'onclick="window.open(\''+'https://supabase.com/dashboard/project/'+PROJECT_REF+'/auth/users'+'\',\'_blank\')">'+
        'Άνοιγμα διαχείρισης λογαριασμών</button></div></div>'+
        '<div class="notice" style="border-left:6px solid #b45309"><b>Τι κάνει η απενεργοποίηση.</b> '+
        'Ο λογαριασμός χάνει αμέσως κάθε πρόσβαση στους φακέλους και αποσυνδέεται μόλις προσπαθήσει να μπει. '+
        'Ο κωδικός του όμως παραμένει έγκυρος στο Supabase. Για οριστική απαγόρευση εισόδου, '+
        'μπείτε στη διαχείριση λογαριασμών και κάντε <b>Ban user</b> ή αλλάξτε του τον κωδικό.</div>';
  rows.forEach(function(u){
    var me=u.id===USER.id;
    h+='<div class="panel" style="margin:8px 0;border-left:6px solid '+(u.is_active?(u.role==='admin'?'#b45309':'#0f766e'):'#cbd5e1')+'">'+
      '<b>'+esc(u.full_name||u.email)+'</b>'+(me?' <span class="cl-tag">εσείς</span>':'')+
      (u.is_active?'':' <span class="cl-tag" style="background:#fee2e2;color:#991b1b">ανενεργός</span>')+
      '<div class="side-note">'+esc(u.email)+'</div>'+
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
      '<select onchange="Cloud.setRole(\''+u.id+'\',this.value)"'+(me?' disabled':'')+'>'+
      Object.keys(names).map(function(k){
        return '<option value="'+k+'"'+(u.role===k?' selected':'')+'>'+names[k]+'</option>'}).join('')+
      '</select>'+
      (me?'<span class="side-note">Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο</span>'
         :'<button class="btn small" onclick="Cloud.toggleActive(\''+u.id+'\','+(u.is_active?'false':'true')+')">'+
          (u.is_active?'Απενεργοποίηση':'Ενεργοποίηση')+'</button>')+
      '</div></div>';
  });
  openModal('Χρήστες με πρόσβαση ('+rows.length+')',h,'<button class="btn" onclick="closeModal()">Κλείσιμο</button>');
}
async function setRole(id,role){
  var r=await SB.from('esidis_profiles').update({role:role}).eq('id',id);
  if(r.error) return alert('Δεν άλλαξε ο ρόλος: '+r.error.message);
  toast('Ο ρόλος ενημερώθηκε'); users();
}
async function toggleActive(id,val){
  var r=await SB.from('esidis_profiles').update({is_active:val}).eq('id',id);
  if(r.error) return alert('Δεν άλλαξε η κατάσταση: '+r.error.message);
  toast(val?'Ο λογαριασμός ενεργοποιήθηκε':'Ο λογαριασμός απενεργοποιήθηκε'); users();
}
async function rename(id){
  var t=prompt('Νέος τίτλος φακέλου:'); if(!t||!t.trim()) return;
  var r=await SB.from('esidis_folders').update({title:t.trim()}).eq('id',id).select().single();
  if(r.error) return alert(r.error.message);
  if(FOLDER&&FOLDER.id===id){ FOLDER=r.data; LOADED_AT=r.data.updated_at;
    SUSPEND=true; window.LOCAL.setTitle(t.trim()); SUSPEND=false; }
  folders(); bar();
}
async function archive(id){
  if(!confirm('Να αρχειοθετηθεί ο φάκελος; Φεύγει από τη λίστα αλλά δεν διαγράφεται.')) return;
  var r=await SB.from('esidis_folders').update({status:'archived'}).eq('id',id);
  if(r.error) return alert(r.error.message);
  if(FOLDER&&FOLDER.id===id){ FOLDER=null; LOADED_AT=null; clearTimeout(timer) }
  await log(id,'archive','Αρχειοθέτηση'); folders(); bar();
}
async function unarchive(id){
  var r=await SB.from('esidis_folders').update({status:'active'}).eq('id',id);
  if(r.error) return alert(r.error.message);
  await log(id,'unarchive','Επαναφορά από αρχείο'); toast('Ο φάκελος επανήλθε στη λίστα'); folders(true);
}
async function del(id,title){
  if(!confirm('ΔΙΑΓΡΑΦΗ — αυτή η ενέργεια είναι μόνιμη και δεν αναιρείται.\n\n'+
              'Φάκελος: «'+title+'»\n\nΝα διαγραφεί οριστικά;')) return;
  if(!confirm('Επιβεβαίωση: να διαγραφεί οριστικά ο φάκελος «'+title+'»;')) return;
  var r=await SB.from('esidis_folders').delete().eq('id',id);
  if(r.error) return alert('Δεν διαγράφηκε: '+r.error.message+
    (r.error.code==='42501'?'\n\nΔεν έχετε δικαίωμα διαγραφής, ή ο φάκελος δεν είναι αρχειοθετημένος.':''));
  toast('Ο φάκελος «'+title+'» διαγράφηκε οριστικά'); folders(true);
}
async function log(fid,action,note){
  try{ await SB.from('esidis_folder_log').insert({folder_id:fid,action:action,note:note,by_user:USER.id}) }catch(e){}
}
function markDirty(){
  if(SUSPEND||!FOLDER||conflict) return;
  pending=true; bar();
  clearTimeout(timer);
  timer=setTimeout(function(){ save(true) },AUTO_MS);
}

/* ---------- Επαναφορά συνεδρίας ---------- */
async function boot(){
  bar();
  try{ await ensure() }catch(e){ return }
  var s=await SB.auth.getSession();
  if(s.data&&s.data.session){ USER=s.data.session.user; var ok=await loadProfile(); if(ok) bar(); }
}
function wire(){
  var orig=window.resetApp;
  window.resetApp=function(){ newProject(orig) };
  window.addEventListener('beforeunload',function(e){ if(pending){ e.preventDefault(); e.returnValue='' } });
}
window.Cloud={login:login,doLogin:doLogin,logout:logout,folders:folders,create:create,
  open:open_,save:function(){save(false)},rename:rename,archive:archive,
  unarchive:unarchive,del:del,markDirty:markDirty,
  users:users,setRole:setRole,toggleActive:toggleActive,isAdmin:function(){return !!IS_ADMIN},
  newProject:newProject,reload:reload,force:force,
  isOn:function(){return !!USER},folder:function(){return FOLDER},
  dirty:function(){return !!(FOLDER&&pending)}};
document.addEventListener('DOMContentLoaded',function(){boot();wire()});
if(document.readyState!=='loading'){boot();wire()}
})();
