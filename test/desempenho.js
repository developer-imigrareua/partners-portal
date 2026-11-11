// Testa a aba "Meu desempenho" (desempenho.js): cálculo do mês, dinheiro só
// com liberação, e privacidade do placar. Sem rede.
const { montarDesempenho, faixa, nomeCurto } = require('../desempenho');

let passou = 0, falhou = 0;
function check(nome, cond, detalhe) {
  if (cond) { passou++; console.log('  \x1b[32mOK \x1b[0m ' + nome); }
  else { falhou++; console.log('  \x1b[31mFALHOU\x1b[0m ' + nome + (detalhe ? ' — ' + detalhe : '')); }
}

const lead = (aff, type, d, extra = {}) => ({ aff, type, createdAt: d, eligible: true, reached: { 'Lead Recebido': d, ...extra } });
const vezes = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// Mês: canal interno grande, canal pequeno, 14 parceiros (para passar de 10), a parceira "ana-teste"
const leadsMes = [
  ...vezes(2100, i => lead('imigrar', 'internal', '2026-10-05', i < 700 ? { 'Em Atendimento': '2026-10-06' } : {})),
  ...vezes(60, () => lead('canal-medio', 'internal', '2026-10-07')),
  ...vezes(3, () => lead('canal-mini', 'internal', '2026-10-08', { 'Em Atendimento': '2026-10-09' })),
  ...vezes(14, k => vezes(6 + k, () => lead('parceiro-' + k, 'external', '2026-10-09'))).flat(),
  ...vezes(20, () => lead('', '', '2026-10-10')),
];
const meus = [
  { id: '1', name: 'Carlos Á.** F.** d.** C.**', createdAt: '2026-10-10', eligible: true, stage: 'Reunião Agendada', reached: { 'Lead Recebido': '2026-10-10', 'Reunião Agendada': '2026-10-20' } },
  { id: '2', name: 'Ana S.**', createdAt: '2026-10-11', eligible: true, stage: 'Em Atendimento', reached: { 'Lead Recebido': '2026-10-11', 'Em Atendimento': '2026-10-12' } },
  { id: '3', name: 'Bia**', createdAt: '2026-10-12', eligible: true, stage: 'Lead Recebido', reached: { 'Lead Recebido': '2026-10-12' } },
  { id: '4', name: 'Velho C.**', createdAt: '2026-09-01', eligible: true, stage: 'Em Atendimento', reached: { 'Lead Recebido': '2026-09-01', 'Em Atendimento': '2026-10-03' } },
  { id: '5', name: 'Fora D.**', createdAt: '2026-10-13', eligible: false, stage: 'Lead Recebido', reached: { 'Lead Recebido': '2026-10-13' } },
];
leadsMes.push(...meus.filter(l => l.createdAt >= '2026-10-01').map(l => ({ aff: 'ana-teste', type: 'external', createdAt: l.createdAt, eligible: l.eligible, reached: l.reached })));
const modelo = { tiers: { 'Padrão': { stages: { 'Lead Recebido': 3, 'Em Atendimento': 5, 'Reunião Agendada': 20, 'Oportunidade': 50, 'Convertido': 100 } } } };
const base = { mes: '2026-10', hsId: 'ana-teste', leadsParceiro: meus, leadsMes, modelo, hoje: '2026-11-10' };

console.log('Meu desempenho');
const com = montarDesempenho({ ...base, mostrarValores: true });
const sem = montarDesempenho({ ...base, mostrarValores: false });

check('leads do mês contam só elegíveis criados no mês', com.resumo.leads === 3, com.resumo.leads);
check('Em Atendimento inclui avanço de lead de mês anterior e SQL sem MQL', com.resumo.emAtendimento === 3, com.resumo.emAtendimento);
check('bonificação: 3×3 + 3×5 + 1×20 = 44', com.bonificacao.total === 44, com.bonificacao.total);
check('lista mostra o valor gerado no mês por lead', com.leads.find(l => l.nome === 'Carlos C.').valor === 28);
check('lead de setembro que avançou em outubro rende só +5', com.leads.find(l => l.nome === 'Velho C.').valor === 5);
check('fora da contagem: na lista marcado, valor zero, sem nome completo', com.foraDaContagem === 1 && com.leads.filter(l => l.fora).length === 1 && com.leads.find(l => l.fora).valor === 0 && com.leads.find(l => l.fora).motivo && !JSON.stringify(com).includes('Fora D.**'));
check('lista traz o id do lead para auditoria', com.leads.every(l => l.id));
check('total do mês não muda com os leads fora da contagem', com.bonificacao.total === com.leads.filter(l => !l.fora).reduce((t, l) => t + l.valor, 0));
check('valor por etapa só das etapas atingidas no mês', com.leads.find(l => l.nome === 'Velho C.').etapasValor.map(e => e.etapa).join() === 'Em Atendimento');
check('sem liberação: nenhum valor em dinheiro', !('bonificacao' in sem) && sem.leads.every(l => !('valor' in l)) && sem.mostraValores === false);
check('liberado mas sem modelo: nenhum valor', !('bonificacao' in montarDesempenho({ ...base, modelo: null, mostrarValores: true })));
check('nome curto: primeiro nome + inicial do último', nomeCurto('Carlos Á.** F.** d.** C.**') === 'Carlos C.' && nomeCurto('Bia**') === 'Bia');
check('faixas de volume', faixa(2100) === '2.000+' && faixa(1500) === '1.000+' && faixa(60) === '50+' && faixa(9) === 'menos de 10');

console.log('Privacidade do placar');
const json = JSON.stringify(sem);
check('nenhum nome de canal ou parceiro na resposta', !/imigrar|canal-medio|canal-mini|parceiro-\d/.test(json));
check('nenhum volume real de terceiros', !json.includes('"2100"') && !json.includes(':2100') && !json.includes(':60,'));
check('rankings com no máximo 10 linhas', ['volume', 'qualif', 'avanco'].every(k => sem.rankings[k].linhas.length <= 10));
const vol = sem.rankings.volume.linhas;
check('canal grande aparece em faixa e anônimo', vol[0].rotulo === 'Canal interno A' && vol[0].valor === '2.000+');
check('pequenos agrupados em "Demais"', JSON.stringify(sem.rankings).includes('Demais canais internos'));
check('barra segue a posição, não o volume', vol[0].barra === 100 && vol[1].barra === 90);
check('fora do Top 10: sem número de posição', sem.placar.volume.posicao === null && sem.rankings.volume.voceForaDoTop.valor === '3');
check('taxa de terceiros aproximada com ≈', sem.rankings.qualif.linhas.filter(l => !l.voce).every(l => l.valor.startsWith('≈')));
check('lead sem afiliado entra na média, não no ranking', !json.includes('"rotulo":""'));
check('mês fechado não é parcial', sem.parcial === false);

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
