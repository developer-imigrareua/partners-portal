// Testa a persistencia REAL extraida do index.html, com Supabase mockado.
// Nenhuma chamada de rede.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const ini = src.indexOf('function userToRow(u) {');
const fim = src.indexOf('function getLinkForms()');
if (ini < 0 || fim < 0) { console.error('nao consegui extrair o bloco de persistencia'); process.exit(1); }
const bloco = src.slice(ini, fim);

let writes = [], toasts = [], falharProximo = false;
const resultado = () => {
  if (falharProximo) { falharProximo = false; return Promise.resolve({ error: { message: 'RLS: permission denied' } }); }
  return Promise.resolve({ error: null });
};
const sb = { from: t => ({
  upsert: patch => { writes.push({ table: t, patch, op: 'upsert' }); return resultado(); },
  update: patch => ({ eq: (col, val) => { writes.push({ table: t, patch, op: 'update', val }); return resultado(); } }),
}) };
const toast = m => toasts.push(m);

const load = new Function('sb', 'toast', 'console',
  'let usersCache=[],modelsCache=[];\n' + bloco +
  '\nreturn {userToRow,snapshotUsers,markUserSaved,diffUserRow,saveUsers,modelToRow,snapshotModels,saveModels};');
const M = load(sb, toast, console);

const mkUser = (id, over = {}) => Object.assign({
  id, authId: 'auth-' + id, role: 'affiliate', name: 'Afiliado ' + id, email: id + '@ex.com',
  phone: '11999', company: 'Co', site: '', channel: 'LinkedIn', status: 'active',
  appliedAt: '2026-01-01', approvedAt: '2026-01-02', hsAffiliateId: 'slug-' + id,
  bonifModelId: 'standard', photo: null, syncData: null, affiliateType: 'external', linksConfig: {},
}, over);
const mkModel = (id, over = {}) => Object.assign({
  id, name: 'M-' + id, description: '', products: { 'Padrão': { stages: { 'Convertido': 100 } } },
}, over);

let passou = 0, falhou = 0;
function check(nome, cond, detalhe) {
  if (cond) { passou++; console.log('  \x1b[32mOK \x1b[0m ' + nome); }
  else { falhou++; console.log('  \x1b[31mFALHOU\x1b[0m ' + nome + (detalhe ? '  [' + detalhe + ']' : '')); }
}
const cols = w => JSON.stringify(Object.keys(w && w.patch || {}).sort());
const zerar = () => { writes = []; toasts = []; };

(async () => {
  console.log('\n=== USUARIOS: os 10 call sites ===\n');

  let us = [mkUser('u1'), mkUser('u2'), mkUser('u3')];
  M.snapshotUsers(us); zerar();
  us[0].name = 'Novo Nome'; us[0].phone = '11888';
  await M.saveUsers(us);
  check('saveProfile grava 1 linha so', writes.length === 1, 'gravou ' + writes.length);
  check('  ...a linha certa', writes[0] && writes[0].val === 'u1');
  check('  ...so os campos alterados', cols(writes[0]) === '["name","phone"]', cols(writes[0]));
  check('  ...sem id no payload', !('id' in (writes[0] || {}).patch));
  check('  ...via UPDATE ... WHERE id', writes[0] && writes[0].op === 'update');

  M.snapshotUsers(us); zerar();
  us[1].photo = 'data:image/png;base64,' + 'A'.repeat(50000);
  await M.saveUsers(us);
  check('foto: grava so u2, so a coluna photo', writes.length === 1 && writes[0].val === 'u2' && cols(writes[0]) === '["photo"]');
  check('  ...fotos dos outros nao retrafegam', !writes.some(w => w.val !== 'u2'));

  M.snapshotUsers(us); zerar();
  us[2].syncData = { totalLeads: 159, leads: Array.from({ length: 159 }, (_, i) => ({ id: i })) };
  await M.saveUsers(us);
  check('sync grava so sync_data de u3', writes.length === 1 && writes[0].val === 'u3' && cols(writes[0]) === '["sync_data"]');

  us = [mkUser('p1', { status: 'pending', approvedAt: null }), mkUser('p2')];
  M.snapshotUsers(us); zerar();
  us[0].status = 'active'; us[0].approvedAt = '2026-09-14';
  await M.saveUsers(us);
  check('approveAff grava status+approved_at', writes.length === 1 && cols(writes[0]) === '["approved_at","status"]', cols(writes[0]));

  us = [mkUser('a', { bonifModelId: 'custom-x' }), mkUser('b', { bonifModelId: 'custom-x' }),
        mkUser('c', { bonifModelId: 'premium' }), mkUser('d', { bonifModelId: 'custom-x' })];
  M.snapshotUsers(us); zerar();
  us.forEach(u => { if (u.bonifModelId === 'custom-x') u.bonifModelId = 'standard'; });
  await M.saveUsers(us);
  check('deleteModel grava as 3 linhas afetadas', writes.length === 3, 'gravou ' + writes.length);
  check('  ...exatamente a,b,d', JSON.stringify(writes.map(w => w.val).sort()) === '["a","b","d"]');
  check('  ...e nao toca em c', !writes.some(w => w.val === 'c'));
  check('  ...so a coluna bonif_model_id', writes.every(w => cols(w) === '["bonif_model_id"]'));

  M.snapshotUsers(us); zerar();
  await M.saveUsers(us);
  check('nada mudou -> ZERO escritas', writes.length === 0, 'gravou ' + writes.length);

  us = [mkUser('z')];
  M.snapshotUsers(us); zerar();
  us[0].name = 'Tentativa'; falharProximo = true;
  await M.saveUsers(us);
  check('falha: avisa o usuario', toasts.length === 1 && /Falha ao salvar/.test(toasts[0]), JSON.stringify(toasts));
  zerar();
  await M.saveUsers(us);
  check('  ...retry regrava a linha', writes.length === 1 && writes[0].patch.name === 'Tentativa');
  zerar();
  await M.saveUsers(us);
  check('  ...apos sucesso vira no-op', writes.length === 0);

  const novo = mkUser('n1');
  M.snapshotUsers([]); M.markUserSaved(novo); zerar();
  await M.saveUsers([novo]);
  check('usuario recem-inserido -> ZERO escritas', writes.length === 0, 'gravou ' + writes.length);

  console.log('\n=== MODELOS DE BONIFICACAO ===\n');

  let ms = [mkModel('standard'), mkModel('premium')];
  M.snapshotModels(ms); zerar();
  ms[0].products['Padrão'].stages['Convertido'] = 150;
  await M.saveModels(ms);
  check('editar modelo grava so ele', writes.length === 1 && writes[0].patch.id === 'standard', JSON.stringify(writes.map(w => w.patch.id)));
  check('  ...premium intocado', !writes.some(w => w.patch.id === 'premium'));
  check('  ...via upsert (modelo novo precisa inserir)', writes[0].op === 'upsert');

  zerar();
  await M.saveModels(ms);
  check('nada mudou -> ZERO escritas', writes.length === 0, 'gravou ' + writes.length);

  zerar(); ms.push(mkModel('custom-123'));
  await M.saveModels(ms);
  check('modelo novo e gravado', writes.length === 1 && writes[0].patch.id === 'custom-123');

  M.snapshotModels([]); zerar();
  await M.saveModels([mkModel('standard'), mkModel('premium')]);
  check('seed com banco vazio grava os 2 defaults', writes.length === 2, 'gravou ' + writes.length);

  ms = [mkModel('standard'), mkModel('premium'), mkModel('custom-9')];
  M.snapshotModels(ms); zerar();
  await M.saveModels(ms.filter(m => m.id !== 'custom-9'));
  check('remover do array nao emite DELETE (igual a antes)', writes.length === 0, 'gravou ' + writes.length);

  ms = [mkModel('standard')];
  M.snapshotModels(ms); zerar();
  ms[0].name = 'Renomeado'; falharProximo = true;
  await M.saveModels(ms);
  check('falha em modelo avisa o usuario', toasts.length === 1 && /Falha ao salvar/.test(toasts[0]));
  zerar();
  await M.saveModels(ms);
  check('  ...retry regrava', writes.length === 1 && writes[0].patch.name === 'Renomeado');

  console.log('\n' + passou + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
