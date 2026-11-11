// Política comercial no tempo: qual valor vale para cada etapa de um lead.
//
// Regra do comercial (11/11/2026): mudar valores de um modelo, ou trocar o
// modelo de um parceiro, só vale daqui para a frente. Cada etapa é paga pelo
// valor vigente na data em que o lead a atingiu.
//
//   bonif_models.versions  [{ desde: 'AAAA-MM-DD', tiers: {...} }]
//   users.bonif_history    [{ desde: 'AAAA-MM-DD', modelo: 'id' | null }]
//
// Sem histórico (dados de antes da 1.4.0), vale o modelo e os valores atuais
// para qualquer data, que é o comportamento antigo.
//
// Arquivo compartilhado: o server.js usa com require() e o index.html carrega
// em /politica.js (window.Politica). Funções puras, sem rede.
(function (raiz) {
  const INICIO = '2000-01-01';

  // Valores dos presets. As linhas standard/premium do banco foram criadas
  // com um formato antigo ({"rate": 10}), sem valor por etapa: sem esta
  // correção, atribuir o "Padrão" a um parceiro dava US$ 0 em tudo.
  const etapas = (a, b, c, d, e) => ({ 'Lead Recebido': a, 'Em Atendimento': b, 'Reunião Agendada': c, 'Oportunidade': d, 'Convertido': e });
  const tier = (base, conv) => Object.fromEntries(Object.entries(conv).map(([p, v]) => [p, { stages: { ...base, Convertido: v } }]));
  const PRESETS = {
    standard: tier(etapas(3, 5, 20, 50, 100), { 'Padrão': 100, 'EB-2 NIW': 120, 'EB-1A': 130, 'O-1': 110, 'E-2': 100, 'L-1A': 100 }),
    premium: tier(etapas(5, 8, 30, 70, 150), { 'Padrão': 150, 'EB-2 NIW': 180, 'EB-1A': 200, 'O-1': 160, 'E-2': 150, 'L-1A': 150 }),
  };
  const tiersValidos = t => !!(t && t['Padrão'] && t['Padrão'].stages);
  // Tiers do modelo, trocando o formato antigo pelos valores do preset.
  function tiersDoModelo(m) {
    const t = m && (m.tiers || m.products);
    if (tiersValidos(t)) return t;
    return (m && PRESETS[m.id]) || null;
  }
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  const dia = d => (d ? String(d).slice(0, 10) : null);

  // Entrada vigente em `data` numa lista [{desde}]: a última com desde <= data.
  // Antes da primeira entrada, vale a primeira.
  function vigente(lista, data) {
    const ord = (lista || []).filter(x => x && x.desde).slice().sort((a, b) => a.desde.localeCompare(b.desde));
    if (!ord.length) return null;
    const d = dia(data) || hojeISO();
    let atual = ord[0];
    for (const x of ord) { if (x.desde <= d) atual = x; else break; }
    return atual;
  }

  // Nova entrada no histórico a partir de hoje. Se ainda não há histórico,
  // grava antes o estado anterior como vigente desde sempre, para o passado
  // continuar calculado como era. Duas mudanças no mesmo dia: vale a última.
  function registrar(lista, anterior, novo, chave, hoje) {
    const h = (hoje || hojeISO()).slice(0, 10);
    const out = (lista || []).filter(x => x && x.desde).map(x => ({ ...x }));
    if (!out.length) out.push({ desde: INICIO, [chave]: anterior });
    const i = out.findIndex(x => x.desde === h);
    if (i >= 0) out[i][chave] = novo; else out.push({ desde: h, [chave]: novo });
    return out.sort((a, b) => a.desde.localeCompare(b.desde));
  }

  // Tiers do modelo em `data` (versions ou, sem histórico, os atuais).
  function tiersEm(modelo, data) {
    if (!modelo) return null;
    const v = vigente(modelo.versions, data);
    return v && tiersValidos(v.tiers) ? v.tiers : tiersDoModelo(modelo);
  }

  // Política de um parceiro. modelos: lista de modelos (com id, tiers ou
  // products, versions); historico: users.bonif_history; modeloAtual:
  // users.bonif_model_id; padrao: modelo usado quando não há modelo atribuído
  // (o "Padrão (automático)" da Visão Geral). Esconder ou mostrar o dinheiro
  // ao parceiro é outra regra (hasPolicy / bonif_visible), não daqui.
  function criar({ modelos, historico, modeloAtual, padrao }) {
    const porId = new Map((modelos || []).map(m => [m.id, m]));
    const temHistorico = (historico || []).some(x => x && x.desde);
    return {
      // id do modelo atribuído na data (null = sem modelo naquele período)
      modeloEm(data) {
        if (!temHistorico) return modeloAtual || null;
        const v = vigente(historico, data);
        return v ? v.modelo || null : null;
      },
      tiersEm(data) {
        const id = this.modeloEm(data);
        return tiersEm((id && porId.get(id)) || padrao || null, data);
      },
      // valores por etapa do tier do produto (sempre 'Padrão' hoje: product é null)
      valoresEm(data, produto) {
        const t = this.tiersEm(data);
        if (!t) return {};
        const p = produto && t[produto] ? produto : 'Padrão';
        return (t[p] && t[p].stages) || (t['Padrão'] && t['Padrão'].stages) || {};
      },
    };
  }

  const api = { INICIO, PRESETS, tiersDoModelo, vigente, registrar, tiersEm, criar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Politica = api;
})(typeof window !== 'undefined' ? window : globalThis);
