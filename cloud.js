/* ============================================================
   ΚΟΙΝΟΙ ΦΑΚΕΛΟΙ ΥΠΗΡΕΣΙΑΣ — σύνδεση και συγχρονισμός
   Απαιτεί: window.SECTOR ('erga' ή 'promitheies')
            window.LOCAL  {get(), set(obj), title()}
   ============================================================ */
(function(){
var URL_='https://hafaxrebjzootjzzqkzx.supabase.co';
var KEY_='sb_publishable_15lh0rfRuRqFCz_lPZV1hA_CPKGSn_a';
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
    '<div class="notice">Χρησιμοποιήστε τα ίδια στοιχεία που έχετε στην εφαρμογή Προμηθειών του Δήμου. '+
    'Οι φάκελοι είναι κοινοί για όλη την υπηρεσία: ό,τι αποθηκεύετε το βλέπουν και συνεχίζουν οι συνάδελφοι.</div>'+
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
    USER=r.data.user; closeModal(); bar(); toast('Συνδεθήκατε ως '+USER.email);
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
async function folders(){
  if(!USER) return login();
  openModal('Φάκελοι υπηρεσίας','<div class="notice">Φόρτωση…</div>','');
  var q=await SB.from('esidis_folders').select('*')
    .eq('sector',window.SECTOR).eq('status','active').order('updated_at',{ascending:false});
  if(q.error) return openModal('Φάκελοι υπηρεσίας',
    '<div class="notice"><b>Σφάλμα:</b> '+esc(q.error.message)+'</div>',
    '<button class="btn" onclick="closeModal()">Κλείσιμο</button>');
  var rows=q.data||[];
  var h='<div class="notice">Κάθε φάκελος είναι ένα έργο ή μια διαδικασία. Ανοίγοντάς τον επανέρχονται '+
        '<b>όλα τα στοιχεία και το σημείο της ροής</b> όπως τα άφησε ο τελευταίος συνάδελφος. '+
        'Ό,τι συμπληρώνετε αποθηκεύεται αυτόματα.</div>'+
        '<button class="btn primary" onclick="Cloud.newProject()">+ Νέος φάκελος</button><hr style="margin:16px 0">';
  if(!rows.length) h+='<div class="side-note">Δεν υπάρχει ακόμη κανένας φάκελος σε αυτή την ενότητα.</div>';
  rows.forEach(function(r){
    var cur=FOLDER&&FOLDER.id===r.id, st=r.state||{}, bits=[];
    if(st.ESIDIS_NO) bits.push('Α/Α ΕΣΗΔΗΣ '+esc(st.ESIDIS_NO));
    var bg=st.BUDGET_GROSS||st.GROSS; if(bg) bits.push(esc(bg)+' €');
    h+='<div class="panel" style="margin:9px 0;border-left:6px solid '+(cur?'#0f766e':'#c9ced6')+'">'+
      '<b>'+esc(r.title)+'</b>'+(cur?' <span class="cl-tag">ανοιχτός</span>':'')+
      (bits.length?'<div class="side-note">'+bits.join(' · ')+'</div>':'')+
      '<div class="side-note">Ενημερώθηκε '+when(r.updated_at)+
      (r.updated_by_email?' από '+esc(r.updated_by_email):'')+'</div>'+
      (cur?'':'<button class="btn small primary" onclick="Cloud.open(\''+r.id+'\')">Άνοιγμα</button> ')+
      '<button class="btn small" onclick="Cloud.rename(\''+r.id+'\')">Μετονομασία</button> '+
      '<button class="btn small" onclick="Cloud.archive(\''+r.id+'\')">Αρχειοθέτηση</button></div>';
  });
  openModal('Φάκελοι υπηρεσίας — '+(window.SECTOR==='erga'?'Δημόσια Έργα':'Προμήθειες και Υπηρεσίες'),h,
    '<button class="btn" onclick="closeModal()">Κλείσιμο</button>');
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
async function rename(id){
  var t=prompt('Νέος τίτλος φακέλου:'); if(!t||!t.trim()) return;
  var r=await SB.from('esidis_folders').update({title:t.trim()}).eq('id',id).select().single();
  if(r.error) return alert(r.error.message);
  if(FOLDER&&FOLDER.id===id){ FOLDER=r.data; LOADED_AT=r.data.updated_at;
    SUSPEND=true; window.LOCAL.setTitle(t.trim()); SUSPEND=false; }
  folders(); bar();
}
async function archive(id){
  if(!confirm('Να αρχειοθετηθεί ο φάκελος; Δεν διαγράφεται, απλώς φεύγει από τη λίστα.')) return;
  var r=await SB.from('esidis_folders').update({status:'archived'}).eq('id',id);
  if(r.error) return alert(r.error.message);
  if(FOLDER&&FOLDER.id===id){ FOLDER=null; LOADED_AT=null; clearTimeout(timer) }
  await log(id,'archive','Αρχειοθέτηση'); folders(); bar();
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
  if(s.data&&s.data.session){ USER=s.data.session.user; bar() }
}
function wire(){
  var orig=window.resetApp;
  window.resetApp=function(){ newProject(orig) };
  window.addEventListener('beforeunload',function(e){ if(pending){ e.preventDefault(); e.returnValue='' } });
}
window.Cloud={login:login,doLogin:doLogin,logout:logout,folders:folders,create:create,
  open:open_,save:function(){save(false)},rename:rename,archive:archive,markDirty:markDirty,
  newProject:newProject,reload:reload,force:force,
  isOn:function(){return !!USER},folder:function(){return FOLDER},
  dirty:function(){return !!(FOLDER&&pending)}};
document.addEventListener('DOMContentLoaded',function(){boot();wire()});
if(document.readyState!=='loading'){boot();wire()}
})();
