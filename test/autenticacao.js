// Testa a autenticação das rotas /api/* (server.js) e o "ver como parceiro".
// Middlewares extraídos do próprio server.js, Supabase mockado. Sem rede.
const fs = require('fs');
const path = require('path');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const web = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passou = 0, falhou = 0;
function check(nome, cond, detalhe) {
  if (cond) { passou++; console.log('  \x1b[32mOK \x1b[0m ' + nome); }
  else { falhou++; console.log('  \x1b[31mFALHOU\x1b[0m ' + nome + (detalhe ? ' — ' + detalhe : '')); }
}
const trecho = (src, ini, fim) => { const a = src.indexOf(ini), b = src.indexOf(fim, a); if (a < 0 || b < 0) throw new Error('trecho nao encontrado: ' + ini); return src.slice(a, b); };

// Usuários por token
const USERS = {
  'tok-admin': { id: 'A1', auth: 'au-admin', role: 'admin', status: 'active', email: 'admin@x' },
  'tok-aff': { id: 'P1', auth: 'au-aff', role: 'affiliate', status: 'active', hs_affiliate_id: 'ana-teste' },
  'tok-pend': { id: 'P2', auth: 'au-pend', role: 'affiliate', status: 'pending' },
};
let consultas = 0;
const fetchMock = async (url, opts = {}) => {
  const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data, text: async () => JSON.stringify(data) });
  if (url.endsWith('/auth/v1/user')) {
    consultas++;
    const tok = (opts.headers.Authorization || '').replace('Bearer ', '');
    return USERS[tok] ? json({ id: USERS[tok].auth }) : json({}, false, 401);
  }
  const m = url.match(/users\?auth_id=eq\.([^&]+)/);
  if (m) return json(Object.values(USERS).filter(u => u.auth === decodeURIComponent(m[1])));
  return json({}, false, 404);
};
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';

const codigo = trecho(srv, '// Quem está chamando:', 'async function lerLinha(');
const M = new Function('fetch', codigo + '\nreturn { exigirLogin, exigirAdmin };')(fetchMock);

function chamar(mw, token) {
  return new Promise(resolve => {
    const req = { headers: token ? { authorization: 'Bearer ' + token } : {} };
    const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ status: this.c, body: b }); } };
    mw(req, res, () => resolve({ status: 'next', usuario: req.usuario }));
  });
}

(async () => {
  console.log('Autenticação das rotas');
  check('sem token: 401', (await chamar(M.exigirLogin, null)).status === 401);
  check('token inválido: 401', (await chamar(M.exigirLogin, 'tok-xxx')).status === 401);
  check('afiliado ativo passa em rota de login', (await chamar(M.exigirLogin, 'tok-aff')).status === 'next');
  check('afiliado pendente: 403', (await chamar(M.exigirLogin, 'tok-pend')).status === 403);
  check('afiliado em rota de admin: 403', (await chamar(M.exigirAdmin, 'tok-aff')).status === 403);
  check('admin em rota de admin passa', (await chamar(M.exigirAdmin, 'tok-admin')).status === 'next');
  const antes = consultas; await chamar(M.exigirLogin, 'tok-aff');
  check('token em cache não consulta o Supabase de novo', consultas === antes);

  console.log('Proteção de cada rota (server.js)');
  const rota = (metodo, p) => (srv.match(new RegExp(`app\\.${metodo}\\('${p.replace(/[/:]/g, m => '\\' + m)}',\\s*(\\w+)`)) || [])[1];
  const admin = [['get', '/api/hubspot/sync'], ['post', '/api/link-forms'], ['patch', '/api/link-forms/:id'], ['delete', '/api/link-forms/:id'],
    ['post', '/api/shortio/create-bulk'], ['post', '/api/shortio/create'], ['patch', '/api/shortio/update'],
    ['patch', '/api/affiliate/:userId/links-config'], ['post', '/api/admin/ver-como']];
  admin.forEach(([m, p]) => check(`${m.toUpperCase()} ${p} exige admin`, rota(m, p) === 'exigirAdmin', rota(m, p)));
  [['get', '/api/link-forms'], ['get', '/api/shortio/links']].forEach(([m, p]) => check(`${m.toUpperCase()} ${p} exige login`, rota(m, p) === 'exigirLogin', rota(m, p)));
  check('afiliado só lista os próprios links', /req\.usuario\.role !== 'admin' && \(affiliateId/.test(srv));
  const todas = [...srv.matchAll(/app\.(get|post|patch|delete)\('(\/api\/[^']+)'/g)].map(x => x[2]);
  const abertas = todas.filter(p => !['/api/health', '/api/desempenho'].includes(p) && !new RegExp(`'${p.replace(/[/:]/g, m => '\\' + m)}',\\s*exigir`).test(srv));
  check('nenhuma rota /api nova sem proteção (exceto health e desempenho)', abertas.length === 0, abertas.join(', '));
  check('ver-como grava registro em admin_view_log', /admin_view_log/.test(trecho(srv, "app.post('/api/admin/ver-como'", '// GET /api/desempenho')));

  console.log('Somente leitura no front (index.html)');
  check('saveUsers bloqueado na visão', /function saveUsers\(users\) \{\n  if \(globalThis\.__vendoComo\)/.test(web));
  check('saveModels bloqueado na visão', /function saveModels\(models\) \{\n  if \(globalThis\.__vendoComo\)/.test(web));
  check('escrita na API barrada no fetch', /globalThis\.__vendoComo && metodo !== 'GET'/.test(web));
  check('perfil e foto bloqueados', /saveProfile=function\(\)\{\n  if\(somenteLeitura\(\)\) return;/.test(web) && /handlePhotoUpload=function\(input\)\{\n  if\(somenteLeitura\(\)\) return;/.test(web));
  check('ao sair recarrega do banco', /async function sairVerComo[\s\S]{0,400}await loadData\(\)/.test(web));

  console.log(`\n${passou} passaram, ${falhou} falharam\n`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
