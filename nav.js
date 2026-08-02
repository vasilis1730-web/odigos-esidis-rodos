/* ============================================================
   Πλοήγηση: επιστροφή στην αρχική και εναλλαγή ενότητας
   ============================================================ */
(function(){
  var OTHER = (window.SECTOR==='erga')
    ? {href:'promitheies_ypiresies.html', label:'Προμήθειες & Υπηρεσίες'}
    : {href:'dimosia_erga.html',          label:'Δημόσια Έργα'};

  function leave(href){
    try{
      if(window.Cloud && Cloud.dirty && Cloud.dirty()){
        if(!confirm('Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί στους κοινούς φακέλους.\n\n'+
                    'Αν φύγετε τώρα, δεν θα τις δουν οι συνάδελφοι.\n\nΝα συνεχίσω;')) return;
      }
    }catch(e){}
    location.href = href;
  }

  var css = document.createElement('style');
  css.textContent =
    '.navHome{display:flex;gap:8px;align-items:center;margin-right:18px;flex-wrap:wrap}'+
    '.navHome button{display:inline-flex;align-items:center;gap:7px;background:#ffffff26;color:#fff;'+
    'border:1px solid #ffffff40;border-radius:10px;padding:9px 14px;font-weight:800;font-size:13px;'+
    'cursor:pointer;white-space:nowrap;font-family:inherit}'+
    '.navHome button:hover{background:#ffffff40}'+
    '.navHome button.alt{background:transparent}'+
    '@media(max-width:760px){.navHome{width:100%;margin:0 0 10px}}';
  document.head.appendChild(css);

  function mount(){
    var row = document.querySelector('header .row') || document.querySelector('header');
    if(!row || row.querySelector('.navHome')) return;
    var box = document.createElement('div');
    box.className = 'navHome';
    var home = document.createElement('button');
    home.innerHTML = '\u2190 Επιλογή ενότητας';
    home.title = 'Επιστροφή στην αρχική σελίδα του οδηγού';
    home.onclick = function(){ leave('index.html') };
    var alt = document.createElement('button');
    alt.className = 'alt';
    alt.textContent = 'Μετάβαση: ' + OTHER.label;
    alt.title = 'Άνοιγμα της άλλης ενότητας';
    alt.onclick = function(){ leave(OTHER.href) };
    box.appendChild(home); box.appendChild(alt);
    row.insertBefore(box, row.firstChild);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount);
  else mount();
})();
