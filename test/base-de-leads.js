// Testa a base de leads do portal (server.js) e a bonificação por etapa
// atingida (index.html), com HubSpot mockado. Nenhuma chamada de rede.
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

// ── servidor ────────────────────────────────────────────
const helpers = trecho(srv, 'function mapLifecycle(', '// ── Base de leads do parceiro');
const base = trecho(srv, '// ── Base de leads do parceiro', '// HubSpot sync proxy');

// 250 leads (2 páginas), 3 cenários de contato
const leads = Array.from({ length: 250 }, (_, i) => ({ id: 'L' + i, properties: { hs_createdate: '2026-10-27T12:00:00Z' } }));
const contato = i => {
  if (i === 0) return { id: 'C0', properties: { firstname: 'Michel', lastname: 'Gouveia', createdate: '2024-11-05T09:00:00Z', original_utm_affiliatename: '', lifecyclestage: 'marketingqualifiedlead', hs_v2_date_entered_marketingqualifiedlead: '2026-10-24T16:00:00Z' } };
  if (i === 1) return { id: 'C1', properties: { firstname: 'Juira', lastname: 'Rezende', createdate: '2026-10-27T11:59:00Z', original_utm_affiliatename: 'imigrar', lifecyclestage: 'lead' } };
  if (i === 3) return { id: 'C3', properties: { firstname: 'Rui', lastname: 'Paz', createdate: '2026-10-27T11:00:00Z', original_utm_affiliatename: '', lifecyclestage: 'lead' } };
  if (i === 2) return { id: 'C2', properties: { firstname: 'Ana', lastname: 'Souza', createdate: '2026-10-20T10:00:00Z', original_utm_affiliatename: 'cintia-souza', lifecyclestage: 'lead', hs_latest_disqualified_lead_date: '2026-11-02', hs_v2_date_entered_marketingqualifiedlead: '2026-11-01T10:00:00Z' } };
  return { id: 'C' + i, properties: { firstname: 'Novo', lastname: String(i), createdate: '2026-10-27T11:00:00Z', original_utm_affiliatename: 'cintia-souza', lifecyclestage: 'lead' } };
};
let chamadasBusca = 0;
global.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : {};
  const ok = data => ({ ok: true, json: async () => data, text: async () => '' });
  if (url.endsWith('/crm/v3/objects/leads/search')) {
    chamadasBusca++;
    const start = body.after ? Number(body.after) : 0;
    const page = leads.slice(start, start + body.limit);
    return ok({ results: page, paging: start + body.limit < leads.length ? { next: { after: String(start + body.limit) } } : undefined });
  }
  if (url.endsWith('/crm/v4/associations/leads/contacts/batch/read'))
    return ok({ results: body.inputs.map(x => ({ from: { id: x.id }, to: [{ toObjectId: 'C' + x.id.slice(1) }] })) });
  if (url.endsWith('/crm/v3/objects/contacts/batch/read'))
    return ok({ results: body.inputs.map(x => contato(Number(x.id.slice(1)))) });
  if (url.includes('/crm/v3/owners')) return ok({ results: [] });
  if (url.endsWith('/crm/v4/associations/contacts/deals/batch/read')) return ok({ results: [] });
  return ok({ results: [] });
};
process.env.HUBSPOT_API_KEY = 'x';

const M = new Function('global', helpers + base + '\nreturn { fetchHubSpotLeads, buildSyncData };')(global);

(async () => {
  console.log('Base de leads (servidor)');
  const sd = await M.buildSyncData('cintia-souza', 'teste');
  const L = Object.fromEntries(sd.leads.map(l => [l.id, l]));
  check('pagina além de 200 leads', sd.leads.length === 250 && chamadasBusca === 2, `${sd.leads.length} leads, ${chamadasBusca} buscas`);
  check('contato antigo de outra origem fica fora', L.L0.eligible === false && L.L0.ineligibleReason);
  check('primeira origem nossa não conta, mesmo 1 minuto antes do lead (sem janela)', L.L1.eligible === false);
  check('origem vazia não conta (não veio por link de parceiro)', L.L3.eligible === false);
  check('contato com origem na parceira conta mesmo criado antes', L.L2.eligible === true);
  check('totalLeads conta só os elegíveis', sd.totalLeads === 247 && sd.excludedLeads === 3, `${sd.totalLeads}/${sd.excludedLeads}`);
  check('etapa nunca antes da criação do lead', L.L0.reached['Em Atendimento'] === '2026-10-27');
  check('desqualificado mantém a etapa atingida', L.L2.stage === 'Não Convertido' && L.L2.reached['Em Atendimento'] === '2026-11-01');
  check('nome ofuscado', L.L1.name === 'Juira R.**', L.L1.name);

  // ── front: bonificação por etapa atingida ────────────
  console.log('Bonificação (front)');
  const calc = trecho(web, 'const BONIF_FLOW=', '// ═══════════════════════════════════════════════════════\n// DATE / PERIOD HELPERS');
  const model = { products: { 'Padrão': { stages: { 'Lead Recebido': 3, 'Em Atendimento': 5, 'Reunião Agendada': 20, 'Oportunidade': 50, 'Convertido': 100 } } } };
  const F = new Function('getModels', 'DEFAULT_BONIF_MODEL', calc + '\nreturn { calcLeadBonifPeriod, reachedInPeriod, calcLeadBonif };')(() => [model], model);
  const out = ['2026-10-01', '2026-10-31'], nov = ['2026-11-01', '2026-11-30'];
  check('lead de outubro rende US$ 3 em outubro', F.calcLeadBonifPeriod(L.L4, model, ...out) === 3);
  check('lead que vira MQL em novembro rende só +5 em novembro', F.calcLeadBonifPeriod(L.L2, model, ...nov) === 5 && F.calcLeadBonifPeriod(L.L2, model, ...out) === 3);
  check('lead fora da regra rende 0', F.calcLeadBonifPeriod(L.L0, model, ...out) === 0);
  check('MQL contado no mês em que foi atingido', F.reachedInPeriod(L.L2, 'Em Atendimento', ...nov) && !F.reachedInPeriod(L.L2, 'Em Atendimento', ...out));
  const legado = { stage: 'Reunião Agendada', createdAt: '2026-10-10' };
  check('cache antigo sem reached ainda calcula', F.calcLeadBonif(legado, model) === 28);
  check('Date ou string como período', F.calcLeadBonifPeriod(L.L4, model, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-31T23:00:00Z')) === 3);
  // Pular o MQL é erro de operação do CRM: o SQL conta o MQL junto (US$ 28)
  const pulou = { eligible: true, createdAt: '2026-10-26', reached: { 'Lead Recebido': '2026-10-26', 'Reunião Agendada': '2026-10-28' } };
  check('SQL sem data de MQL rende US$ 28', F.calcLeadBonifPeriod(pulou, model, ...out) === 28, String(F.calcLeadBonifPeriod(pulou, model, ...out)));
  check('SQL sem data de MQL conta como MQL no mês do SQL', F.reachedInPeriod(pulou, 'Em Atendimento', ...out));
  const pulouNov = { eligible: true, createdAt: '2026-10-20', reached: { 'Lead Recebido': '2026-10-20', 'Reunião Agendada': '2026-11-03' } };
  check('lead de outubro que vira SQL direto em novembro: 3 em out, 25 em nov', F.calcLeadBonifPeriod(pulouNov, model, ...out) === 3 && F.calcLeadBonifPeriod(pulouNov, model, ...nov) === 25);
  const pulouOpp = { eligible: true, createdAt: '2026-10-20', reached: { 'Lead Recebido': '2026-10-20', 'Em Atendimento': '2026-10-21', 'Oportunidade': '2026-10-25' } };
  check('Oportunidade sem SQL conta o SQL (US$ 78)', F.calcLeadBonifPeriod(pulouOpp, model, ...out) === 78);
  check('não altera o objeto do lead', !('Em Atendimento' in pulou.reached));

  // ── front: leads que já estavam na base ──────────────
  console.log('Leads já na base (front)');
  const base2 = trecho(web, 'function validLeads(', 'function renderAdminOverview(');
  const fmtDate = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const B = new Function('fmtDate', base2 + '\nreturn { validLeads, leadsNaBase, motivoNaBase };')(fmtDate);
  check('separa válidos e já na base', B.validLeads(sd.leads).length === 247 && B.leadsNaBase(sd.leads).length === 3);
  check('motivo mostra desde quando o contato está no CRM', B.motivoNaBase(L.L0).includes('05/11/2024'), B.motivoNaBase(L.L0));
  check('cache antigo sem o campo não vai para a base', B.leadsNaBase([{ id: 'x' }]).length === 0);

  console.log(`\n${passou} passaram, ${falhou} falharam\n`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
