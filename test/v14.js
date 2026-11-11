// Versão 1.4.0: política sem efeito retroativo, lead recapturado, termo de
// adesão e a visão "ver como parceiro" idêntica à do parceiro. Sem rede.
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const web = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(raiz, 'db', 'v1.4.sql'), 'utf8');
const Politica = require('../politica');
const { montarDesempenho } = require('../desempenho');

let passou = 0, falhou = 0;
function check(nome, cond, detalhe) {
  if (cond) { passou++; console.log('  \x1b[32mOK \x1b[0m ' + nome); }
  else { falhou++; console.log('  \x1b[31mFALHOU\x1b[0m ' + nome + (detalhe ? ' — ' + detalhe : '')); }
}
const trecho = (src, ini, fim) => { const a = src.indexOf(ini), b = src.indexOf(fim, a); if (a < 0 || b < 0) throw new Error('trecho nao encontrado: ' + ini); return src.slice(a, b); };
const tiers = (lr, mql, sql) => ({ 'Padrão': { stages: { 'Lead Recebido': lr, 'Em Atendimento': mql, 'Reunião Agendada': sql, 'Oportunidade': 50, 'Convertido': 100 } } });

(async () => {
  // ── política no tempo ─────────────────────────────────
  console.log('Política sem efeito retroativo (politica.js)');
  const h1 = Politica.registrar([], 'standard', 'premium', 'modelo', '2026-11-15');
  check('primeira troca guarda o modelo anterior desde sempre', h1.length === 2 && h1[0].desde === Politica.INICIO && h1[0].modelo === 'standard' && h1[1].modelo === 'premium');
  const h2 = Politica.registrar(h1, 'premium', 'custom-1', 'modelo', '2026-11-15');
  check('duas trocas no mesmo dia: vale a última', h2.length === 2 && h2[1].modelo === 'custom-1');

  const modelos = [
    { id: 'standard', tiers: { rate: 10 } },                                   // formato antigo do banco
    { id: 'premium', tiers: tiers(5, 8, 30) },
    { id: 'custom-1', tiers: tiers(4, 6, 25), versions: [{ desde: Politica.INICIO, tiers: tiers(3, 5, 20) }, { desde: '2026-12-01', tiers: tiers(4, 6, 25) }] },
  ];
  const semHist = Politica.criar({ modelos, historico: [], modeloAtual: 'standard' });
  check('modelo no formato antigo ({rate}) usa os valores do preset', semHist.valoresEm('2026-10-10')['Em Atendimento'] === 5 && semHist.valoresEm('2026-10-10')['Lead Recebido'] === 3);
  const troca = Politica.criar({ modelos, historico: h1, modeloAtual: 'premium' });
  check('troca de modelo não muda o passado', troca.valoresEm('2026-10-31')['Em Atendimento'] === 5 && troca.valoresEm('2026-11-15')['Em Atendimento'] === 8);
  const versao = Politica.criar({ modelos, historico: [], modeloAtual: 'custom-1' });
  check('valor editado só vale da data da edição em diante', versao.valoresEm('2026-11-30')['Reunião Agendada'] === 20 && versao.valoresEm('2026-12-01')['Reunião Agendada'] === 25);
  const semModelo = Politica.criar({ modelos, historico: [], modeloAtual: null, padrao: { id: 'standard', tiers: Politica.PRESETS.standard } });
  check('sem modelo atribuído calcula pelo Padrão (como antes)', semModelo.valoresEm('2026-10-10')['Lead Recebido'] === 3);

  // ── front: cálculo usa a política ─────────────────────
  console.log('Cálculo no front com a política');
  const calc = trecho(web, 'const BONIF_FLOW=', '// ═══════════════════════════════════════════════════════\n// DATE / PERIOD HELPERS');
  const F = new Function('getModels', 'DEFAULT_BONIF_MODEL', calc + '\nreturn { calcLeadBonifPeriod, calcLeadBonif };')(() => [], { products: Politica.PRESETS.standard });
  const lead = { eligible: true, createdAt: '2026-10-05', reached: { 'Lead Recebido': '2026-10-05', 'Em Atendimento': '2026-10-20', 'Reunião Agendada': '2026-12-03' } };
  check('MQL em outubro pelo modelo antigo, SQL em dezembro pelo novo', F.calcLeadBonifPeriod(lead, troca, '2026-10-01', '2026-10-31') === 8 && F.calcLeadBonifPeriod(lead, troca, '2026-12-01', '2026-12-31') === 30,
    `${F.calcLeadBonifPeriod(lead, troca, '2026-10-01', '2026-10-31')} / ${F.calcLeadBonifPeriod(lead, troca, '2026-12-01', '2026-12-31')}`);
  check('total do lead soma cada etapa pelo valor da sua data', F.calcLeadBonif(lead, troca) === 3 + 5 + 30);
  check('lead fora da contagem rende zero com política', F.calcLeadBonifPeriod({ ...lead, eligible: false }, troca, null, null) === 0);
  check('index.html carrega politica.js e o servidor serve a rota', /<script src="\/politica\.js"><\/script>/.test(web) && /app\.get\('\/politica\.js'/.test(srv) && !/app\.use\(express\.static/.test(srv));
  check('troca de modelo e edição de valores gravam histórico', /function trocarModelo\(u,novo\)[\s\S]{0,300}Politica\.registrar/.test(web) && /m\.versions=Politica\.registrar/.test(web));

  // ── servidor: recaptura ───────────────────────────────
  console.log('Lead recapturado (servidor)');
  const helpers = trecho(srv, 'function mapLifecycle(', '// ── Base de leads do parceiro');
  const base = trecho(srv, '// ── Base de leads do parceiro', '// HubSpot sync proxy');
  const LEADS = { L1: '2026-10-20T10:00:00Z', L2: '2026-10-25T10:00:00Z', L3: '2026-10-26T10:00:00Z', X9: '2026-10-01T10:00:00Z' };
  const CONTATO = { L1: 'C1', L2: 'C1', L3: 'C2' };
  const DO_CONTATO = { C1: ['L2', 'L1'], C2: ['L3', 'X9'] };
  const fetchMock = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : {};
    const ok = data => ({ ok: true, json: async () => data, text: async () => '' });
    if (url.endsWith('/crm/v3/objects/leads/search')) return ok({ results: ['L1', 'L2', 'L3'].map(id => ({ id, properties: { hs_createdate: LEADS[id] } })) });
    if (url.endsWith('/crm/v4/associations/leads/contacts/batch/read')) return ok({ results: body.inputs.map(x => ({ from: { id: x.id }, to: [{ toObjectId: CONTATO[x.id] }] })) });
    if (url.endsWith('/crm/v3/objects/contacts/batch/read')) return ok({ results: body.inputs.map(x => ({ id: x.id, properties: { firstname: 'Ana', lastname: 'Lima', createdate: '2026-10-01T09:00:00Z', original_utm_affiliatename: 'cintia-souza', lifecyclestage: 'lead' } })) });
    if (url.endsWith('/crm/v4/associations/contacts/leads/batch/read')) return ok({ results: body.inputs.map(x => ({ from: { id: x.id }, to: DO_CONTATO[x.id].map(id => ({ toObjectId: id })) })) });
    if (url.endsWith('/crm/v3/objects/leads/batch/read')) { lidos.push(...body.inputs.map(x => x.id)); return ok({ results: body.inputs.map(x => ({ id: x.id, properties: { hs_createdate: LEADS[x.id] } })) }); }
    return ok({ results: [] });
  };
  const lidos = [];
  global.fetch = fetchMock;
  process.env.HUBSPOT_API_KEY = 'x';
  const M = new Function('global', helpers + base + '\nreturn { buildSyncData };')(global);
  const sd = await M.buildSyncData('cintia-souza', 'teste');
  const P = Object.fromEntries(sd.leads.map(l => [l.id, l]));
  check('primeiro lead do contato conta', P.L1.eligible === true && !P.L1.recaptura);
  check('mesmo contato voltando sai da soma', P.L2.eligible === false && P.L2.recaptura === true && /20\/10\/2026/.test(P.L2.ineligibleReason), P.L2.ineligibleReason);
  check('contato que entrou antes por outro canal não conta para ninguém', P.L3.eligible === false && P.L3.recaptura === true);
  check('totalLeads desconta as recapturas', sd.totalLeads === 1 && sd.excludedLeads === 2);
  check('só busca a data dos leads que ainda não conhecia', lidos.length === 1 && lidos[0] === 'X9', lidos.join(','));
  check('sync segue se a consulta de recaptura falhar', /async function primeiroLeadSeguro[\s\S]{0,200}catch/.test(srv));

  // ── origem gravada depois (histórico do campo) ────────
  console.log('Primeira origem gravada depois da criação do contato');
  const regra = trecho(srv, '// Regra (comercial, 11/11/2026): vale a PRIMEIRA', '// Quando o parceiro foi gravado');
  const E = new Function(regra + '\nreturn { checkEligibility };')();
  const ct = criado => ({ properties: { createdate: criado, original_utm_affiliatename: 'cintia-souza' } });
  check('contato do Pipedrive (2024) com o parceiro gravado em 2026 não conta', E.checkEligibility('cintia-souza', '2026-11-02T00:49:00Z', ct('2024-07-03T05:41:41Z'), '2026-11-02T00:35:37Z').eligible === false);
  check('parceiro gravado segundos após a criação conta (VisaMatch)', E.checkEligibility('cintia-souza', '2026-11-02T10:00:00Z', ct('2026-10-15T18:59:20Z'), '2026-10-15T18:59:38Z').eligible === true);
  check('gravado algumas horas depois ainda conta (tolerância de 24 h)', E.checkEligibility('cintia-souza', '2026-06-09T10:00:00Z', ct('2026-06-08T17:35:00Z'), '2026-06-08T21:18:00Z').eligible === true);
  check('carga inicial do workflow (24/04/2025) vale como da criação', E.checkEligibility('cintia-souza', '2025-04-22T10:00:00Z', ct('2025-04-21T20:56:00Z'), '2025-04-24T15:21:39Z').eligible === true);
  check('sem histórico não penaliza', E.checkEligibility('cintia-souza', '2026-11-02T10:00:00Z', ct('2024-07-03T05:41:41Z'), undefined).eligible === true);
  check('motivo explica desde quando o contato era nosso', /desde 03\/07\/2024/.test(E.checkEligibility('cintia-souza', '2026-11-02T00:49:00Z', ct('2024-07-03T05:41:41Z'), '2026-11-02T00:35:37Z').reason));
  check('sync segue se o histórico falhar', /async function origemGravadaSegura[\s\S]{0,200}catch/.test(srv));

  // ── desempenho com política ───────────────────────────
  console.log('Meu desempenho com a política');
  const meus = [
    { id: 'a', name: 'Ana L.**', eligible: true, createdAt: '2026-10-05', stage: 'Reunião Agendada', reached: { 'Lead Recebido': '2026-10-05', 'Em Atendimento': '2026-10-06', 'Reunião Agendada': '2026-12-02' } },
    { id: 'b', name: 'Bia M.**', eligible: true, createdAt: '2026-12-10', stage: 'Lead Recebido', reached: { 'Lead Recebido': '2026-12-10' } },
  ];
  const mesLeads = mes => meus.filter(l => l.createdAt.startsWith(mes)).map(l => ({ aff: 'cintia-souza', type: 'external', createdAt: l.createdAt, reached: l.reached, eligible: true }));
  const dez = montarDesempenho({ mes: '2026-12', hsId: 'cintia-souza', leadsParceiro: meus, leadsMes: mesLeads('2026-12'), politica: troca, mostrarValores: true, hoje: '2027-01-05' });
  const la = dez.leads.find(l => l.nome === 'Ana L.');
  check('lead de outubro que virou SQL em dezembro: só a etapa nova, com aviso', la.capturadoEm === '2026-10-05' && la.valor === 30 && la.etapasNoMes.join() === 'Reunião Agendada', JSON.stringify(la));
  check('total de dezembro pelos valores vigentes em dezembro', dez.bonificacao.total === 35, String(dez.bonificacao.total));
  check('contagem das taxas só do parceiro', dez.taxas.contagem && dez.taxas.contagem.leads === 1 && !('contagem' in dez.taxas.media));
  const out = montarDesempenho({ mes: '2026-10', hsId: 'cintia-souza', leadsParceiro: meus, leadsMes: mesLeads('2026-10'), politica: troca, mostrarValores: true, hoje: '2027-01-05' });
  check('outubro continua pelo modelo antigo', out.bonificacao.total === 8, String(out.bonificacao.total));

  // ── termo de adesão ───────────────────────────────────
  console.log('Termo de adesão');
  const vWeb = (web.match(/const TERMO_VERSAO='([^']+)'/) || [])[1], vSrv = (srv.match(/const TERMO_VERSAO = '([^']+)'/) || [])[1];
  check('mesma versão no front e no servidor', vWeb && vWeb === vSrv, `${vWeb} / ${vSrv}`);
  check('rota de aceite exige login', /app\.post\('\/api\/termo\/aceite',\s*exigirLogin/.test(srv));
  check('aceite gravado pelo servidor, não pelo saveUsers', !/terms_version:\s*u\./.test(trecho(web, 'function userToRow(u)', 'const getUsers')));
  check('colunas do termo e do histórico protegidas no gatilho', ['bonif_history', 'terms_version', 'terms_accepted_at'].every(c => new RegExp(`new\\.${c}\\s+is distinct from old\\.${c}`).test(sql)));
  check('sem a coluna no banco o termo não trava ninguém', /termsVersion!==undefined/.test(web) && /'terms_version' in row/.test(web));
  check('termo sem colchetes por preencher', !/\[[^\]`$]*\]/.test(trecho(web, 'const TERMO_HTML=`', '`;')));
  const aceitar = trecho(web, 'async function aceitarTermo(){', 'window.aceitarTermo=');
  check('na visualização o aceite não é gravado', aceitar.indexOf('if(vendoComo){ somenteLeitura()') > 0 && aceitar.indexOf('if(vendoComo){ somenteLeitura()') < aceitar.indexOf("fetch('/api/termo/aceite'"));
  check('sem marcar o check, Continuar só destaca o campo (não grava)', aceitar.indexOf("classList.add('erro')") > 0 && aceitar.indexOf("classList.add('erro')") < aceitar.indexOf("fetch('/api/termo/aceite'"));
  check('na visão do admin o termo é só prévia (sem check nem Continuar)', /m\.classList\.toggle\('previa',!!vendoComo\)/.test(web) && /#termo-modal\.previa \.termo-check,#termo-modal\.previa \.termo-erro,#termo-modal\.previa #termo-btn\{display:none!important\}/.test(web));
  check('servidor recusa aceite de quem não é parceiro', /if \(u\.role !== 'affiliate'\) return res\.status\(400\)/.test(srv));
  check('termo não fecha sozinho: só Sair (desloga) ou aceite', !/termo-modal[^\n]*onclick/.test(web) && !/keydown[\s\S]{0,80}fecharTermo/.test(web));
  check('volta a cada login enquanto não aceitar', /if \(precisaAceitarTermo\(currentUser\)\) abrirTermo\(\);/.test(trecho(web, 'function enterApp()', 'function showView(')));

  // ── ver como parceiro = visão do parceiro ─────────────
  console.log('Visão do admin idêntica à do parceiro');
  const corpo = nome => { const a = web.indexOf(nome); let i = web.indexOf('{', a), n = 0; for (let j = i; j < web.length; j++) { if (web[j] === '{') n++; else if (web[j] === '}' && --n === 0) return web.slice(a, j + 1); } return ''; };
  const telas = ['function renderAffDashboard(', 'function resumoMensalHTML(', 'function renderAffPipeline(', 'async function renderAffLinks(', 'function renderAffLinksList(', 'function renderAffProfile(', 'async function renderDesempenho('];
  telas.forEach(t => {
    const b = corpo(t);
    check(`${t.replace(/^(async )?function /, '').replace('(', '')} não muda de comportamento na visão do admin`, b.length > 50 && !/vendoComo|__vendoComo|role\s*===?\s*'admin'/.test(b));
  });
  check('a visão usa a mesma linha do parceiro (cópia de users)', /currentUser=JSON\.parse\(JSON\.stringify\(alvo\)\)/.test(web));
  const desemp = trecho(srv, "app.get('/api/desempenho'", '// ── Daily auto-sync');
  check('desempenho do admin é calculado só com os dados do parceiro', !/\beu\./.test(desemp.slice(desemp.indexOf('if (!alvo.hs_affiliate_id)'))));

  console.log(`\n${passou} passaram, ${falhou} falharam\n`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
