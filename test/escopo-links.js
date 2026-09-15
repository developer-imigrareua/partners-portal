const fs=require('fs');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const ini=src.indexOf('function getLinkForms()');
const fim=src.indexOf('async function loadData()');
const bloco=src.slice(ini, fim);
let linkFormsCache=[], AFF_LINK_FORMS=[];
const M=new Function('getCache','let linkFormsCache=getCache();const AFF_LINK_FORMS=[];\n'+bloco+'\nreturn {formsParaAfiliado};');

let p=0,f=0;
const check=(n,c,d)=>{ if(c){p++;console.log('  \x1b[32mOK \x1b[0m '+n);} else {f++;console.log('  \x1b[31mFALHOU\x1b[0m '+n+(d?'  ['+d+']':''));} };

const forms=[
  {id:'contato', label:'Contato'},                                             // sem scope (pré-migração)
  {id:'global',  label:'Global',  scope:'all',      affiliate_ids:[]},
  {id:'so-ale',  label:'Só Ale',  scope:'selected', affiliate_ids:['u-ale']},
  {id:'dois',    label:'Dois',    scope:'selected', affiliate_ids:['u-ale','u-bia']},
  {id:'por-hs',  label:'Por HS',  scope:'selected', affiliate_ids:['bia-slug']},
];
const {formsParaAfiliado}=M(()=>forms);
const ale={id:'u-ale', hsAffiliateId:'ale-slug'};
const bia={id:'u-bia', hsAffiliateId:'bia-slug'};
const ze ={id:'u-ze',  hsAffiliateId:'ze-slug'};
const ids=u=>formsParaAfiliado(u).map(x=>x.id).join(',');

console.log('\nESCOPO DE FORMULÁRIOS\n');
check('form sem coluna scope vale para todos', formsParaAfiliado(ze).some(x=>x.id==='contato'));
check('scope=all vale para todos',             formsParaAfiliado(ze).some(x=>x.id==='global'));
check('Ale vê o formulário só dele',           ids(ale).includes('so-ale'), ids(ale));
check('Bia NÃO vê o formulário do Ale',        !ids(bia).includes('so-ale'), ids(bia));
check('Zé NÃO vê nenhum específico',           ids(ze)==='contato,global', ids(ze));
check('lista com dois inclui ambos',           ids(ale).includes('dois') && ids(bia).includes('dois'));
check('casa também por hs_affiliate_id',       ids(bia).includes('por-hs'), ids(bia));
check('Ale não entra pelo hs da Bia',          !ids(ale).includes('por-hs'));
check('usuário nulo não quebra',               (()=>{try{formsParaAfiliado(null);return true;}catch(e){return false;}})());
check('afiliado sem escopo específico vê 2',   formsParaAfiliado(ze).length===2, String(formsParaAfiliado(ze).length));

console.log(`\n${p} passaram, ${f} falharam\n`);
process.exit(f?1:0);
