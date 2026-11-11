require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// NAO servir o diretorio do projeto como estatico. express.static(__dirname)
// expunha publicamente server.js, package.json, audit.jsonl e outputs/*
// (este ultimo com dados reais de leads). O index.html nao referencia
// nenhum arquivo local — fontes, Chart.js e Supabase vem de CDN — entao
// o catch-all no fim do arquivo ja cobre todas as rotas.

// ── HubSpot helpers ──────────────────────────────────────

function mapLifecycle(ls, disqDate) {
  if (disqDate || ls === 'other' || ls === 'unqualifiedlead') return 'Não Convertido';
  if (ls === 'customer' || ls === 'evangelist') return 'Convertido';
  if (ls === 'opportunity') return 'Oportunidade';
  if (ls === 'salesqualifiedlead') return 'Reunião Agendada';
  if (ls === 'marketingqualifiedlead') return 'Em Atendimento';
  return 'Lead Recebido';
}

function obfuscateName(n) {
  const parts = (n || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  const rest = parts.slice(1).map(p => p[0] + '.**').join(' ');
  return rest ? `${parts[0]} ${rest}` : `${parts[0]}**`;
}

// ── Base de leads do parceiro ────────────────────────────
//
// O portal mostra a base de LEADS (objeto Lead do HubSpot), não de contatos.
// Um lead pertence ao parceiro quando last_utm_affiliatename = hsId.
// Cada lead traz o contato associado só para nome, dono e as datas em que o
// contato entrou em cada estágio do lifecycle (usadas na bonificação).

const HS_BASE = 'https://api.hubapi.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function hsRequest(path, { method = 'GET', body } = {}) {
  const r = await fetch(HS_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`HubSpot ${r.status} em ${path}: ${await r.text()}`);
  return r.json();
}

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Etapas do portal e a propriedade de data de entrada correspondente no contato.
const STAGE_DATE_PROPS = [
  ['Em Atendimento',   'hs_v2_date_entered_marketingqualifiedlead'],
  ['Reunião Agendada', 'hs_v2_date_entered_salesqualifiedlead'],
  ['Oportunidade',     'hs_v2_date_entered_opportunity'],
  ['Convertido',       'hs_v2_date_entered_customer'],
];

// Regra: contato que já existia no CRM antes da indicação não conta.
// O lead é elegível se a primeira origem do contato é o próprio parceiro, ou
// se o contato foi criado no máximo JANELA_DIAS antes do lead (fluxo normal do
// Visa Match / formulários, em que o contato nasce pouco antes do lead).
const JANELA_DIAS = 7;
function checkEligibility(hsId, leadCreatedAt, contact) {
  const p = contact?.properties || {};
  if (!contact) return { eligible: false, reason: 'Lead sem contato associado' };
  if ((p.original_utm_affiliatename || '').toLowerCase() === hsId.toLowerCase()) return { eligible: true, reason: null };
  const created = new Date(p.createdate), lead = new Date(leadCreatedAt);
  if (!isNaN(created) && !isNaN(lead) && (lead - created) <= JANELA_DIAS * 864e5) return { eligible: true, reason: null };
  return { eligible: false, reason: 'Contato já existia no CRM antes da indicação' };
}

// Lead recapturado (comercial, 11/11/2026): o mesmo contato pode ganhar um
// lead novo cada vez que volta a se cadastrar. Só o PRIMEIRO lead do contato
// conta, de qualquer origem; os seguintes saem da soma e não pagam de novo.
// conhecidos: { leadId: hs_createdate } já lidos, para não buscar de novo.
async function primeiroLeadDosContatos(contactIds, conhecidos = {}) {
  const leadsDoContato = {};
  for (const part of chunk(contactIds.map(id => ({ id })), 1000)) {
    const r = await hsRequest('/crm/v4/associations/contacts/leads/batch/read', { method: 'POST', body: { inputs: part } });
    (r.results || []).forEach(a => { leadsDoContato[a.from.id] = (a.to || []).map(t => String(t.toObjectId)); });
  }
  const criado = { ...conhecidos };
  const faltam = [...new Set(Object.values(leadsDoContato).filter(ids => ids.length > 1).flat())].filter(id => !criado[id]);
  for (const part of chunk(faltam, 100)) {
    const r = await hsRequest('/crm/v3/objects/leads/batch/read', { method: 'POST', body: { inputs: part.map(id => ({ id })), properties: ['hs_createdate'] } });
    (r.results || []).forEach(l => { criado[l.id] = l.properties?.hs_createdate || ''; });
    await sleep(120);
  }
  const primeiro = {};
  for (const [cid, ids] of Object.entries(leadsDoContato)) {
    const ord = ids.filter(id => criado[id]).sort((a, b) => criado[a].localeCompare(criado[b]) || Number(a) - Number(b));
    if (ord.length) primeiro[cid] = { id: ord[0], createdAt: criado[ord[0]].slice(0, 10) };
  }
  return primeiro;
}
// Falha na consulta de recaptura não derruba o sync: conta como antes.
async function primeiroLeadSeguro(contactIds, conhecidos) {
  try { return await primeiroLeadDosContatos(contactIds, conhecidos); }
  catch (e) { console.warn('HubSpot recaptura:', e.message); return {}; }
}
const dataBR = d => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
// Elegibilidade final: recaptura primeiro, depois a regra de contato pré-existente.
function elegibilidade(hsId, lead, contactId, contato, primeiro) {
  const p = contactId && primeiro[contactId];
  if (p && p.id !== String(lead.id)) return { eligible: false, recaptura: true, reason: `Recaptura: o contato já tinha entrado como lead em ${dataBR(p.createdAt)}` };
  return { ...checkEligibility(hsId, lead.properties?.hs_createdate, contato), recaptura: false };
}

async function fetchHubSpotLeads(hsId) {
  // 1. leads do parceiro, paginado (o limite de 200 por página é da API)
  const raw = [];
  let after;
  do {
    const body = {
      filterGroups: [{ filters: [{ propertyName: 'last_utm_affiliatename', operator: 'EQ', value: hsId }] }],
      properties: ['hs_lead_name', 'hs_createdate', 'hs_pipeline_stage'],
      sorts: [{ propertyName: 'hs_createdate', direction: 'ASCENDING' }],
      limit: 200,
    };
    if (after) body.after = after;
    const page = await hsRequest('/crm/v3/objects/leads/search', { method: 'POST', body });
    raw.push(...(page.results || []));
    after = page.paging?.next?.after;
    if (after) await sleep(250); // search API: ~5 req/s
  } while (after);

  // 2. lead -> contato
  const leadToContact = {};
  for (const part of chunk(raw.map(l => ({ id: l.id })), 1000)) {
    const r = await hsRequest('/crm/v4/associations/leads/contacts/batch/read', { method: 'POST', body: { inputs: part } });
    (r.results || []).forEach(a => { if (a.to?.length) leadToContact[a.from.id] = String(a.to[0].toObjectId); });
  }

  // 3. contatos
  const contactIds = [...new Set(Object.values(leadToContact))];
  const contacts = {};
  for (const part of chunk(contactIds, 100)) {
    const r = await hsRequest('/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      body: {
        inputs: part.map(id => ({ id })),
        properties: ['firstname', 'lastname', 'lifecyclestage', 'createdate', 'original_utm_affiliatename',
          'hs_latest_disqualified_lead_date', 'hubspot_owner_id', 'notes_last_updated', 'next_meeting_time',
          ...STAGE_DATE_PROPS.map(([, prop]) => prop)],
      },
    });
    (r.results || []).forEach(c => { contacts[c.id] = c; });
  }
  const primeiro = await primeiroLeadSeguro(contactIds, Object.fromEntries(raw.map(l => [String(l.id), l.properties?.hs_createdate || ''])));

  // 4. donos (contato e deal)
  let ownerMap = {};
  try {
    const o = await hsRequest('/crm/v3/owners?limit=100');
    (o.results || []).forEach(x => { ownerMap[x.id] = [x.firstName, x.lastName].filter(Boolean).join(' ') || x.email || String(x.id); });
  } catch (e) { console.warn('HubSpot owners fetch error:', e.message); }

  const dealOwnerMap = {};
  try {
    const contactToDeal = {};
    for (const part of chunk(contactIds.map(id => ({ id })), 1000)) {
      const r = await hsRequest('/crm/v4/associations/contacts/deals/batch/read', { method: 'POST', body: { inputs: part } });
      (r.results || []).forEach(a => { if (a.to?.length) contactToDeal[a.from.id] = String(a.to[0].toObjectId); });
    }
    const dealIds = [...new Set(Object.values(contactToDeal))];
    const dealOwner = {};
    for (const part of chunk(dealIds, 100)) {
      const r = await hsRequest('/crm/v3/objects/deals/batch/read', { method: 'POST', body: { inputs: part.map(id => ({ id })), properties: ['hubspot_owner_id'] } });
      (r.results || []).forEach(d => { dealOwner[d.id] = d.properties?.hubspot_owner_id; });
    }
    Object.entries(contactToDeal).forEach(([cid, did]) => { const oid = dealOwner[did]; if (oid) dealOwnerMap[cid] = ownerMap[oid] || oid; });
  } catch (e) { console.warn('HubSpot deal owners fetch error:', e.message); }

  // 5. normaliza
  return raw.map(l => {
    const contactId = leadToContact[l.id] || null;
    const ct = contactId ? contacts[contactId] : null;
    const p = ct?.properties || {};
    const createdAt = (l.properties?.hs_createdate || '').slice(0, 10);
    // data em que o lead atingiu cada etapa (nunca antes da criação do lead)
    const reached = { 'Lead Recebido': createdAt };
    STAGE_DATE_PROPS.forEach(([stage, prop]) => {
      const d = (p[prop] || '').slice(0, 10);
      if (d) reached[stage] = d < createdAt ? createdAt : d;
    });
    const { eligible, reason, recaptura } = elegibilidade(hsId, l, contactId, ct, primeiro);
    const ls = (p.lifecyclestage || '').toLowerCase();
    return {
      id: l.id,
      contactId,
      name: obfuscateName((p.firstname || '') + (p.lastname ? ' ' + p.lastname : '')),
      stage: mapLifecycle(ls, p.hs_latest_disqualified_lead_date),
      reached,
      eligible,
      ineligibleReason: reason,
      ...(recaptura ? { recaptura: true } : {}),
      product: null,
      createdAt,
      contactCreatedAt: (p.createdate || '').slice(0, 10),
      stageDate: (p.notes_last_updated || l.properties?.hs_createdate || '').slice(0, 10),
      owner: p.hubspot_owner_id || null,
      ownerName: ownerMap[p.hubspot_owner_id] || null,
      dealOwnerName: dealOwnerMap[contactId] || null,
      nextMeetingTime: p.next_meeting_time || null,
    };
  });
}

async function buildSyncData(hsId, source) {
  const leads = await fetchHubSpotLeads(hsId);
  const valid = leads.filter(l => l.eligible);
  const converted = valid.filter(l => l.reached['Convertido']).length;
  return {
    version: 2,
    totalLeads: valid.length,
    excludedLeads: leads.length - valid.length,
    converted,
    convRate: valid.length > 0 ? parseFloat(((converted / valid.length) * 100).toFixed(1)) : 0,
    lastSync: new Date().toISOString().slice(0, 10),
    source,
    leads,
  };
}

// HubSpot sync proxy (protects API key from being exposed in frontend)
app.get('/api/hubspot/sync', exigirAdmin, async (req, res) => {
  const { hsId } = req.query;
  if (!hsId) return res.status(400).json({ error: 'hsId obrigatório' });
  if (!process.env.HUBSPOT_API_KEY) return res.status(500).json({ error: 'HubSpot não configurado no servidor' });
  try {
    res.json({ syncData: await buildSyncData(hsId, 'HubSpot CRM') });
  } catch (err) {
    console.error('HubSpot sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Aba "Meu desempenho" ─────────────────────────────────
//
// Leads de TODAS as origens criados no mês, para o placar e a média. Volume
// grande (~4 mil/mês): fica em cache de memória e nunca vai inteiro ao front.
const { montarDesempenho, intervaloDoMes } = require('./desempenho');
const Politica = require('./politica');
const cacheMes = new Map();   // 'AAAA-MM' -> { em, promessa }

async function fetchLeadsDoMes(mes) {
  const { inicio, fim } = intervaloDoMes(mes);
  const raw = [];
  let after;
  do {
    const body = {
      filterGroups: [{ filters: [{ propertyName: 'hs_createdate', operator: 'BETWEEN', value: `${inicio}T00:00:00Z`, highValue: `${fim}T23:59:59.999Z` }] }],
      properties: ['hs_createdate', 'last_utm_affiliatename', 'last_utm_affiliatetype'],
      sorts: [{ propertyName: 'hs_createdate', direction: 'ASCENDING' }],
      limit: 200,
    };
    if (after) body.after = after;
    const page = await hsRequest('/crm/v3/objects/leads/search', { method: 'POST', body });
    raw.push(...(page.results || []));
    after = page.paging?.next?.after;
    if (after) await sleep(250);
  } while (after);

  const leadToContact = {};
  for (const part of chunk(raw.map(l => ({ id: l.id })), 1000)) {
    const r = await hsRequest('/crm/v4/associations/leads/contacts/batch/read', { method: 'POST', body: { inputs: part } });
    (r.results || []).forEach(a => { if (a.to?.length) leadToContact[a.from.id] = String(a.to[0].toObjectId); });
  }
  const contacts = {};
  for (const part of chunk([...new Set(Object.values(leadToContact))], 100)) {
    const r = await hsRequest('/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      body: { inputs: part.map(id => ({ id })), properties: ['createdate', 'original_utm_affiliatename', ...STAGE_DATE_PROPS.map(([, p]) => p)] },
    });
    (r.results || []).forEach(c => { contacts[c.id] = c; });
    await sleep(120);
  }
  const primeiro = await primeiroLeadSeguro([...new Set(Object.values(leadToContact))],
    Object.fromEntries(raw.map(l => [String(l.id), l.properties?.hs_createdate || ''])));
  return raw.map(l => {
    const aff = l.properties?.last_utm_affiliatename || '';
    const ct = contacts[leadToContact[l.id]] || null;
    const createdAt = (l.properties?.hs_createdate || '').slice(0, 10);
    const reached = { 'Lead Recebido': createdAt };
    STAGE_DATE_PROPS.forEach(([stage, prop]) => {
      const d = (ct?.properties?.[prop] || '').slice(0, 10);
      if (d) reached[stage] = d < createdAt ? createdAt : d;
    });
    return { aff, type: l.properties?.last_utm_affiliatetype || '', createdAt, reached,
      eligible: elegibilidade(aff, l, leadToContact[l.id], ct, primeiro).eligible };
  });
}

// Mês fechado: 6 h de cache; mês corrente: 30 min. Requisições simultâneas
// do mesmo mês esperam a mesma busca.
function leadsDoMes(mes) {
  const { fim } = intervaloDoMes(mes);
  const ttl = new Date().toISOString().slice(0, 10) > fim ? 6 * 3600e3 : 30 * 60e3;
  const c = cacheMes.get(mes);
  if (c && Date.now() - c.em < ttl) return c.promessa;
  const promessa = fetchLeadsDoMes(mes);
  cacheMes.set(mes, { em: Date.now(), promessa });
  promessa.catch(() => cacheMes.delete(mes));
  return promessa;
}

const ultimoMesFechado = () => {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

// Quem está chamando: valida o token do Supabase Auth e lê a linha em users.
// Cache de 60 s por token para não consultar o Supabase a cada chamada.
const cacheToken = new Map();
async function usuarioDaRequisicao(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const c = token && cacheToken.get(token);
  if (c && Date.now() - c.em < 60e3) return c.usuario;
  const usuario = await consultarUsuario(token);
  if (usuario) {
    if (cacheToken.size > 500) cacheToken.clear();
    cacheToken.set(token, { em: Date.now(), usuario });
  }
  return usuario;
}
async function consultarUsuario(token) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const authUser = await r.json();
  if (!authUser?.id) return null;
  const q = await fetch(`${SUPABASE_URL}/rest/v1/users?auth_id=eq.${encodeURIComponent(authUser.id)}&select=*`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
  if (!q.ok) return null;
  return (await q.json())[0] || null;
}

// Middlewares das rotas /api/*. Antes nenhuma rota verificava quem chamava
// (docs/07): quem soubesse a URL buscava leads, criava links ou alterava
// formulários. Admin passa sempre; afiliado só ativo.
function exigirLogin(req, res, next) {
  usuarioDaRequisicao(req).then(u => {
    if (!u) return res.status(401).json({ error: 'Faça login de novo.' });
    if (u.role !== 'admin' && u.status !== 'active') return res.status(403).json({ error: 'Conta não ativa' });
    req.usuario = u; next();
  }).catch(e => { console.error('auth:', e.message); res.status(500).json({ error: 'Falha ao validar o login' }); });
}
function exigirAdmin(req, res, next) {
  exigirLogin(req, res, () => {
    if (req.usuario.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    next();
  });
}

async function lerTabela(tabela) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=*`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status} em ${tabela}`);
  return r.json();
}
async function lerLinha(tabela, id) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status} em ${tabela}`);
  return (await r.json())[0] || null;
}

// POST /api/admin/ver-como { userId }
// Admin entra na visão de um parceiro. Não troca sessão: o front usa os dados
// que o admin já lê (sync_data, links_config, modelo). Esta rota só confirma o
// papel no servidor e grava o registro de uso em admin_view_log.
app.post('/api/admin/ver-como', exigirAdmin, async (req, res) => {
  try {
    const alvo = req.body?.userId ? await lerLinha('users', req.body.userId) : null;
    if (!alvo || alvo.role !== 'affiliate' || alvo.status !== 'active') return res.status(404).json({ error: 'Parceiro ativo não encontrado' });
    const registro = {
      admin_user_id: String(req.usuario.id), admin_email: req.usuario.email || null,
      partner_user_id: String(alvo.id), partner_name: alvo.name || null,
      user_agent: (req.headers['user-agent'] || '').slice(0, 300) || null,
    };
    // Sempre no log do servidor; na tabela quando ela existe (db/visao-parceiro.sql).
    console.log(`[ver-como] ${new Date().toISOString()} admin=${registro.admin_email || registro.admin_user_id} parceiro=${registro.partner_name} (${registro.partner_user_id})`);
    let gravado = false;
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/admin_view_log`, { method: 'POST', headers: { ...supabaseHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(registro) });
      gravado = r.ok;
      if (!r.ok) console.warn('[ver-como] tabela admin_view_log indisponível:', r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.warn('[ver-como] falha ao gravar registro:', e.message); }
    res.json({ ok: true, registrado: gravado });
  } catch (err) {
    console.error('ver-como error:', err.message);
    res.status(500).json({ error: 'Não foi possível abrir a visão do parceiro' });
  }
});

// POST /api/termo/aceite { versao }
// O parceiro aceita o Termo de Adesão. Só o servidor grava (as colunas estão
// no gatilho de colunas administrativas): o aceite não pode ser forjado pelo
// console. Cada aceite também vai para terms_acceptance (histórico).
const TERMO_VERSAO = '1.0';   // igual à do index.html
app.post('/api/termo/aceite', exigirLogin, async (req, res) => {
  try {
    const u = req.usuario;
    if (u.role !== 'affiliate') return res.status(400).json({ error: 'Só parceiros aceitam o termo' });
    if (req.body?.versao !== TERMO_VERSAO) return res.status(409).json({ error: 'Versão do termo desatualizada. Recarregue a página.' });
    const aceitoEm = new Date().toISOString();
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(u.id)}`, {
      method: 'PATCH', headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ terms_version: TERMO_VERSAO, terms_accepted_at: aceitoEm }),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    cacheToken.clear();   // o próximo request lê a linha atualizada
    let registrado = false;
    try {
      const h = await fetch(`${process.env.SUPABASE_URL}/rest/v1/terms_acceptance`, {
        method: 'POST', headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: String(u.id), user_name: u.name || null, user_email: u.email || null, version: TERMO_VERSAO,
          accepted_at: aceitoEm, user_agent: (req.headers['user-agent'] || '').slice(0, 300) || null }),
      });
      registrado = h.ok;
      if (!h.ok) console.warn('[termo] histórico indisponível:', h.status);
    } catch (e) { console.warn('[termo] falha no histórico:', e.message); }
    console.log(`[termo] ${aceitoEm} ${u.name || u.id} aceitou a versão ${TERMO_VERSAO}`);
    res.json({ ok: true, versao: TERMO_VERSAO, aceitoEm, registrado });
  } catch (err) {
    console.error('termo error:', err.message);
    res.status(500).json({ error: 'Não foi possível gravar o aceite agora.' });
  }
});

// GET /api/desempenho?mes=AAAA-MM            (parceiro logado: o próprio)
// GET /api/desempenho?mes=AAAA-MM&userId=X   (admin: prévia de um parceiro)
app.get('/api/desempenho', async (req, res) => {
  try {
    const eu = await usuarioDaRequisicao(req);
    if (!eu) return res.status(401).json({ error: 'Faça login de novo.' });
    let alvo = eu;
    if (eu.role === 'admin') {
      if (!req.query.userId) return res.status(400).json({ error: 'userId obrigatório para admin' });
      alvo = await lerLinha('users', req.query.userId);
      if (!alvo || alvo.role !== 'affiliate') return res.status(404).json({ error: 'Parceiro não encontrado' });
    } else if (eu.status !== 'active') {
      return res.status(403).json({ error: 'Conta não ativa' });
    }
    if (!alvo.hs_affiliate_id) return res.status(409).json({ error: 'Parceiro sem identificador do HubSpot' });

    const mes = req.query.mes || ultimoMesFechado();
    if (mes > new Date().toISOString().slice(0, 7)) return res.status(400).json({ error: 'Mês no futuro' });
    const modelos = await lerTabela('bonif_models').catch(() => []);
    const modelo = modelos.find(m => m.id === alvo.bonif_model_id) || null;
    const mostrarValores = alvo.bonif_visible === true && !!modelo;
    // Valores no tempo: cada etapa paga o valor vigente na data (politica.js).
    const politica = Politica.criar({ modelos, historico: alvo.bonif_history, modeloAtual: alvo.bonif_model_id,
      padrao: { id: 'standard', tiers: Politica.PRESETS.standard } });
    const [leadsParceiro, leadsMes] = await Promise.all([fetchHubSpotLeads(alvo.hs_affiliate_id), leadsDoMes(mes)]);

    const desempenho = montarDesempenho({ mes, hsId: alvo.hs_affiliate_id, leadsParceiro, leadsMes, modelo, politica, mostrarValores });
    // Meses com dado do parceiro, do primeiro lead até o mês corrente.
    const primeiro = leadsParceiro.map(l => l.createdAt).filter(Boolean).sort()[0];
    const meses = [];
    if (primeiro) {
      const d = new Date(primeiro.slice(0, 7) + '-01T00:00:00Z'), ate = new Date().toISOString().slice(0, 7);
      while (d.toISOString().slice(0, 7) <= ate && meses.length < 36) { meses.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
    }
    res.json({ ...desempenho, parceiro: alvo.name || '', meses: meses.reverse(), padrao: ultimoMesFechado() });
  } catch (err) {
    console.error('desempenho error:', err.message);
    res.status(500).json({ error: 'Não foi possível montar o desempenho agora. Tente de novo em instantes.' });
  }
});

// ── Daily auto-sync (7AM BRT = 10AM UTC) ────────────────

async function runDailySync() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, HUBSPOT_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !HUBSPOT_API_KEY) {
    console.warn('[daily-sync] Missing env vars, skipping.');
    return;
  }
  console.log('[daily-sync] Starting daily affiliate sync...');

  let affiliates = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/users?role=eq.affiliate&status=eq.active&hs_affiliate_id=not.is.null&select=id,hs_affiliate_id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    affiliates = await r.json();
  } catch (e) {
    console.error('[daily-sync] Failed to fetch affiliates:', e.message);
    return;
  }

  console.log(`[daily-sync] Syncing ${affiliates.length} affiliate(s)...`);
  for (const aff of affiliates) {
    try {
      const syncData = await buildSyncData(aff.hs_affiliate_id, 'HubSpot CRM (auto)');
      await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${aff.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ sync_data: syncData }),
      });
      console.log(`[daily-sync] ✓ ${aff.hs_affiliate_id}: ${syncData.totalLeads} leads válidos (${syncData.excludedLeads} fora da regra)`);
    } catch (e) {
      console.error(`[daily-sync] ✗ ${aff.hs_affiliate_id}:`, e.message);
    }
  }
  console.log('[daily-sync] Done.');
  leadsDoMes(ultimoMesFechado()).catch(e => console.warn('[daily-sync] cache do mês:', e.message));
}

// Schedule: every day at 10:00 UTC (07:00 BRT)
cron.schedule('0 10 * * *', runDailySync, { timezone: 'UTC' });

// shared helper — creates one short link
async function shortioCreate({ originalUrl, slug, title }) {
  const SHORTIO_KEY    = process.env.SHORTIO_API_KEY;
  const SHORTIO_DOMAIN = process.env.SHORTIO_DOMAIN;
  const FOLDER_ID      = process.env.SHORTIO_FOLDER_ID;
  const body = { domain: SHORTIO_DOMAIN, originalURL: originalUrl };
  if (slug)      body.path     = slug;
  if (title)     body.title    = title;
  if (FOLDER_ID) body.folderId = FOLDER_ID;
  const r = await fetch('https://api.short.io/links', {
    method: 'POST',
    headers: { authorization: SHORTIO_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
  return { shortUrl: data.shortURL, id: data.id, path: data.path };
}

// the 6 standard forms — same list as frontend LINK_FORMS
const LINK_FORMS = [
  { id: 'contato',   label: 'Contato Geral',   url: 'https://share.hsforms.com/12hi7RRqbSjO_J2khC6wPqgrnxd7' },
  { id: 'facebook',  label: 'Facebook Lead',    url: 'https://share.hsforms.com/1Y-9WTeoGTHODm2-aerOyDgrnxd7' },
  { id: 'eb2',       label: 'EB-2 / EB-3',      url: 'https://share.hsforms.com/1pWgVKSF7SWKdpAmcEdkbmgrnxd7' },
  { id: 'eb1a',      label: 'EB-1A / O-1',      url: 'https://share.hsforms.com/2LDtlx4vqTzi7YW6l0h-CRArnxd7' },
  { id: 'workvisa',  label: 'Work Visa',         url: 'https://share.hsforms.com/1piif7-DrSOmNxN2UHK3JEgrnxd7' },
  { id: 'typeform',  label: 'EB-1A + EB-2 NIW', url: 'https://99l4c7jw78n.pro.typeform.com/to/Iie2l4oF' },
];

function buildUTMUrl(baseUrl, hsId, affiliateType) {
  const p = new URLSearchParams({
    utm_source: 'general', utm_medium: 'affiliate', utm_campaign: 'analise-liv',
    utm_term: 'affiliate-audience', utm_content: 'direct-message',
    utm_affiliatetype: affiliateType || 'external', utm_affiliatename: hsId,
  });
  return `${baseUrl}?${p.toString()}`;
}

// ── Supabase helper ──────────────────────────────────────
function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

// Reenvia o corpo sem as colunas opcionais quando o Postgres ainda não as tem.
// Assim o portal funciona antes e depois da migração de escopo, sem janela de
// quebra: se scope/affiliate_ids não existem, o formulário nasce global.
const COLUNAS_OPCIONAIS = ['scope', 'affiliate_ids'];

async function gravarLinkForm(url, method, body) {
  const enviar = (corpo) => fetch(url, { method, headers: supabaseHeaders(), body: JSON.stringify(corpo) });
  let r = await enviar(body);
  if (r.status === 400) {
    const texto = await r.text();
    const faltante = COLUNAS_OPCIONAIS.find(c => texto.includes(`'${c}' column`));
    if (faltante) {
      console.warn(`link-forms: coluna ${faltante} ainda não existe — regravando sem as colunas de escopo`);
      const limpo = { ...body };
      COLUNAS_OPCIONAIS.forEach(c => delete limpo[c]);
      r = await enviar(limpo);
    } else {
      return { r, data: JSON.parse(texto || '{}') };
    }
  }
  return { r, data: await r.json() };
}

// link_forms CRUD
app.get('/api/link-forms', exigirLogin, async (req, res) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/link_forms?order=sort_order.asc`, {
      headers: supabaseHeaders(),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.json(data);
  } catch (err) {
    console.error('link-forms GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/link-forms', exigirAdmin, async (req, res) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const { r, data } = await gravarLinkForm(`${SUPABASE_URL}/rest/v1/link_forms`, 'POST', req.body);
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.status(201).json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    console.error('link-forms POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/link-forms/:id', exigirAdmin, async (req, res) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const { r, data } = await gravarLinkForm(`${SUPABASE_URL}/rest/v1/link_forms?id=eq.${req.params.id}`, 'PATCH', req.body);
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    console.error('link-forms PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/link-forms/:id', exigirAdmin, async (req, res) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/link_forms?id=eq.${req.params.id}`, {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify({ active: false }),
    });
    if (!r.ok) {
      const data = await r.json();
      throw new Error(data.message || `HTTP ${r.status}`);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('link-forms DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// short.io — bulk-create all 6 standard links for an affiliate
app.post('/api/shortio/create-bulk', exigirAdmin, async (req, res) => {
  const { hsId, affiliateName, affiliateType, userId } = req.body;
  if (!hsId) return res.status(400).json({ error: 'hsId obrigatório' });
  if (!process.env.SHORTIO_API_KEY) return res.status(500).json({ error: 'Short.io não configurado' });

  // fetch active forms from Supabase; fall back to hardcoded list
  let activeForms = LINK_FORMS;
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/link_forms?active=eq.true&order=sort_order.asc`, {
        headers: supabaseHeaders(),
      });
      if (r.ok) {
        const rows = await r.json();
        // Um formulário com escopo 'selected' só vale para os afiliados listados.
        // Sem a coluna scope, tudo é global — o comportamento anterior.
        const noEscopo = (f) => {
          if ((f.scope || 'all') !== 'selected') return true;
          const alvos = (Array.isArray(f.affiliate_ids) ? f.affiliate_ids : []).map(String);
          return alvos.includes(String(hsId)) || (userId && alvos.includes(String(userId)));
        };
        if (Array.isArray(rows) && rows.length) activeForms = rows.filter(noEscopo);
      }
    }
  } catch (e) {
    console.warn('create-bulk: using hardcoded forms (supabase error):', e.message);
  }

  const results = [];
  for (const form of activeForms) {
    // As linhas vindas do Supabase trazem base_url; o array local traz url.
    // Usar só form.url gerava "https://undefined?utm_..." em todo link criado
    // desde 85011f2 (17/06/2026). A normalização existia só no frontend.
    const baseUrl = form.url || form.base_url;
    if (!baseUrl) {
      results.push({ formId: form.id, label: form.label, ok: false, error: 'formulário sem base_url' });
      continue;
    }
    const originalUrl = buildUTMUrl(baseUrl, hsId, affiliateType);
    const slug  = `${hsId}-${form.id}`;
    const title = `${affiliateName || hsId} — ${form.label}`;
    try {
      const r = await shortioCreate({ originalUrl, slug, title });
      results.push({ formId: form.id, label: form.label, ...r, ok: true });
    } catch (e) {
      // slug already exists → fetch existing link
      if (e.message.includes('already exists') || e.message.includes('already taken')) {
        results.push({ formId: form.id, label: form.label, shortUrl: `https://${process.env.SHORTIO_DOMAIN}/${slug}`, path: slug, ok: true, existed: true });
      } else {
        results.push({ formId: form.id, label: form.label, ok: false, error: e.message });
      }
    }
  }
  res.json({ results });
});

// short.io — create a single shortened link
app.post('/api/shortio/create', exigirAdmin, async (req, res) => {
  const { originalUrl, slug, title } = req.body;
  if (!originalUrl) return res.status(400).json({ error: 'originalUrl obrigatório' });
  if (!process.env.SHORTIO_API_KEY || !process.env.SHORTIO_DOMAIN)
    return res.status(500).json({ error: 'Short.io não configurado no servidor' });
  try {
    const r = await shortioCreate({ originalUrl, slug, title });
    res.json(r);
  } catch (err) {
    console.error('Short.io create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// short.io — list links for the folder, optionally filtered by affiliateId
app.get('/api/shortio/links', exigirLogin, async (req, res) => {
  const SHORTIO_KEY       = process.env.SHORTIO_API_KEY;
  const SHORTIO_DOMAIN_ID = process.env.SHORTIO_DOMAIN_ID;
  const FOLDER_ID         = process.env.SHORTIO_FOLDER_ID;
  const { affiliateId }   = req.query;
  // Afiliado só lista os próprios links.
  if (req.usuario.role !== 'admin' && (affiliateId || '').toLowerCase() !== (req.usuario.hs_affiliate_id || '').toLowerCase())
    return res.status(403).json({ error: 'Sem permissão para estes links' });

  if (!SHORTIO_KEY)       return res.status(500).json({ error: 'SHORTIO_API_KEY não configurado' });
  if (!SHORTIO_DOMAIN_ID) return res.status(500).json({ error: 'SHORTIO_DOMAIN_ID não configurado' });

  try {
    let url = `https://api.short.io/api/links?domain_id=${SHORTIO_DOMAIN_ID}&limit=150`;
    if (FOLDER_ID)   url += `&folderId=${encodeURIComponent(FOLDER_ID)}`;
    if (affiliateId) url += `&search=${encodeURIComponent(affiliateId)}`;

    const r = await fetch(url, { headers: { authorization: SHORTIO_KEY } });
    const text = await r.text();
    if (!r.ok) throw new Error(`short.io ${r.status}: ${text.substring(0,200)}`);
    const data = JSON.parse(text);
    res.json(data);
  } catch (err) {
    console.error('Short.io list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// short.io — update an existing link (change destination URL or title)
app.patch('/api/shortio/update', exigirAdmin, async (req, res) => {
  const { linkId, originalUrl, title } = req.body;
  if (!linkId) return res.status(400).json({ error: 'linkId obrigatório' });

  const SHORTIO_KEY = process.env.SHORTIO_API_KEY;
  if (!SHORTIO_KEY) return res.status(500).json({ error: 'SHORTIO_API_KEY não configurado' });

  try {
    const body = {};
    if (originalUrl) body.originalURL = originalUrl;
    if (title)       body.title       = title;

    const r = await fetch(`https://api.short.io/links/${linkId}`, {
      method: 'POST',
      headers: { authorization: SHORTIO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.json({ ok: true, shortUrl: data.shortURL, id: data.idString });
  } catch (err) {
    console.error('Short.io update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fila por afiliado: a atualização é ler → alterar → gravar o JSON inteiro.
// Dois cliques seguidos do admin (ocultar vários links) rodavam em paralelo,
// liam a mesma config e o último PATCH apagava a alteração do primeiro.
const linksConfigFila = new Map();
function naFila(userId, tarefa) {
  const anterior = linksConfigFila.get(userId) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(tarefa);
  linksConfigFila.set(userId, atual);
  atual.finally(() => { if (linksConfigFila.get(userId) === atual) linksConfigFila.delete(userId); }).catch(() => {});
  return atual;
}

// Update links_config for an affiliate (hide/delete a link from their view)
app.patch('/api/affiliate/:userId/links-config', exigirAdmin, async (req, res) => {
  const { userId } = req.params;
  const { slug, action } = req.body; // action: 'hide' | 'show' | 'delete' | 'restore'
  if (!userId || !slug || !action) return res.status(400).json({ error: 'userId, slug e action obrigatórios' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });

  try {
    const current = await naFila(userId, async () => {
    // fetch current links_config
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=links_config`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await getRes.json();
    if (!getRes.ok || !rows?.length) throw new Error(`Afiliado não encontrado (${getRes.status})`);
    const current = rows[0].links_config || {};

    // apply action
    if (action === 'hide')    current[slug] = { ...current[slug], hidden: true };
    if (action === 'show')    { if (current[slug]) { delete current[slug].hidden; if (!Object.keys(current[slug]).length) delete current[slug]; } }
    if (action === 'delete')  current[slug] = { ...current[slug], deleted: true };
    if (action === 'restore') { if (current[slug]) { delete current[slug].deleted; if (!Object.keys(current[slug]).length) delete current[slug]; } }

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ links_config: current }),
    });
    if (!patchRes.ok) throw new Error(`Supabase ${patchRes.status}`);
    return current;
    });
    res.json({ ok: true, links_config: current });
  } catch (err) {
    console.error('links-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check — verifies HubSpot and short.io connectivity
app.get('/api/health', async (req, res) => {
  const HUBSPOT_KEY    = process.env.HUBSPOT_API_KEY;
  const SHORTIO_KEY    = process.env.SHORTIO_API_KEY;
  const SHORTIO_DOMAIN = process.env.SHORTIO_DOMAIN;

  const results = { hubspot: { ok: false }, shortio: { ok: false } };

  try {
    const r = await fetch('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${HUBSPOT_KEY}` },
    });
    if (r.ok) {
      const d = await r.json();
      results.hubspot = { ok: true, portalId: d.portalId, currency: d.companyCurrency };
    } else {
      results.hubspot = { ok: false, error: `HTTP ${r.status}` };
    }
  } catch (e) {
    results.hubspot = { ok: false, error: e.message };
  }

  try {
    if (!SHORTIO_KEY) throw new Error('SHORTIO_API_KEY não configurado');
    const r = await fetch('https://api.short.io/api/domains', {
      headers: { authorization: SHORTIO_KEY },
    });
    if (r.ok) {
      const d = await r.json();
      const domains = (d.domains || d || []).map(x => x.hostname || x.domain).filter(Boolean);
      results.shortio = { ok: true, domain: SHORTIO_DOMAIN, domains };
    } else {
      results.shortio = { ok: false, error: `HTTP ${r.status}` };
    }
  } catch (e) {
    results.shortio = { ok: false, error: e.message };
  }

  res.json(results);
});

// SPA fallback — never cache index.html so deploys take effect immediately
// Único arquivo servido além do index.html: o cálculo de política comercial,
// compartilhado com o front. Rota explícita, NÃO express.static (ver topo).
app.get('/politica.js', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('application/javascript').sendFile(path.join(__dirname, 'politica.js'));
});

app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Partner Portal running on port ${PORT}`);
  // Aquece o cache do último mês fechado para a primeira abertura da aba não esperar.
  if (process.env.HUBSPOT_API_KEY) setTimeout(() => leadsDoMes(ultimoMesFechado()).catch(e => console.warn('cache do mês:', e.message)), 15000);
});
