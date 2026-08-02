/* ============================================================
   ΚΟΙΝΟΙ ΦΑΚΕΛΟΙ ΥΠΗΡΕΣΙΑΣ — σύνδεση και συγχρονισμός
   Απαιτεί: window.SECTOR ('erga' ή 'promitheies')
            window.LOCAL  {get(), set(obj), title()}
   ============================================================ */
(function(){
var URL_='https://hafaxrebjzootjzzqkzx.supabase.co';
var KEY_='sb_publishable_15lh0rfRuRqFCz_lPZV1hA_CPKGSn_a';
var SB=null, USER=null, FOLDER=null, LOADED_AT=null, DIRTY=false;

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
function bar(){
  var b=el('cloudBar'); if(!b) return;
  if(!USER){
    b.innerHTML='<span class="cl-off">Τοπική εργασία — δεν είστε συνδεδεμένοι</span>'+
      '<button class="cl-btn primary" onclick="Cloud.login()">Σύνδεση στους κοινούς φακέλους</button>';
    return;
  }
  b.innerHTML='<span class="cl-on">●</span><span class="cl-user">'+esc(USER.email)+'</span>'+
    (FOLDER?'<span class="cl-folder">'+esc(FOLDER.title)+'</span>'+
      '<span class="cl-meta">τελευταία αποθήκευση '+when(FOLDER.updated_at)+
      (FOLDER.updated_by_email?' από '+esc(FOLDER.updated_by_email):'')+'</span>'
     :'<span class="cl-meta">δεν έχει ανοίξει φάκελος</span>')+
    '<button class="cl-btn" onclick="Cloud.folders()">Φάκελοι υπηρεσίας</button>'+
    (FOLDER?'<button class="cl-btn primary" id="cloudSave" onclick="Cloud.save()">Αποθήκευση στο cloud</button>':'')+
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
async function login(){
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
    USER=r.data.user; closeModal(); bar();
    toast('Συνδεθήκατε ως '+USER.email);
    folders();
  }catch(e){ fail('Σφάλμα σύνδεσης: '+e.message) }
}
async function logout(){
  if(DIRTY&&FOLDER&&!confirm('Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί στο cloud. Να γίνει έξοδος;')) return;
  if(SB) await SB.auth.signOut();
  USER=null; FOLDER=null; DIRTY=false; bar(); toast('Αποσυνδεθήκατε');
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
  var h='<div class="notice">Οι φάκελοι είναι κοινοί για όλη την υπηρεσία. Ανοίγοντας έναν, φορτώνεται '+
        'η πρόοδος και τα στοιχεία του όπως τα άφησε ο τελευταίος συνάδελφος.</div>'+
        '<div class="form-grid"><div class="field full"><label>Τίτλος νέου φακέλου</label>'+
        '<input id="cl_new" placeholder="π.χ. Προμήθεια καυσίμων 2026"></div></div>'+
        '<button class="btn primary small" onclick="Cloud.create()">Δημιουργία φακέλου</button><hr style="margin:16px 0">';
  if(!rows.length) h+='<div class="side-note">Δεν υπάρχει ακόμη κανένας φάκελος σε αυτή την ενότητα.</div>';
  rows.forEach(function(r){
    var cur=FOLDER&&FOLDER.id===r.id;
    h+='<div class="panel" style="margin:9px 0;border-left:6px solid '+(cur?'#0f766e':'#c9ced6')+'">'+
      '<b>'+esc(r.title)+'</b>'+(cur?' <span class="cl-tag">ανοιχτός</span>':'')+
      '<div class="side-note">Ενημερώθηκε '+when(r.updated_at)+
      (r.updated_by_email?' από '+esc(r.updated_by_email):'')+'</div>'+
      '<button class="btn small primary" onclick="Cloud.open(\''+r.id+'\')">Άνοιγμα</button> '+
      '<button class="btn small" onclick="Cloud.rename(\''+r.id+'\')">Μετονομασία</button> '+
      '<button class="btn small" onclick="Cloud.archive(\''+r.id+'\')">Αρχειοθέτηση</button></div>';
  });
  openModal('Φάκελοι υπηρεσίας — '+(window.SECTOR==='erga'?'Δημόσια Έργα':'Προμήθειες και Υπηρεσίες'),h,
    '<button class="btn" onclick="closeModal()">Κλείσιμο</button>');
}
async function create(){
  var t=(el('cl_new')||{}).value||'';
  if(!t.trim()) return alert('Δώστε τίτλο στον φάκελο.');
  var r=await SB.from('esidis_folders').insert({sector:window.SECTOR,title:t.trim(),
    state:window.LOCAL.get(),created_by:USER.id}).select().single();
  if(r.error) return alert('Δεν δημιουργήθηκε: '+r.error.message);
  FOLDER=r.data; LOADED_AT=r.data.updated_at; DIRTY=false;
  await log(r.data.id,'create','Δημιουργία φακέλου');
  closeModal(); bar(); toast('Ο φάκελος δημιουργήθηκε και συνδέθηκε');
}
async function open_(id){
  var r=await SB.from('esidis_folders').select('*').eq('id',id).single();
  if(r.error) return alert('Δεν άνοιξε: '+r.error.message);
  if(DIRTY&&!confirm('Υπάρχουν τοπικές αλλαγές που δεν αποθηκεύτηκαν. Να αντικατασταθούν;')) return;
  FOLDER=r.data; LOADED_AT=r.data.updated_at; DIRTY=false;
  window.LOCAL.set(r.data.state||{});
  closeModal(); bar(); toast('Άνοιξε ο φάκελος: '+r.data.title);
}
async function save(){
  if(!FOLDER) return folders();
  var btn=el('cloudSave'); if(btn){btn.disabled=true;btn.textContent='Αποθήκευση…'}
  var chk=await SB.from('esidis_folders').select('updated_at,updated_by_email').eq('id',FOLDER.id).single();
  if(!chk.error&&LOADED_AT&&chk.data.updated_at!==LOADED_AT){
    if(!confirm('Ο φάκελος άλλαξε στο μεταξύ από '+(chk.data.updated_by_email||'άλλον συνάδελφο')+
      ' ('+when(chk.data.updated_at)+').\n\nΑν συνεχίσετε, οι δικές σας αλλαγές θα αντικαταστήσουν τις δικές του.\nΝα συνεχίσω;')){
      if(btn){btn.disabled=false;btn.textContent='Αποθήκευση στο cloud'} return;
    }
  }
  var r=await SB.from('esidis_folders').update({state:window.LOCAL.get(),
    title:window.LOCAL.title()||FOLDER.title}).eq('id',FOLDER.id).select().single();
  if(btn){btn.disabled=false;btn.textContent='Αποθήκευση στο cloud'}
  if(r.error) return toast('Δεν αποθηκεύτηκε: '+r.error.message,true);
  FOLDER=r.data; LOADED_AT=r.data.updated_at; DIRTY=false;
  await log(FOLDER.id,'save','Αποθήκευση κατάστασης');
  bar(); toast('Αποθηκεύτηκε στους κοινούς φακέλους');
}
async function rename(id){
  var t=prompt('Νέος τίτλος φακέλου:'); if(!t||!t.trim()) return;
  var r=await SB.from('esidis_folders').update({title:t.trim()}).eq('id',id).select().single();
  if(r.error) return alert(r.error.message);
  if(FOLDER&&FOLDER.id===id){FOLDER=r.data;LOADED_AT=r.data.updated_at}
  folders(); bar();
}
async function archive(id){
  if(!confirm('Να αρχειοθετηθεί ο φάκελος; Δεν διαγράφεται, απλώς φεύγει από τη λίστα.')) return;
  var r=await SB.from('esidis_folders').update({status:'archived'}).eq('id',id);
  if(r.error) return alert(r.error.message);
  if(FOLDER&&FOLDER.id===id){FOLDER=null;LOADED_AT=null}
  await log(id,'archive','Αρχειοθέτηση'); folders(); bar();
}
async function log(fid,action,note){
  try{ await SB.from('esidis_folder_log').insert({folder_id:fid,action:action,note:note,by_user:USER.id}) }catch(e){}
}
function markDirty(){ if(FOLDER&&!DIRTY){DIRTY=true;bar()} }

/* ---------- Επαναφορά συνεδρίας ---------- */
async function boot(){
  bar();
  try{ await ensure() }catch(e){ return }
  var s=await SB.auth.getSession();
  if(s.data&&s.data.session){ USER=s.data.session.user; bar() }
}
window.Cloud={login:login,doLogin:doLogin,logout:logout,folders:folders,create:create,
  open:open_,save:save,rename:rename,archive:archive,markDirty:markDirty,
  isOn:function(){return !!USER},folder:function(){return FOLDER}};
document.addEventListener('DOMContentLoaded',boot);
if(document.readyState!=='loading') boot();
})();
