// Aba "Meu desempenho": cálculo do mês do parceiro e do placar anonimizado.
//
// Funções puras, sem rede: o server.js busca os dados no HubSpot e chama
// montarDesempenho(). Os números reais de canais internos e de outros
// parceiros entram aqui e SAEM só em faixas, aproximados e sem nome. Nada que
// identifique terceiros (nome do afiliado, volume exato, total de
// participantes) pode aparecer no objeto devolvido.
//
// Regra de canal (comercial, 10/11/2026): pelo lead no HubSpot,
// last_utm_affiliatetype = external → parceiro; internal → canal interno
// (cada last_utm_affiliatename é um canal). Lead sem afiliado entra na média
// do mês, mas não no ranking.

const FLOW = ['Lead Recebido', 'Em Atendimento', 'Reunião Agendada', 'Oportunidade', 'Convertido'];
const MIN_INDIVIDUAL = 5;     // abaixo disso o participante entra em "Demais ..."
const TOP = 10;

// Pular etapa é erro de operação do CRM: etapa anterior sem data conta na data
// da seguinte. Mesma regra do reachedStages() do index.html.
function preencherEtapas(reached) {
  const r = { ...(reached || {}) };
  for (let i = FLOW.length - 2; i >= 0; i--) {
    const next = r[FLOW[i + 1]];
    if (!r[FLOW[i]] && next) r[FLOW[i]] = next;
  }
  return r;
}

function intervaloDoMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('mês inválido (use AAAA-MM)');
  const [y, m] = mes.split('-').map(Number);
  const fim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(fim).padStart(2, '0')}` };
}

function faixa(n) {
  if (n >= 2000) return '2.000+';
  if (n >= 1000) return '1.000+';
  if (n >= 100) return '100+';
  if (n >= 50) return '50+';
  if (n >= 30) return '30+';
  if (n >= 10) return '10+';
  return 'menos de 10';
}
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const r1 = x => Math.round(x * 10) / 10;
const aprox = x => `≈ ${Math.round(x)}%`;

// "Carlos Á.** F.** d.** C.**" (nome já ofuscado no servidor) → "Carlos C."
function nomeCurto(ofuscado) {
  const partes = String(ofuscado || '').replace(/\.\*\*|\*\*/g, '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '—';
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.` : partes[0];
}

function etapaMaisAlta(reached, ate) {
  let alta = null;
  for (const st of FLOW) { const d = reached[st]; if (d && d <= ate) alta = st; }
  return alta;
}

// Funil de uma coorte (leads criados no mês): etapa atingida até o fim do mês.
function funil(leads, fim) {
  const f = { n: leads.length, mql: 0, sql: 0, opp: 0 };
  for (const l of leads) {
    const r = preencherEtapas(l.reached);
    if (r['Em Atendimento'] && r['Em Atendimento'] <= fim) f.mql++;
    if (r['Reunião Agendada'] && r['Reunião Agendada'] <= fim) f.sql++;
    if (r['Oportunidade'] && r['Oportunidade'] <= fim) f.opp++;
  }
  return f;
}
const taxas = f => ({
  qualif: pct(f.mql, f.n),       // Lead Recebido → Em Atendimento
  mqlSql: pct(f.sql, f.mql),     // Em Atendimento → Reunião Agendada
  avanco: pct(f.sql, f.n),       // Lead Recebido → Reunião Agendada
  sqlOpp: pct(f.opp, f.sql),     // Reunião Agendada → Oportunidade
});

// Participantes do placar a partir dos leads elegíveis do mês (todas as origens).
function participantes(leadsMes, hsId, fim) {
  const self = hsId.toLowerCase();
  const grupos = new Map();
  for (const l of leadsMes) {
    const nome = (l.aff || '').toLowerCase();
    if (!nome) continue;                                // sem afiliado: só na média
    if (!grupos.has(nome)) grupos.set(nome, { nome, leads: [], tipos: {} });
    const g = grupos.get(nome);
    g.leads.push(l);
    const t = (l.type || '').toLowerCase() === 'external' ? 'external' : 'internal';
    g.tipos[t] = (g.tipos[t] || 0) + 1;
  }
  if (!grupos.has(self)) grupos.set(self, { nome: self, leads: [], tipos: { external: 1 } });
  const lista = [...grupos.values()].map(g => ({
    nome: g.nome,
    self: g.nome === self,
    tipo: g.nome === self ? 'parceiro' : ((g.tipos.external || 0) > (g.tipos.internal || 0) ? 'parceiro' : 'canal'),
    leads: g.leads,
  }));

  // Pequenos viram "Demais canais internos" / "Demais parceiros".
  const individuais = [], demais = { canal: [], parceiro: [] };
  for (const p of lista) {
    if (p.self || p.leads.length >= MIN_INDIVIDUAL) individuais.push(p);
    else demais[p.tipo].push(...p.leads);
  }
  const ordemVol = (a, b) => b.leads.length - a.leads.length || a.nome.localeCompare(b.nome);
  const letra = i => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);
  let ic = 0, ip = 0;
  const entradas = individuais.sort(ordemVol).map(p => ({
    rotulo: p.self ? null : p.tipo === 'canal' ? `Canal interno ${letra(ic++)}` : `Parceiro ${letra(ip++)}`,
    tipo: p.self ? 'voce' : p.tipo,
    self: p.self,
    f: funil(p.leads, fim),
  }));
  if (demais.canal.length) entradas.push({ rotulo: 'Demais canais internos', tipo: 'canal', self: false, f: funil(demais.canal, fim) });
  if (demais.parceiro.length) entradas.push({ rotulo: 'Demais parceiros', tipo: 'parceiro', self: false, f: funil(demais.parceiro, fim) });

  // Posição entre os parceiros (externos individuais, pequenos inclusive).
  const meuVol = lista.find(p => p.self).leads.length;
  const posParceiros = 1 + lista.filter(p => !p.self && p.tipo === 'parceiro' && p.leads.length > meuVol).length;
  return { entradas, posParceiros };
}

// Ordena pelos valores reais e devolve só o Top 10, já anonimizado.
function ranking(entradas, valor, exibir) {
  const ord = entradas
    .filter(e => e.f.n > 0 || e.self)
    .map(e => ({ e, v: valor(e) }))
    .sort((a, b) => b.v - a.v || b.e.f.n - a.e.f.n || (a.e.self ? -1 : b.e.self ? 1 : 0));
  const pos = ord.findIndex(x => x.e.self) + 1;
  const linhas = ord.slice(0, TOP).map((x, i) => ({
    pos: i + 1,
    rotulo: x.e.self ? 'Você' : x.e.rotulo,
    tipo: x.e.tipo,
    voce: !!x.e.self,
    valor: exibir(x, x.e.self),
    barra: Math.round(((TOP - i) / TOP) * 100),    // segue a posição, não o volume
  }));
  const eu = ord.find(x => x.e.self);
  return {
    posicao: pos >= 1 && pos <= TOP ? pos : null,  // fora do Top 10: sem número
    linhas,
    voceForaDoTop: pos > TOP ? { valor: exibir(eu, true) } : null,
  };
}

function valoresDoModelo(model) {
  const p = model?.tiers || model?.products || {};
  return p['Padrão']?.stages || null;
}

// ── principal ───────────────────────────────────────────
// mes: 'AAAA-MM'; hsId: slug do parceiro
// leadsParceiro: saída de fetchHubSpotLeads(hsId) (todos os meses)
// leadsMes: leads de TODAS as origens criados no mês: {aff, type, createdAt, eligible, reached}
// modelo: linha de bonif_models (ou null); mostrarValores: liberação do admin
function montarDesempenho({ mes, hsId, leadsParceiro, leadsMes, modelo, mostrarValores, hoje }) {
  const { inicio, fim } = intervaloDoMes(mes);
  const hojeStr = (hoje || new Date().toISOString()).slice(0, 10);
  const valores = mostrarValores ? valoresDoModelo(modelo) : null;
  const dinheiro = !!valores;

  const meus = (leadsParceiro || []).filter(l => l.eligible !== false).map(l => ({ ...l, reached: preencherEtapas(l.reached) }));
  const noMes = d => d && d >= inicio && d <= fim;
  const criadosNoMes = meus.filter(l => noMes(l.createdAt));

  // Resumo: etapas atingidas DENTRO do mês (inclui leads de meses anteriores
  // que avançaram agora) — é o que gera pagamento.
  const atingiu = st => meus.filter(l => noMes(l.reached[st])).length;
  const resumo = {
    leads: criadosNoMes.length,
    emAtendimento: atingiu('Em Atendimento'),
    reuniao: atingiu('Reunião Agendada'),
    oportunidade: atingiu('Oportunidade'),
    convertido: atingiu('Convertido'),
  };

  const lista = meus
    .filter(l => FLOW.some(st => noMes(l.reached[st])))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    .map(l => {
      const item = { nome: nomeCurto(l.name), data: l.createdAt, etapa: etapaMaisAlta(l.reached, fim) };
      if (dinheiro) item.valor = FLOW.reduce((s, st) => s + (noMes(l.reached[st]) ? Number(valores[st]) || 0 : 0), 0);
      return item;
    });

  const foraDaContagem = (leadsParceiro || []).filter(l => l.eligible === false && noMes(l.createdAt)).length;
  const emAndamento = (leadsParceiro || []).filter(l => l.eligible !== false && noMes(l.createdAt)
    && ['Em Atendimento', 'Reunião Agendada', 'Oportunidade'].includes(l.stage)).length;

  // Placar e médias: coorte do mês, mesmo critério para todos.
  const elegiveisMes = (leadsMes || []).filter(l => l.eligible !== false);
  const media = taxas(funil(elegiveisMes, fim));
  const { entradas, posParceiros } = participantes(elegiveisMes, hsId, fim);
  const meu = entradas.find(e => e.self);
  const minhas = taxas(meu.f);

  const rkVolume = ranking(entradas, e => e.f.n, (x, self) => (self ? String(x.e.f.n) : faixa(x.e.f.n)));
  const rkQualif = ranking(entradas, e => taxas(e.f).qualif, (x, self) => (self ? `${r1(x.v).toFixed(1).replace('.', ',')}%` : aprox(x.v)));
  const rkAvanco = ranking(entradas, e => taxas(e.f).avanco, (x, self) => (self ? `${r1(x.v).toFixed(1).replace('.', ',')}%` : aprox(x.v)));

  const conquistas = [
    { id: 'lider-parceiros', titulo: 'Líder de volume entre parceiros', ok: posParceiros === 1,
      detalhe: posParceiros === 1 ? '1º lugar em volume entre os parceiros' : `Você está em ${posParceiros}º entre os parceiros` },
    { id: 'top5-volume', titulo: 'Top 5 em volume geral', ok: !!rkVolume.posicao && rkVolume.posicao <= 5,
      detalhe: rkVolume.posicao ? `${rkVolume.posicao}º lugar no ranking geral de volume` : 'Fora do Top 10 em volume neste mês' },
    { id: 'primeira-reuniao', titulo: 'Primeira reunião agendada', ok: resumo.reuniao > 0,
      detalhe: resumo.reuniao > 0 ? `${resumo.reuniao} lead${resumo.reuniao > 1 ? 's' : ''} chegou a Reunião Agendada` : 'Nenhum lead chegou a Reunião Agendada no mês' },
    { id: 'qualif-acima', titulo: 'Qualificação acima da média', ok: meu.f.n > 0 && minhas.qualif >= media.qualif,
      detalhe: meu.f.n > 0 && minhas.qualif >= media.qualif ? `${r1(minhas.qualif).toFixed(1).replace('.', ',')}% contra ${r1(media.qualif).toFixed(1).replace('.', ',')}% da média`
        : `Faltam ${r1(media.qualif - minhas.qualif).toFixed(1).replace('.', ',')} pontos percentuais para a média` },
    { id: 'primeira-oportunidade', titulo: 'Primeira oportunidade', ok: resumo.oportunidade > 0,
      detalhe: resumo.oportunidade > 0 ? `${resumo.oportunidade} lead${resumo.oportunidade > 1 ? 's' : ''} chegou a Oportunidade` : 'Nenhum lead chegou a Oportunidade ainda' },
    { id: 'base-em-movimento', titulo: 'Base em movimento', ok: emAndamento > 0,
      detalhe: emAndamento > 0 ? `${emAndamento} lead${emAndamento > 1 ? 's' : ''} segue${emAndamento > 1 ? 'm' : ''} em atendimento e ainda pode${emAndamento > 1 ? 'm' : ''} avançar` : 'Nenhum lead do mês em atendimento agora' },
  ];

  const out = {
    mes, inicio, fim,
    parcial: hojeStr <= fim,
    resumo,
    placar: {
      volume: { posicao: rkVolume.posicao, posParceiros },
      qualif: { posicao: rkQualif.posicao, voce: r1(minhas.qualif), media: r1(media.qualif) },
      avanco: { posicao: rkAvanco.posicao, voce: r1(minhas.avanco), media: r1(media.avanco) },
    },
    taxas: {
      voce: { qualif: r1(minhas.qualif), mqlSql: r1(minhas.mqlSql), avanco: r1(minhas.avanco), sqlOpp: r1(minhas.sqlOpp) },
      media: { qualif: r1(media.qualif), mqlSql: r1(media.mqlSql), avanco: r1(media.avanco), sqlOpp: r1(media.sqlOpp) },
    },
    rankings: { volume: rkVolume, qualif: rkQualif, avanco: rkAvanco },
    conquistas,
    leads: lista,
    foraDaContagem,
    emAndamento,
    mostraValores: dinheiro,
  };
  if (dinheiro) {
    const etapas = ['Lead Recebido', 'Em Atendimento', 'Reunião Agendada', 'Oportunidade', 'Convertido'];
    const qtd = { 'Lead Recebido': criadosNoMes.length, 'Em Atendimento': resumo.emAtendimento, 'Reunião Agendada': resumo.reuniao, 'Oportunidade': resumo.oportunidade, 'Convertido': resumo.convertido };
    // Lead Recebido paga pela data de criação, que é o reached['Lead Recebido'].
    qtd['Lead Recebido'] = atingiu('Lead Recebido');
    out.bonificacao = {
      total: lista.reduce((s, l) => s + l.valor, 0),
      etapas: etapas.map(st => ({ etapa: st, qtd: qtd[st], valor: Number(valores[st]) || 0, subtotal: qtd[st] * (Number(valores[st]) || 0) })),
      trilha: etapas.map(st => ({ etapa: st, valor: Number(valores[st]) || 0 })),
    };
  }
  return out;
}

module.exports = { montarDesempenho, preencherEtapas, intervaloDoMes, faixa, nomeCurto, FLOW, MIN_INDIVIDUAL };
