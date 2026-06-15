import { useState, useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  Link2,
  Copy,
  Check,
  TrendingUp,
  MousePointer,
  UserCheck,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  AlertCircle,
  ExternalLink,
  LogOut,
  Bell,
  Menu,
  Award,
  RefreshCw,
  Calendar,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

// ============================================================
// DATA SOURCE
// Dados sincronizados via HubSpot MCP (referred_by=leticia-ferrari)
// Para produção, substitua os objetos abaixo por chamadas fetch/axios
// apontando para seu backend proxy do HubSpot.
// Última sincronização: 11/06/2026
// ============================================================

const DATA_SOURCE = {
  syncedAt: "11/06/2026 · 14:18",
  source: "HubSpot CRM",
};

// ============================================================
// AFILIADA
// ============================================================

/** @type {AffiliateData} */
const AFFILIATE = {
  name: "Leticia Ferrari",
  id: "leticia-ferrari",
  email: "leticia.ferrari@liv.law",
  totalClicks: null,          // ← não disponível via HubSpot (configurar pixel)
  totalLeads: 156,
  totalConverted: 126,
  conversionRate: 80.8,
  bonificacaoBalance: 22518,  // simulado: 126 × $178 + 30 × $3
  bonificacaoPending: 22518,
};

// ============================================================
// ETAPAS DO PIPELINE
// Mapeamento: valor interno HubSpot → display do parceiro
// ============================================================

const PIPELINE_STAGES = {
  "Lead Recebido": {
    label: "Lead Recebido",
    emoji: "📥",
    colorClass: "bg-blue-100 text-blue-700",
    dot: "bg-blue-400",
  },
  "Em Atendimento": {
    label: "Em Atendimento",
    emoji: "📞",
    colorClass: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400",
  },
  "Reunião Agendada": {
    label: "Reunião Agendada",
    emoji: "📅",
    colorClass: "bg-teal-100 text-teal-700",
    dot: "bg-teal-400",
  },
  "Oportunidade": {
    label: "Oportunidade",
    emoji: "🤝",
    colorClass: "bg-purple-100 text-purple-700",
    dot: "bg-purple-400",
  },
  "Convertido": {
    label: "Convertido",
    emoji: "💰",
    colorClass: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-400",
  },
  "Não Convertido": {
    label: "Não Convertido",
    emoji: "❌",
    colorClass: "bg-red-100 text-red-700",
    dot: "bg-red-400",
  },
};

// ─── Comissionamento ─────────────────────────────────────────────────────────
const STAGE_COMMISSION = {
  "Lead Recebido":    3,
  "Em Atendimento":   5,
  "Reunião Agendada": 20,
  "Oportunidade":     50,
  "Convertido":       100,
};
const COMMISSION_FLOW = ["Lead Recebido", "Em Atendimento", "Reunião Agendada", "Oportunidade", "Convertido"];

function calcLeadCommission(stage) {
  const effective = stage === "Não Convertido" ? "Lead Recebido" : stage;
  const idx = COMMISSION_FLOW.indexOf(effective);
  if (idx === -1) return 0;
  return COMMISSION_FLOW.slice(0, idx + 1).reduce((sum, s) => sum + (STAGE_COMMISSION[s] || 0), 0);
}

const fmtUSD = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

// HubSpot lifecyclestage → etapa interna do dashboard
// Substitua pela leitura real de dealstage quando houver deal associado.
const HS_LIFECYCLE_TO_STAGE = {
  lead: "Lead Recebido",
  marketingqualifiedlead: "Em Atendimento",
  salesqualifiedlead: "Reunião Agendada",
  opportunity: "Oportunidade",
  customer: "Convertido",
  evangelist: "Convertido",
  other: "Não Convertido",
  disqualified: "Não Convertido",
};

/**
 * Resolve a etapa correta de um contato a partir das propriedades brutas do HubSpot.
 *
 * Regra aplicada:
 *   Se `hs_latest_disqualified_lead_date` estiver preenchida,
 *   for posterior a `createdate` E for mais recente que `hs_latest_qualified_lead_date`
 *   (ou não houver data qualificada), o lead é classificado como "Não Convertido",
 *   independentemente do lifecyclestage atual.
 *
 * Use esta função ao substituir os dados estáticos por chamadas reais de API:
 *   const stage = resolveStageFromHubSpot(contactProperties);
 */
function resolveStageFromHubSpot({
  createdate,
  lifecyclestage,
  hs_latest_disqualified_lead_date,
  hs_latest_qualified_lead_date,
}) {
  if (hs_latest_disqualified_lead_date) {
    const disqDate   = new Date(hs_latest_disqualified_lead_date);
    const createDt   = new Date(createdate);
    const qualDate   = hs_latest_qualified_lead_date
      ? new Date(hs_latest_qualified_lead_date)
      : null;

    const isAfterCreate  = disqDate > createDt;
    const isMostRecent   = !qualDate || disqDate >= qualDate;

    if (isAfterCreate && isMostRecent) return "Não Convertido";
  }
  return HS_LIFECYCLE_TO_STAGE[lifecyclestage] ?? "Lead Recebido";
}

// ============================================================
// LEADS — dados reais do HubSpot (LGPD: nomes ofuscados)
// Fonte: contacts com utm_affiliatename=leticia-ferrari
// ============================================================

/**
 * @type {Lead[]}
 * Etapas resolvidas via resolveStageFromHubSpot() com dados reais do HubSpot.
 * Leads marcados com "Não Convertido" possuem hs_latest_disqualified_lead_date
 * posterior ao createdate e mais recente que qualquer data qualificada no funil.
 */
const LEADS = [
  { id: "209952239135", name: "Romulo Q.**", stage: "Convertido", createdAt: "2026-03-18", stageDate: "2026-03-24", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2026-03-18", event: "Lead recebido" }, { date: "2026-03-24", event: "Cliente convertido" }] },
  { id: "205673203113", name: "Andreia S.**", stage: "Não Convertido", createdAt: "2026-02-26", stageDate: "2026-02-26", product: null, bonificacao: null, history: [{ date: "2026-02-26", event: "Lead recebido" }] },
  { id: "197257431867", name: "Camila F.J.**", stage: "Não Convertido", createdAt: "2026-01-29", stageDate: "2026-02-06", product: "E-2", bonificacao: null, history: [{ date: "2026-01-29", event: "Lead recebido" }, { date: "2026-02-06", event: "Lead desqualificado" }] },
  { id: "192738144618", name: "Arnaldo C.P.J.**", stage: "Convertido", createdAt: "2026-01-13", stageDate: "2023-02-08", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2026-01-13", event: "Lead recebido" }, { date: "2023-02-08", event: "Cliente convertido" }] },
  { id: "176239125666", name: "Pedro C.P.**", stage: "Não Convertido", createdAt: "2025-11-18", stageDate: "2025-11-18", product: null, bonificacao: null, history: [{ date: "2025-11-18", event: "Lead recebido" }] },
  { id: "176062475819", name: "Ana R.O.**", stage: "Convertido", createdAt: "2025-11-17", stageDate: "2025-11-21", product: "EB-1A", bonificacao: null, history: [{ date: "2025-11-17", event: "Lead recebido" }, { date: "2025-11-21", event: "Cliente convertido" }] },
  { id: "170724496702", name: "Felipe M.D.L.**", stage: "Não Convertido", createdAt: "2025-10-31", stageDate: "2025-10-31", product: null, bonificacao: null, history: [{ date: "2025-10-31", event: "Lead recebido" }] },
  { id: "170725110644", name: "Morgana J.Z.**", stage: "Não Convertido", createdAt: "2025-10-31", stageDate: "2025-10-31", product: null, bonificacao: null, history: [{ date: "2025-10-31", event: "Lead recebido" }] },
  { id: "165910539780", name: "Camila G.**", stage: "Não Convertido", createdAt: "2025-10-21", stageDate: "2025-10-28", product: "O-1", bonificacao: null, history: [{ date: "2025-10-21", event: "Lead recebido" }, { date: "2025-10-28", event: "Lead desqualificado" }] },
  { id: "160141296992", name: "Jorge C.F.**", stage: "Não Convertido", createdAt: "2025-10-01", stageDate: "2025-10-01", product: null, bonificacao: null, history: [{ date: "2025-10-01", event: "Lead recebido" }] },
  { id: "159850440373", name: "Maria C.D.S.S.**", stage: "Não Convertido", createdAt: "2025-09-30", stageDate: "2025-09-30", product: null, bonificacao: null, history: [{ date: "2025-09-30", event: "Lead recebido" }] },
  { id: "159821141941", name: "Andressa O.D.S.**", stage: "Não Convertido", createdAt: "2025-09-30", stageDate: "2025-09-30", product: null, bonificacao: null, history: [{ date: "2025-09-30", event: "Lead recebido" }] },
  { id: "157662396846", name: "Francilande M.P.S.S.**", stage: "Convertido", createdAt: "2025-09-23", stageDate: "2022-11-28", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-09-23", event: "Lead recebido" }, { date: "2022-11-28", event: "Cliente convertido" }] },
  { id: "153848528403", name: "Miriam M.**", stage: "Não Convertido", createdAt: "2025-09-08", stageDate: "2025-09-08", product: null, bonificacao: null, history: [{ date: "2025-09-08", event: "Lead recebido" }] },
  { id: "152677600114", name: "Stéffany O.**", stage: "Não Convertido", createdAt: "2025-09-03", stageDate: "2025-09-03", product: null, bonificacao: null, history: [{ date: "2025-09-03", event: "Lead recebido" }] },
  { id: "150568540579", name: "Sergio Z.**", stage: "Não Convertido", createdAt: "2025-08-26", stageDate: "2025-08-28", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-08-26", event: "Lead recebido" }, { date: "2025-08-28", event: "Lead desqualificado" }] },
  { id: "149883184033", name: "Paula G.**", stage: "Não Convertido", createdAt: "2025-08-23", stageDate: "2025-08-23", product: null, bonificacao: null, history: [{ date: "2025-08-23", event: "Lead recebido" }] },
  { id: "148494395236", name: "Thiago M.**", stage: "Convertido", createdAt: "2025-08-19", stageDate: "2025-08-21", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-08-19", event: "Lead recebido" }, { date: "2025-08-21", event: "Cliente convertido" }] },
  { id: "139223239462", name: "Uarlem J.D.F.O.**", stage: "Convertido", createdAt: "2025-07-18", stageDate: "2025-07-24", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-07-18", event: "Lead recebido" }, { date: "2025-07-24", event: "Cliente convertido" }] },
  { id: "139213151000", name: "Sandro R.**", stage: "Convertido", createdAt: "2025-07-18", stageDate: "2025-07-24", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-07-18", event: "Lead recebido" }, { date: "2025-07-24", event: "Cliente convertido" }] },
  { id: "129008024867", name: "Wendel A.**", stage: "Não Convertido", createdAt: "2025-06-12", stageDate: "2025-06-12", product: null, bonificacao: null, history: [{ date: "2025-06-12", event: "Lead recebido" }] },
  { id: "123189484298", name: "Rafael N.**", stage: "Convertido", createdAt: "2025-05-21", stageDate: "2022-11-07", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-05-21", event: "Lead recebido" }, { date: "2022-11-07", event: "Cliente convertido" }] },
  { id: "158484387900", name: "Vitória C.**", stage: "Não Convertido", createdAt: "2025-05-20", stageDate: "2025-05-20", product: null, bonificacao: null, history: [{ date: "2025-05-20", event: "Lead recebido" }] },
  { id: "114865888892", name: "Filipe D.**", stage: "Não Convertido", createdAt: "2025-04-18", stageDate: "2025-04-18", product: null, bonificacao: null, history: [{ date: "2025-04-18", event: "Lead recebido" }] },
  { id: "108801883434", name: "Livia P.**", stage: "Não Convertido", createdAt: "2025-03-25", stageDate: "2025-03-25", product: null, bonificacao: null, history: [{ date: "2025-03-25", event: "Lead recebido" }] },
  { id: "105896435115", name: "Andressa B.L.**", stage: "Não Convertido", createdAt: "2025-03-13", stageDate: "2025-03-13", product: null, bonificacao: null, history: [{ date: "2025-03-13", event: "Lead recebido" }] },
  { id: "105861341835", name: "Julius W.**", stage: "Não Convertido", createdAt: "2025-03-13", stageDate: "2025-03-13", product: "E-2", bonificacao: null, history: [{ date: "2025-03-13", event: "Lead recebido" }] },
  { id: "105053610777", name: "Samuel P.**", stage: "Convertido", createdAt: "2025-03-10", stageDate: "2025-03-10", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-03-10", event: "Lead recebido" }] },
  { id: "102607372471", name: "Giuseppe A.**", stage: "Convertido", createdAt: "2025-02-27", stageDate: "2025-02-27", product: "E-2", bonificacao: null, history: [{ date: "2025-02-27", event: "Lead recebido" }] },
  { id: "100072843575", name: "Wanderson C.C.**", stage: "Não Convertido", createdAt: "2025-02-17", stageDate: "2025-02-19", product: "L-1A", bonificacao: null, history: [{ date: "2025-02-17", event: "Lead recebido" }, { date: "2025-02-19", event: "Lead desqualificado" }] },
  { id: "99238309027", name: "Carlos E.V.S.**", stage: "Convertido", createdAt: "2025-02-13", stageDate: "2025-02-13", product: "EB-1A", bonificacao: null, history: [{ date: "2025-02-13", event: "Lead recebido" }] },
  { id: "99235638081", name: "Michel M.F.**", stage: "Convertido", createdAt: "2025-02-13", stageDate: "2024-04-10", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-02-13", event: "Lead recebido" }, { date: "2024-04-10", event: "Cliente convertido" }] },
  { id: "99032246939", name: "Angelo D.O.**", stage: "Não Convertido", createdAt: "2025-02-12", stageDate: "2025-02-19", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-02-12", event: "Lead recebido" }, { date: "2025-02-19", event: "Lead desqualificado" }] },
  { id: "94730385467", name: "Diego C.**", stage: "Não Convertido", createdAt: "2025-01-27", stageDate: "2025-02-14", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-01-27", event: "Lead recebido" }, { date: "2025-02-14", event: "Lead desqualificado" }] },
  { id: "91855412802", name: "Paulo C.D.S.C.J.**", stage: "Convertido", createdAt: "2025-01-15", stageDate: "2025-01-16", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2025-01-15", event: "Lead recebido" }, { date: "2025-01-16", event: "Cliente convertido" }] },
  { id: "89711199924", name: "Fabricio P.D.S.**", stage: "Não Convertido", createdAt: "2025-01-07", stageDate: "2025-01-07", product: null, bonificacao: null, history: [{ date: "2025-01-07", event: "Lead recebido" }] },
  { id: "85235021591", name: "Matheus C.**", stage: "Não Convertido", createdAt: "2024-12-20", stageDate: "2025-05-21", product: "O-1", bonificacao: null, history: [{ date: "2024-12-20", event: "Lead recebido" }, { date: "2025-05-21", event: "Lead desqualificado" }] },
  { id: "81132684462", name: "Timothy T.O.**", stage: "Convertido", createdAt: "2024-11-29", stageDate: "2024-12-03", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-11-29", event: "Lead recebido" }, { date: "2024-12-03", event: "Cliente convertido" }] },
  { id: "80590289941", name: "Alexandre P.D.S.**", stage: "Convertido", createdAt: "2024-11-27", stageDate: "2024-11-27", product: "EB-1A", bonificacao: null, history: [{ date: "2024-11-27", event: "Lead recebido" }] },
  { id: "76995103410", name: "Rogeria C.**", stage: "Convertido", createdAt: "2024-11-12", stageDate: "2024-11-12", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-11-12", event: "Lead recebido" }] },
  { id: "75270511997", name: "Ricardo D.**", stage: "Convertido", createdAt: "2024-11-05", stageDate: "2024-11-08", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-11-05", event: "Lead recebido" }, { date: "2024-11-08", event: "Cliente convertido" }] },
  { id: "82271221815", name: "Maria C.N.M.M.**", stage: "Não Convertido", createdAt: "2024-10-24", stageDate: "2024-10-24", product: null, bonificacao: null, history: [{ date: "2024-10-24", event: "Lead recebido" }] },
  { id: "71697372198", name: "Roberto C.**", stage: "Convertido", createdAt: "2024-10-24", stageDate: "2024-10-31", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-10-24", event: "Lead recebido" }, { date: "2024-10-31", event: "Cliente convertido" }] },
  { id: "62528627111", name: "Leonardo P.S.D.M.**", stage: "Não Convertido", createdAt: "2024-10-03", stageDate: "2024-10-03", product: null, bonificacao: null, history: [{ date: "2024-10-03", event: "Lead recebido" }] },
  { id: "64321936679", name: "Ketlyn C.R.D.M.**", stage: "Não Convertido", createdAt: "2024-10-03", stageDate: "2024-10-03", product: null, bonificacao: null, history: [{ date: "2024-10-03", event: "Lead recebido" }] },
  { id: "57444274500", name: "Renata L.**", stage: "Convertido", createdAt: "2024-09-12", stageDate: "2023-12-10", product: null, bonificacao: null, history: [{ date: "2024-09-12", event: "Lead recebido" }, { date: "2023-12-10", event: "Cliente convertido" }] },
  { id: "51868510231", name: "Angelica S.**", stage: "Convertido", createdAt: "2024-08-26", stageDate: "2024-08-28", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-08-26", event: "Lead recebido" }, { date: "2024-08-28", event: "Cliente convertido" }] },
  { id: "46730169617", name: "Daniel L.**", stage: "Convertido", createdAt: "2024-08-08", stageDate: "2024-08-01", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-08-08", event: "Lead recebido" }, { date: "2024-08-01", event: "Cliente convertido" }] },
  { id: "43318753929", name: "Ana P.G.**", stage: "Convertido", createdAt: "2024-07-28", stageDate: "2024-08-01", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-28", event: "Lead recebido" }, { date: "2024-08-01", event: "Cliente convertido" }] },
  { id: "39701832872", name: "Danilo F.**", stage: "Não Convertido", createdAt: "2024-07-16", stageDate: "2025-08-18", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-16", event: "Lead recebido" }, { date: "2025-08-18", event: "Lead desqualificado" }] },
  { id: "37937282110", name: "Viviane K.**", stage: "Convertido", createdAt: "2024-07-10", stageDate: "2023-05-08", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-10", event: "Lead recebido" }, { date: "2023-05-08", event: "Cliente convertido" }] },
  { id: "37513246030", name: "Ricardo G.**", stage: "Convertido", createdAt: "2024-07-09", stageDate: "2024-07-09", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-09", event: "Lead recebido" }] },
  { id: "35614660473", name: "Patricia M.Q.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2026-01-13", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2026-01-13", event: "Cliente convertido" }] },
  { id: "35634229117", name: "André L.A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-09-04", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-09-04", event: "Cliente convertido" }] },
  { id: "35642532431", name: "Gisele M.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-08-22", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-08-22", event: "Cliente convertido" }] },
  { id: "35642532162", name: "Teógenes P.M.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2026-01-11", product: "O-1", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2026-01-11", event: "Cliente convertido" }] },
  { id: "35633429071", name: "Wellington S.**", stage: "Não Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35631139077", name: "Milene D.Á.M.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-01-12", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-01-12", event: "Cliente convertido" }] },
  { id: "35632850949", name: "Vitor S.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-11-02", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-11-02", event: "Cliente convertido" }] },
  { id: "35641436688", name: "Aline P.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35633428352", name: "Thaís B.F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-06-19", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-06-19", event: "Cliente convertido" }] },
  { id: "35634209877", name: "Cleider L.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-06-23", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-06-23", event: "Cliente convertido" }] },
  { id: "35641292701", name: "Marcos R.V.F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-06-07", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-06-07", event: "Cliente convertido" }] },
  { id: "35634408735", name: "Viviane L.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35616746005", name: "Jakeline C.V.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-06-09", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-06-09", event: "Cliente convertido" }] },
  { id: "35629388320", name: "Eli O.S.D.F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-05-30", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-05-30", event: "Cliente convertido" }] },
  { id: "35628702749", name: "Guilherme G.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-05-30", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-05-30", event: "Cliente convertido" }] },
  { id: "35633450169", name: "Hiago L.F.R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-05-11", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-05-11", event: "Cliente convertido" }] },
  { id: "35633125436", name: "Valmir S.F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-03-16", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-03-16", event: "Cliente convertido" }] },
  { id: "35633428038", name: "Rodrigo G.B.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-01-27", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-01-27", event: "Cliente convertido" }] },
  { id: "35628702509", name: "Camila G.D.M.N.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-02-24", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-02-24", event: "Cliente convertido" }] },
  { id: "35633410928", name: "John E.F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-03-07", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-03-07", event: "Cliente convertido" }] },
  { id: "35629746980", name: "Maria C.M.R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-02-23", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-02-23", event: "Cliente convertido" }] },
  { id: "35629726049", name: "João**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-03-14", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-03-14", event: "Cliente convertido" }] },
  { id: "35616405339", name: "Tiago D.F.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-02-13", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-02-13", event: "Cliente convertido" }] },
  { id: "35632535095", name: "João A.D.Q.N.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-02-06", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-02-06", event: "Cliente convertido" }] },
  { id: "35642232116", name: "Danielle B.B.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-01-30", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-01-30", event: "Cliente convertido" }] },
  { id: "35633939734", name: "Lorena A.N.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-01-27", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-01-27", event: "Cliente convertido" }] },
  { id: "35632768378", name: "Juarez P.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-01-19", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-01-19", event: "Cliente convertido" }] },
  { id: "35629725833", name: "Sidney C.D.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-01-16", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-01-16", event: "Cliente convertido" }] },
  { id: "35631363480", name: "Alexandre F.L.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-01-23", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-01-23", event: "Cliente convertido" }] },
  { id: "35633449537", name: "Maria A.N.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-02-03", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-02-03", event: "Cliente convertido" }] },
  { id: "35628734751", name: "Mika S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35633699903", name: "Diego P.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-01-24", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-01-24", event: "Cliente convertido" }] },
  { id: "35631746918", name: "Pablo K.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-11-18", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-11-18", event: "Cliente convertido" }] },
  { id: "35617311776", name: "Dinarte S.N.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-12-28", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-12-28", event: "Cliente convertido" }] },
  { id: "35633838240", name: "Tamara S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35633634471", name: "Andrea D.S.G.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-12-13", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-12-13", event: "Cliente convertido" }] },
  { id: "35633699853", name: "Carlos M.S.R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-12-20", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-12-20", event: "Cliente convertido" }] },
  { id: "35632358747", name: "Mariana C.O.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-10-17", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-10-17", event: "Cliente convertido" }] },
  { id: "35634225552", name: "Neliza J.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-10-11", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-10-11", event: "Cliente convertido" }] },
  { id: "35632672129", name: "Nathalia F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-10-21", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-10-21", event: "Cliente convertido" }] },
  { id: "35633699760", name: "Ellan C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-09-23", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-09-23", event: "Cliente convertido" }] },
  { id: "35631363384", name: "Weber A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-08-23", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-08-23", event: "Cliente convertido" }] },
  { id: "35630758001", name: "Rafaelclementino S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35617311658", name: "Nathalia P.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-09-02", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-09-02", event: "Cliente convertido" }] },
  { id: "35633699759", name: "Gardênia V.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-10-08", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-10-08", event: "Cliente convertido" }] },
  { id: "35628701815", name: "Ricardo L.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-09-17", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-09-17", event: "Cliente convertido" }] },
  { id: "35632849266", name: "Luziatavares19**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35632391541", name: "Rdibai**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35633626690", name: "Wellington C.**", stage: "Não Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35634225218", name: "Eustáquio R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2022-07-01", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2022-07-01", event: "Cliente convertido" }] },
  { id: "35617310567", name: "Roberta K.Q.D.S.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-10-01", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-10-01", event: "Cliente convertido" }] },
  { id: "35633426071", name: "Leonardo P.C.A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-02-27", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-02-27", event: "Cliente convertido" }] },
  { id: "35631745452", name: "Flavio D.A.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-11-13", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-11-13", event: "Cliente convertido" }] },
  { id: "35633633133", name: "João B.D.S.N.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-06-14", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-06-14", event: "Cliente convertido" }] },
  { id: "35631395594", name: "Rafael D.O.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-08-08", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-08-08", event: "Cliente convertido" }] },
  { id: "35631135564", name: "Lucas M.M.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-05-10", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-05-10", event: "Cliente convertido" }] },
  { id: "35632766765", name: "Simone F.C.T.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-07-27", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-07-27", event: "Cliente convertido" }] },
  { id: "35633017346", name: "Alberto S.K.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-04-02", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-04-02", event: "Cliente convertido" }] },
  { id: "35629004107", name: "PRISCILA Z.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-04-03", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-04-03", event: "Cliente convertido" }] },
  { id: "35632356786", name: "Juliana B.D.D.A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35630699188", name: "Aline B.D.C.D.A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-04-02", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-04-02", event: "Cliente convertido" }] },
  { id: "35640332885", name: "Giceli N.Z.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-10-18", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-10-18", event: "Cliente convertido" }] },
  { id: "35631417381", name: "Vinícius A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-04-23", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-04-23", event: "Cliente convertido" }] },
  { id: "35616402996", name: "Rangel D.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-05-17", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-05-17", event: "Cliente convertido" }] },
  { id: "35633008140", name: "Michele P.D.A.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-07-03", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-07-03", event: "Cliente convertido" }] },
  { id: "35629881113", name: "Bruno H.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-09-05", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-09-05", event: "Cliente convertido" }] },
  { id: "35614333859", name: "Carolina R.G.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-03-27", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-03-27", event: "Cliente convertido" }] },
  { id: "35613539347", name: "Danilo D.L.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2025-02-06", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2025-02-06", event: "Cliente convertido" }] },
  { id: "35628872234", name: "Carlos F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-12-18", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-12-18", event: "Cliente convertido" }] },
  { id: "35631383093", name: "Marcio D.S.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-01-22", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-01-22", event: "Cliente convertido" }] },
  { id: "35631744657", name: "Antônio L.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-11-09", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-11-09", event: "Cliente convertido" }] },
  { id: "35633425255", name: "Larissa C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-10-18", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-10-18", event: "Cliente convertido" }] },
  { id: "35617309494", name: "Silvana C.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-12-07", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-12-07", event: "Cliente convertido" }] },
  { id: "35628872233", name: "Gislene A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-10-02", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-10-02", event: "Cliente convertido" }] },
  { id: "35631352115", name: "Haroldo A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-02-15", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-02-15", event: "Cliente convertido" }] },
  { id: "35617891398", name: "Igor B.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-01-08", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-01-08", event: "Cliente convertido" }] },
  { id: "35617309493", name: "Lucas T.A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-02-20", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-02-20", event: "Cliente convertido" }] },
  { id: "35633332125", name: "Thamires L.G.N.B.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-08-07", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-08-07", event: "Cliente convertido" }] },
  { id: "35641284136", name: "Adriana M.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-11-21", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-11-21", event: "Cliente convertido" }] },
  { id: "35633007929", name: "Lilian M.R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-07-24", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-07-24", event: "Cliente convertido" }] },
  { id: "35633146960", name: "Janse R.B.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-05-28", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-05-28", event: "Cliente convertido" }] },
  { id: "35629743638", name: "Lucilaine L.D.S.R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-01-16", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-01-16", event: "Cliente convertido" }] },
  { id: "35630755608", name: "José J.J.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-02-02", product: "EB-1A", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-02-02", event: "Cliente convertido" }] },
  { id: "35632765998", name: "João L.D.C.B.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-12-06", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-12-06", event: "Cliente convertido" }] },
  { id: "35632382012", name: "Ana C.B.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-12-01", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-12-01", event: "Cliente convertido" }] },
  { id: "35631744647", name: "Marlon O.F.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-12-11", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-12-11", event: "Cliente convertido" }] },
  { id: "35629003403", name: "Alcineia C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-10-25", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-10-25", event: "Cliente convertido" }] },
  { id: "35630239807", name: "Andréa A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-01-11", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-01-11", event: "Cliente convertido" }] },
  { id: "35614675894", name: "Renata S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-11-16", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-11-16", event: "Cliente convertido" }] },
  { id: "35631110038", name: "Williams R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35628813395", name: "Simone B.A.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-11-30", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-11-30", event: "Cliente convertido" }] },
  { id: "35629743637", name: "Jefferson P.M.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-02-01", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-02-01", event: "Cliente convertido" }] },
  { id: "35628813394", name: "Jaqueline C.K.G.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-08-17", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-08-17", event: "Cliente convertido" }] },
  { id: "35632382008", name: "Paulo R.V.D.C.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-08-31", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-08-31", event: "Cliente convertido" }] },
  { id: "35632752448", name: "Milena B.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-07-03", product: null, bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }] },
  { id: "35614333713", name: "David R.D.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-04-30", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-04-30", event: "Cliente convertido" }] },
  { id: "35627033679", name: "Tomaz V.A.D.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-04-15", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-04-15", event: "Cliente convertido" }] },
  { id: "35629880722", name: "Jose M.J.O.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-06-17", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-06-17", event: "Cliente convertido" }] },
  { id: "35629384288", name: "Eloisa D.N.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-04-03", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-04-03", event: "Cliente convertido" }] },
  { id: "35631134361", name: "Luz D.C.G.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2025-09-30", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2025-09-30", event: "Cliente convertido" }] },
  { id: "35632765562", name: "Amauri G.C.M.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2023-07-19", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2023-07-19", event: "Cliente convertido" }] },
  { id: "35631351706", name: "Thyago M.L.D.L.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2026-01-08", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2026-01-08", event: "Cliente convertido" }] },
  { id: "35631340094", name: "Marcelo R.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-03-28", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-03-28", event: "Cliente convertido" }] },
  { id: "35631744171", name: "Daniel M.S.**", stage: "Convertido", createdAt: "2024-07-03", stageDate: "2024-06-11", product: "EB-2 NIW", bonificacao: null, history: [{ date: "2024-07-03", event: "Lead recebido" }, { date: "2024-06-11", event: "Cliente convertido" }] },
];

const COMMISSION_TOTAL = LEADS.reduce((sum, l) => sum + calcLeadCommission(l.stage), 0);

// ============================================================
// GRÁFICO — Evolução trimestral de leads (real)
// ============================================================

const CHART_DATA = [
  { label: "Jul/24", leads: 108 },
  { label: "Ago/24", leads: 2 },
  { label: "Set/24", leads: 1 },
  { label: "Out/24", leads: 4 },
  { label: "Nov/24", leads: 5 },
  { label: "Dez/24", leads: 2 },
  { label: "Jan/25", leads: 7 },
  { label: "Fev/25", leads: 5 },
  { label: "Mar/25", leads: 4 },
  { label: "Abr/25", leads: 1 },
  { label: "Mai/25", leads: 2 },
  { label: "Jun/25", leads: 1 },
  { label: "Jul/25", leads: 3 },
  { label: "Ago/25", leads: 3 },
  { label: "Set/25", leads: 5 },
  { label: "Out/25", leads: 6 },
  { label: "Nov/25", leads: 2 },
  { label: "Dez/25", leads: 0 },
  { label: "Jan/26", leads: 2 },
  { label: "Fev/26", leads: 1 },
  { label: "Mar/26", leads: 1 },
  { label: "Abr/26", leads: 0 },
  { label: "Mai/26", leads: 0 },
  { label: "Jun/26", leads: 0 },
];

// ============================================================
// PÁGINAS SUGERIDAS PARA LINK
// ============================================================

const QUICK_LINKS = [
  { label: "Visto EB-2 NIW", url: "https://liv.law/visto-eb2-niw" },
  { label: "Visto O-1 Habilidades Extraordinárias", url: "https://liv.law/visto-o1" },
  { label: "Visto L-1 Transferência Intraempresarial", url: "https://liv.law/visto-l1" },
  { label: "Visto E-2 Investidor", url: "https://liv.law/visto-e2" },
  { label: "Visto EB-1A", url: "https://liv.law/visto-eb1a" },
];

// ============================================================
// UTILITIES
// ============================================================

const formatDate = (dateStr) => {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
};

// Ordem canônica das etapas para ordenação
const STAGE_ORDER = [
  "Lead Recebido",
  "Em Atendimento",
  "Reunião Agendada",
  "Oportunidade",
  "Convertido",
  "Não Convertido",
];

// Converte o label do gráfico "Jan/25" em Date para comparação com o filtro de data
const MONTH_LABELS = { Jan:0, Fev:1, Mar:2, Abr:3, Mai:4, Jun:5, Jul:6, Ago:7, Set:8, Out:9, Nov:10, Dez:11 };
function chartLabelToDate(label) {
  const [mon, yr] = label.split("/");
  return new Date(2000 + parseInt(yr, 10), MONTH_LABELS[mon], 1);
}

// ============================================================
// SHARED COMPONENTS
// ============================================================

function StageBadge({ stage }) {
  const cfg = PIPELINE_STAGES[stage] ?? PIPELINE_STAGES["Lead Recebido"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${cfg.colorClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function SyncBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
      <RefreshCw size={11} className="text-emerald-500" />
      Sincronizado com {DATA_SOURCE.source} · {DATA_SOURCE.syncedAt}
    </span>
  );
}

// ============================================================
// SECTION 1 — DASHBOARD
// ============================================================

function DashboardSection({ affiliate }) {
  const DEFAULT_DATE_TO   = new Date().toISOString().slice(0, 10);
  const DEFAULT_DATE_FROM = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  })();
  const [dateFrom, setDateFrom] = useState(DEFAULT_DATE_FROM);
  const [dateTo, setDateTo]     = useState(DEFAULT_DATE_TO);
  const hasFilter = dateFrom || dateTo;
  const BAR_MAX_PX = 90;

  // Leads filtrados pelo intervalo de datas
  const filteredLeads = useMemo(() => {
    if (!hasFilter) return LEADS;
    return LEADS.filter((l) => {
      const d = new Date(l.createdAt);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo   && d > new Date(dateTo))   return false;
      return true;
    });
  }, [dateFrom, dateTo]);

  // KPIs recalculados sobre os leads filtrados
  const stats = useMemo(() => {
    const converted   = filteredLeads.filter((l) => l.stage === "Convertido").length;
    const inProgress  = filteredLeads.filter((l) =>
      ["Em Atendimento", "Reunião Agendada", "Oportunidade"].includes(l.stage)
    ).length;
    return {
      totalLeads: filteredLeads.length,
      converted,
      inProgress,
      conversionRate: filteredLeads.length > 0
        ? ((converted / filteredLeads.length) * 100).toFixed(1)
        : "0.0",
    };
  }, [filteredLeads]);

  const filteredCommissionTotal = useMemo(
    () => filteredLeads.reduce((sum, l) => sum + calcLeadCommission(l.stage), 0),
    [filteredLeads]
  );

  // Determina se um mês do gráfico está dentro do intervalo selecionado
  const isMonthInRange = (label) => {
    if (!hasFilter) return true;
    const d = chartLabelToDate(label);
    if (dateFrom) {
      const f = new Date(dateFrom);
      if (d < new Date(f.getFullYear(), f.getMonth(), 1)) return false;
    }
    if (dateTo) {
      const t = new Date(dateTo);
      if (d > new Date(t.getFullYear(), t.getMonth(), 31)) return false;
    }
    return true;
  };

  // Meses visíveis no gráfico: últimos 12 por padrão; quando há filtro, mostra o intervalo selecionado
  const visibleChartData = useMemo(() => {
    if (!hasFilter) return CHART_DATA.slice(-12);
    return CHART_DATA.filter((item) => isMonthInRange(item.label));
  }, [hasFilter, dateFrom, dateTo]);

  const maxLeads = Math.max(...visibleChartData.map((d) => d.leads), 1);

  // Modal de detalhes do mês
  const [selectedMonth, setSelectedMonth] = useState(null);
  const monthLeads = useMemo(() => {
    if (!selectedMonth) return [];
    const [mon, yr] = selectedMonth.split("/");
    const monthIdx = { Jan:0,Fev:1,Mar:2,Abr:3,Mai:4,Jun:5,Jul:6,Ago:7,Set:8,Out:9,Nov:10,Dez:11 }[mon];
    const year = 2000 + parseInt(yr, 10);
    return LEADS.filter((l) => {
      const d = new Date(l.createdAt);
      return d.getFullYear() === year && d.getMonth() === monthIdx;
    });
  }, [selectedMonth]);

  const kpis = [
    {
      label: "Cliques Totais",
      value: affiliate.totalClicks !== null ? affiliate.totalClicks.toLocaleString("pt-BR") : "N/D",
      Icon: MousePointer,
      accent: "text-blue-600",
      bg: "bg-blue-50",
      note: affiliate.totalClicks === null ? "Pixel não configurado" : null,
    },
    { label: "Leads Gerados",   value: stats.totalLeads,      Icon: Users,     accent: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Em Andamento",    value: stats.inProgress,      Icon: TrendingUp, accent: "text-amber-600",  bg: "bg-amber-50" },
    { label: "Convertidos",     value: stats.converted,       Icon: UserCheck, accent: "text-emerald-600", bg: "bg-emerald-50" },
    {
      label: "Bonificações",
      value: fmtUSD(filteredCommissionTotal),
      Icon: DollarSign,
      accent: "text-yellow-600",
      bg: "bg-yellow-50",
      small: true,
      note: "Valor simulado",
    },
  ];

  return (
    <div className="space-y-8">

      {/* Header + filtro de data */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Visão Geral</h2>
          <p className="text-slate-500 text-sm mt-1">
            Afiliada: <span className="font-mono text-slate-700">{affiliate.id}</span>
            {hasFilter && (
              <span className="ml-2 text-blue-600 font-medium">
                · {stats.totalLeads} de {LEADS.length} leads no período
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <SyncBadge />
          {/* Seletor de intervalo de datas */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-sm">
            <Calendar size={14} className="text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs text-slate-700 outline-none bg-transparent w-28 cursor-pointer"
              title="Data inicial"
            />
            <span className="text-slate-300 select-none">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs text-slate-700 outline-none bg-transparent w-28 cursor-pointer"
              title="Data final"
            />
            {hasFilter && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                title="Limpar filtro (exibir todos os períodos)"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map(({ label, value, Icon, accent, bg, small, note }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
              <Icon size={20} className={accent} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
              <p className={`font-bold mt-1 text-slate-800 ${small || String(value).length > 6 ? "text-base" : "text-2xl"}`}>
                {value}
              </p>
              {note && <p className="text-xs text-slate-400 mt-0.5 italic">{note}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Conversion Banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/30">
            <Award size={24} className="text-blue-400" />
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium">Taxa de Conversão</p>
            <p className="text-4xl font-extrabold">{stats.conversionRate}%</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {stats.converted} convertidos de {stats.totalLeads} leads
              {hasFilter ? " (período filtrado)" : " gerados"}
            </p>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl px-5 py-4 border border-white/10 w-full sm:w-auto space-y-1">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Bonificação Simulada</p>
          <div className="flex justify-between gap-8 text-sm">
            <span className="text-slate-400">💰 Convertidos (×{stats.converted})</span>
            <span className="text-emerald-400 font-semibold">{fmtUSD(stats.converted * 178)}</span>
          </div>
          <div className="flex justify-between gap-8 text-sm">
            <span className="text-slate-400">❌ Não Conv. (×{stats.totalLeads - stats.converted})</span>
            <span className="text-slate-300 font-semibold">{fmtUSD((stats.totalLeads - stats.converted) * 3)}</span>
          </div>
          <div className="border-t border-white/10 mt-2 pt-2 flex justify-between gap-8">
            <span className="text-white text-sm font-semibold">Total</span>
            <span className="text-amber-400 text-xl font-extrabold">{fmtUSD(filteredCommissionTotal)}</span>
          </div>
        </div>
      </div>


      {/* Escada de Comissionamento */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Escada de Comissionamento — Acumulativo por Etapa
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Etapa</th>
                <th className="text-right py-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">+Comissão</th>
                <th className="text-right py-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Acumulado</th>
                <th className="text-right py-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Leads</th>
                <th className="text-right py-2 pl-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Simulado</th>
              </tr>
            </thead>
            <tbody>
              {[
                { emoji: "📥", label: "Lead Recebido",    inc: 3,   acc: 3   },
                { emoji: "📞", label: "Em Atendimento",   inc: 5,   acc: 8   },
                { emoji: "📅", label: "Reunião Agendada", inc: 20,  acc: 28  },
                { emoji: "🤝", label: "Oportunidade",     inc: 50,  acc: 78  },
                { emoji: "💰", label: "Convertido",       inc: 100, acc: 178 },
                { emoji: "❌", label: "Não Convertido",   inc: null, acc: 3  },
              ].map(({ emoji, label, inc, acc }) => {
                const count = filteredLeads.filter(l => l.stage === label).length;
                return (
                  <tr key={label} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-2.5 pr-4 font-medium text-slate-700">{emoji} {label}</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">
                      {inc !== null ? <span className="text-emerald-600 font-semibold">+{fmtUSD(inc)}</span> : <span className="text-slate-400 text-xs">Lead Rec.</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-800">{fmtUSD(acc)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">{count}</td>
                    <td className="py-2.5 pl-4 text-right font-semibold text-emerald-700">{count > 0 ? fmtUSD(count * acc) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td colSpan={3} className="py-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Geral</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{filteredLeads.length}</td>
                <td className="py-3 pl-4 text-right font-extrabold text-emerald-700 text-base">{fmtUSD(filteredCommissionTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Gráfico de barras mensal — rótulos sempre visíveis */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Evolução de Leads — Mensal
          </h3>
          <span className="text-xs text-slate-400">
            {hasFilter
              ? `${visibleChartData[0]?.label ?? ""} → ${visibleChartData[visibleChartData.length - 1]?.label ?? ""}`
              : `Últimos 12 meses · ${visibleChartData[0]?.label ?? ""} → ${visibleChartData[visibleChartData.length - 1]?.label ?? ""}`}
          </span>
        </div>

        {/* Área das barras */}
        <div
          className="flex items-end gap-1"
          style={{ height: `${BAR_MAX_PX + 24}px` }}
        >
          {visibleChartData.map((item) => {
            const barH = item.leads > 0
              ? Math.max(Math.round((item.leads / maxLeads) * BAR_MAX_PX), 6)
              : 3;
            const isActive   = selectedMonth === item.label;
            const clickable  = item.leads > 0;
            const barColor   = item.leads === 0
              ? "bg-slate-100"
              : isActive
              ? "bg-blue-800"
              : "bg-blue-600 hover:bg-blue-500";

            return (
              <div
                key={item.label}
                className={`relative flex-1 flex items-end ${clickable ? "cursor-pointer" : "cursor-default"}`}
                style={{ height: `${BAR_MAX_PX + 24}px` }}
                onClick={() => clickable && setSelectedMonth(isActive ? null : item.label)}
              >
                {item.leads > 0 && (
                  <span
                    className={`absolute left-1/2 -translate-x-1/2 text-[9px] font-bold pointer-events-none select-none leading-none ${
                      isActive ? "text-blue-800" : "text-slate-600"
                    }`}
                    style={{ bottom: `${barH + 5}px` }}
                  >
                    {item.leads}
                  </span>
                )}
                <div
                  className={`w-full rounded-t-sm transition-colors ${barColor}`}
                  style={{ height: `${barH}px` }}
                  title={clickable ? `Ver ${item.leads} lead${item.leads !== 1 ? "s" : ""} de ${item.label}` : item.label}
                />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-800" />
                )}
              </div>
            );
          })}
        </div>

        {/* Eixo X */}
        <div className="flex gap-1 mt-1.5 border-t border-slate-100 pt-1.5">
          {visibleChartData.map((item) => (
            <div key={item.label} className="flex-1 overflow-hidden text-center">
              <span className="text-[8.5px] leading-tight block font-medium text-slate-400">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-3 text-center">
          {hasFilter ? "Período filtrado" : "Últimos 12 meses"} ·{" "}
          <span className="font-semibold text-slate-600">
            {visibleChartData.reduce((s, d) => s + d.leads, 0)} leads
          </span>
          {!selectedMonth && visibleChartData.some(d => d.leads > 0) && (
            <span className="ml-2 text-slate-300">· clique em uma barra para ver detalhes</span>
          )}
        </p>
      </div>

      {/* Modal de detalhes do mês */}
      {selectedMonth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15,23,42,0.45)" }}
          onClick={() => setSelectedMonth(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Leads de</p>
                <h4 className="text-lg font-bold text-slate-800">{selectedMonth}</h4>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-full border border-blue-200">
                  {monthLeads.length} lead{monthLeads.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Lista de leads */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {monthLeads.length === 0 ? (
                <p className="text-center text-slate-400 py-10 text-sm">Nenhum lead neste período.</p>
              ) : (
                monthLeads.map((lead) => {
                  const cfg = PIPELINE_STAGES[lead.stage];
                  return (
                    <div key={lead.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                        {lead.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{lead.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{lead.id}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.colorClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-slate-400">{formatDate(lead.createdAt)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {monthLeads.filter(l => l.stage === "Convertido").length} convertido(s) ·{" "}
                {monthLeads.filter(l => l.stage === "Não Convertido").length} não convertido(s) ·{" "}
                {monthLeads.filter(l => !["Convertido","Não Convertido"].includes(l.stage)).length} em andamento
              </p>
              <button
                onClick={() => setSelectedMonth(null)}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Distribuição por etapa — sensível ao filtro de data */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Distribuição por Etapa
          {hasFilter && <span className="ml-1.5 normal-case text-blue-500 font-normal text-[10px]">(período filtrado)</span>}
        </h3>
        <div className="space-y-3">
          {Object.entries(PIPELINE_STAGES).map(([key, cfg]) => {
            const count = filteredLeads.filter((l) => l.stage === key).length;
            const pct   = filteredLeads.length > 0 ? (count / filteredLeads.length) * 100 : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-40 flex-shrink-0">
                  {cfg.emoji} {cfg.label}
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${cfg.dot} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-slate-700 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SECTION 2 — PIPELINE
// ============================================================


// ─── History helper ─────────────────────────────
function buildLeadHistory(lead) {
  const STAGE_FLOW = [
    { key: "Lead Recebido",    event: "Lead recebido",    commission: 3   },
    { key: "Em Atendimento",   event: "Em Atendimento",   commission: 5   },
    { key: "Reunião Agendada", event: "Reunião Agendada", commission: 20  },
    { key: "Oportunidade",     event: "Oportunidade",     commission: 50  },
  ];
  const TERMINAL_EVENT = {
    "Convertido":     { label: "Cliente convertido", commission: 100 },
    "Não Convertido": { label: "Não convertido",     commission: 0   },
  };
  const isTerminal = Boolean(TERMINAL_EVENT[lead.stage]);
  const flowIdx    = STAGE_FLOW.findIndex(s => s.key === lead.stage);
  const upToIdx    = isTerminal ? STAGE_FLOW.length : (flowIdx === -1 ? 1 : flowIdx + 1);

  const history = [];
  for (let i = 0; i < upToIdx; i++) {
    history.push({
      date: i === 0 ? lead.createdAt : null,
      event: STAGE_FLOW[i].event,
      commission: STAGE_FLOW[i].commission,
    });
  }
  if (isTerminal) {
    const t = TERMINAL_EVENT[lead.stage];
    history.push({ date: lead.stageDate || null, event: t.label, commission: t.commission });
  }
  return history;
}

function PipelineSection() {
  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy]       = useState("date");   // "date" | "name" | "stage" | "product" | "stageDate"
  const [sortDir, setSortDir]     = useState("desc");   // "asc" | "desc"

  const filterOptions = [
    { key: "all",       label: "Todos" },
    { key: "active",    label: "Em Andamento" },
    { key: "converted", label: "Convertidos" },
    { key: "lost",      label: "Não Convertidos" },
  ];

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "date" || col === "stageDate" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ArrowUpDown size={12} className="ml-1 inline text-slate-400" />;
    return sortDir === "asc"
      ? <ArrowUp   size={12} className="ml-1 inline text-blue-600" />
      : <ArrowDown size={12} className="ml-1 inline text-blue-600" />;
  };

  const processedLeads = useMemo(() => {
    const filtered = LEADS.filter((lead) => {
      const matchFilter =
        filter === "all" ||
        (filter === "active" &&
          ["Lead Recebido", "Em Atendimento", "Reunião Agendada", "Oportunidade"].includes(lead.stage)) ||
        (filter === "converted" && lead.stage === "Convertido") ||
        (filter === "lost"      && lead.stage === "Não Convertido");

      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        lead.name.toLowerCase().includes(q) ||
        lead.product.toLowerCase().includes(q) ||
        lead.id.toLowerCase().includes(q);

      return matchFilter && matchSearch;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "date")      return dir * (new Date(a.createdAt) - new Date(b.createdAt));
      if (sortBy === "stageDate") return dir * (new Date(a.stageDate) - new Date(b.stageDate));
      if (sortBy === "name")      return dir * a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "stage")     return dir * (STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
      if (sortBy === "product")   return dir * ((a.product || "").localeCompare(b.product || "", "pt-BR"));
      return 0;
    });
  }, [filter, search, sortBy, sortDir]);

  const toggleExpand = (id) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pipeline de Leads</h2>
          <p className="text-slate-500 text-sm mt-1">
            Acompanhe cada indicação em tempo real. Nomes protegidos conforme LGPD.
          </p>
        </div>
        <SyncBadge />
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ofuscado, produto ou ID…"
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                filter === opt.key
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stage pills summary */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(PIPELINE_STAGES).map(([key, cfg]) => {
          const count = LEADS.filter((l) => l.stage === key).length;
          if (count === 0) return null;
          return (
            <span key={key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cfg.colorClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}: {count}
            </span>
          );
        })}
      </div>

      {/* Table with sortable columns */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[580px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-5 py-3.5">
                <button
                  onClick={() => toggleSort("name")}
                  className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-800 transition-colors"
                >
                  Lead <SortIcon col="name" />
                </button>
              </th>

              <th className="text-left px-4 py-3.5">
                <button
                  onClick={() => toggleSort("date")}
                  className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-800 transition-colors"
                >
                  Dt. Criação <SortIcon col="date" />
                </button>
              </th>
              <th className="text-left px-4 py-3.5">
                <button
                  onClick={() => toggleSort("stageDate")}
                  className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-800 transition-colors"
                >
                  Entrada no Estágio <SortIcon col="stageDate" />
                </button>
              </th>
              <th className="text-left px-4 py-3.5">
                <button
                  onClick={() => toggleSort("stage")}
                  className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-800 transition-colors"
                >
                  Status <SortIcon col="stage" />
                </button>
              </th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide ">
                Bonificação
              </th>
              <th className="px-4 py-3.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {processedLeads.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-400">
                  <Search size={28} className="mx-auto mb-2 opacity-30" />
                  Nenhum lead encontrado para os filtros aplicados.
                </td>
              </tr>
            )}

            {processedLeads.map((lead) => (
              <>
                <tr
                  key={lead.id}
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${
                    expandedId === lead.id ? "bg-slate-50" : "hover:bg-slate-50/70"
                  }`}
                  onClick={() => toggleExpand(lead.id)}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                        {lead.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{lead.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{lead.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-500">{formatDate(lead.createdAt)}</td>
                  <td className="px-4 py-4 text-slate-500">{lead.stageDate ? formatDate(lead.stageDate) : "—"}</td>
                  <td className="px-4 py-4"><StageBadge stage={lead.stage} /></td>
                  <td className="px-4 py-4">
                    {lead.stage === "Convertido" ? (
                      <span className="font-semibold text-emerald-700 text-sm">
                        {fmtUSD(calcLeadCommission(lead.stage))}
                      </span>
                    ) : lead.stage === "Não Convertido" ? (
                      <span className="text-slate-500 text-sm">
                        {fmtUSD(calcLeadCommission(lead.stage))}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-sm">
                        {fmtUSD(calcLeadCommission(lead.stage))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-400">
                    {expandedId === lead.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </td>
                </tr>

                {expandedId === lead.id && (
                  <tr key={`${lead.id}-exp`}>
                    <td colSpan={6} className="px-6 py-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                      <div className="max-w-xl">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                          Histórico de Atualizações
                        </p>
                        {(() => {
                          const hist = buildLeadHistory(lead).filter(item => item.date !== null);
                          return (
                            <ol className="space-y-1">
                              {hist.map((item, i) => (
                                <li key={i} className="flex items-start gap-3">
                                  <div className="flex flex-col items-center pt-1.5">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${i === hist.length - 1 ? "bg-blue-500" : "bg-slate-300"}`} />
                                    {i < hist.length - 1 && (
                                      <div className="w-px flex-1 bg-slate-200 my-1 min-h-[16px]" />
                                    )}
                                  </div>
                                  <div className="pb-2 flex-1">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-xs text-slate-400 font-medium">{item.date ? formatDate(item.date) : "—"}</span>
                                      {item.commission > 0 && (
                                        <span className="text-xs font-semibold text-emerald-600">+{fmtUSD(item.commission)}</span>
                                      )}
                                    </div>
                                    <p className="text-sm text-slate-700 mt-0.5">{item.event}</p>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Exibindo {processedLeads.length} de {LEADS.length} leads · Sincronizado com HubSpot
        {sortBy !== "date" || sortDir !== "desc"
          ? ` · Ordenado por ${sortBy === "name" ? "nome" : sortBy === "stage" ? "etapa" : sortBy === "product" ? "produto" : sortBy === "stageDate" ? "entrada" : "data"} (${sortDir === "asc" ? "↑" : "↓"})`
          : ""}
      </p>
    </div>
  );
}

// ============================================================
// SECTION 3 — GERADOR DE LINKS
// ============================================================

function LinkGeneratorSection({ affiliate }) {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const UTM_PARAMS = [
    { key: "utm_source", value: "general" },
    { key: "utm_medium", value: "affiliate" },
    { key: "utm_campaign", value: "analise-cliente-liv" },
    { key: "utm_affiliatetype", value: "external" },
    { key: "utm_affiliatename", value: affiliate.id },
    { key: "utm_content", value: "direct-message" },
    { key: "utm_term", value: "affiliate-audience" },
  ];

  const handleGenerate = () => {
    const raw = destinationUrl.trim();
    if (!raw) {
      setError("Insira uma URL de destino antes de gerar o link.");
      return;
    }
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      UTM_PARAMS.forEach(({ key, value }) => url.searchParams.set(key, value));
      setGeneratedLink(url.toString());
      setError("");
    } catch {
      setError("URL inválida. Verifique o formato (ex: https://liv.law/visto-eb2).");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = generatedLink;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Gerador de Links</h2>
        <p className="text-slate-500 text-sm mt-1">
          Crie links rastreáveis para suas campanhas de indicação.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <AlertCircle size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Como o rastreamento funciona?</p>
          <p className="text-sm text-blue-700 mt-1 leading-relaxed">
            O link gerado inclui o parâmetro{" "}
            <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">
              utm_affiliatename={affiliate.id}
            </code>{" "}
            que identifica suas indicações no HubSpot. A atribuição do lead é confirmada{" "}
            <strong>somente quando o visitante preenche o formulário de contato</strong> no site da LIV.
            Cliques sem preenchimento não geram crédito de bonificação.
          </p>
        </div>
      </div>

      {/* Generator card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">URL de Destino</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={destinationUrl}
              onChange={(e) => { setDestinationUrl(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="https://liv.law/visto-eb2"
              className={`flex-1 px-4 py-3 text-sm border rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 transition-shadow ${
                error ? "border-red-300 focus:ring-red-400" : "border-slate-200 focus:ring-blue-500"
              }`}
            />
            {destinationUrl && (
              <button
                onClick={() => { setDestinationUrl(""); setGeneratedLink(""); setError(""); }}
                className="px-3 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {error && (
            <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
              <X size={12} /> {error}
            </p>
          )}
        </div>

        <button
          onClick={handleGenerate}
          className="w-full bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <Link2 size={16} />
          Gerar Link Rastreável
        </button>

        {generatedLink && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                Link Gerado
              </p>
              <p className="text-sm text-blue-600 break-all font-mono leading-relaxed">
                {generatedLink}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                Parâmetros de Rastreamento
              </p>
              <div className="grid grid-cols-2 gap-2">
                {UTM_PARAMS.map(({ key, value }) => (
                  <div key={key} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                    <p className="text-xs text-slate-400 font-mono">{key}</p>
                    <p className="text-sm font-semibold text-slate-700 font-mono truncate">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleCopy}
              className={`w-full font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] ${
                copied ? "bg-emerald-500 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Link copiado com sucesso!" : "Copiar Link"}
            </button>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700 mb-3">Páginas Populares para Indicação</p>
        <div className="space-y-2">
          {QUICK_LINKS.map((page) => (
            <button
              key={page.url}
              onClick={() => { setDestinationUrl(page.url); setGeneratedLink(""); setError(""); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm transition-colors text-left ${
                destinationUrl === page.url
                  ? "border-blue-300 bg-blue-50 text-blue-700 font-medium"
                  : "border-slate-100 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span>{page.label}</span>
              <ExternalLink size={14} className="text-slate-400 flex-shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SIDEBAR
// ============================================================

function Sidebar({ active, onChange, affiliate, onClose }) {
  const navItems = [
    { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { key: "pipeline", label: "Meus Leads", Icon: Users },
    { key: "links", label: "Gerador de Links", Icon: Link2 },
  ];

  return (
    <aside className="h-full w-64 bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-sm tracking-tight">LIV</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Portal Afiliados</p>
            <p className="text-slate-400 text-xs">liv.law</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Affiliate card */}
      <div className="px-4 py-4 border-b border-slate-700/50">
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30 flex-shrink-0">
              <span className="text-blue-300 font-bold text-sm">{affiliate.name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{affiliate.name}</p>
              <p className="text-slate-400 text-xs font-mono">{affiliate.id}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700 flex justify-between">
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Leads</p>
              <p className="text-white text-sm font-bold">{affiliate.totalLeads}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-xs mb-0.5">Conversão</p>
              <p className="text-white text-sm font-bold">{affiliate.conversionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-4 mb-3">Menu</p>
        {navItems.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => { onChange(key); onClose?.(); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              active === key
                ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon size={18} className="flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-700/50">
        <div className="px-4 py-2 mb-2">
          <p className="text-xs text-slate-500 leading-tight">Dados protegidos conforme LGPD</p>
        </div>
        <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
          <LogOut size={16} className="flex-shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}

// ============================================================
// ROOT APP
// ============================================================

export default function App() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sectionTitles = {
    dashboard: "Dashboard",
    pipeline: "Pipeline de Leads",
    links: "Gerador de Links",
  };

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`fixed top-0 left-0 h-full z-30 transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <Sidebar
          active={activeSection}
          onChange={setActiveSection}
          affiliate={AFFILIATE}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-5 py-4 flex items-center justify-between gap-4">
          <button
            className="lg:hidden text-slate-600 hover:text-slate-800 p-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>

          <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500">
            <span className="text-slate-400">Portal Afiliados</span>
            <span>/</span>
            <span className="text-slate-800 font-semibold">{sectionTitles[activeSection]}</span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button className="relative text-slate-500 hover:text-slate-800 transition-colors p-1.5">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {AFFILIATE.name.charAt(0)}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{AFFILIATE.name}</p>
                <p className="text-xs text-slate-400 font-mono">{AFFILIATE.id}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-7 lg:p-8">
          {activeSection === "dashboard" && <DashboardSection affiliate={AFFILIATE} />}
          {activeSection === "pipeline" && <PipelineSection />}
          {activeSection === "links" && <LinkGeneratorSection affiliate={AFFILIATE} />}
        </main>

        <footer className="px-6 py-4 border-t border-slate-200 bg-white">
          <p className="text-xs text-slate-400 text-center">
            © 2026 LIV — Escritório de Advocacia Imigratória ·{" "}
            <span className="font-semibold">Lei Geral de Proteção (LGPD)</span> ·
            Dados sincronizados via HubSpot CRM
          </p>
        </footer>
      </div>
    </div>
  );
}
>
  );
}
