#!/usr/bin/env node
/*
 * Repara links do Short.io criados sob um slug antigo do afiliado.
 * Eles apontam para "https://undefined" (bug do create-bulk, corrigido em
 * d8e378c) e carregam um utm_affiliatename que não corresponde a nenhum
 * afiliado atual — então o lead que clicasse ficaria sem atribuição.
 *
 * O path curto NÃO muda: quem já recebeu o link continua com ele válido.
 * Só o destino é reescrito, apontando para o formulário certo e com o
 * utm_affiliatename do slug ATUAL do afiliado.
 *
 * NUNCA apaga link.
 *
 *   node scripts/remap-slugs-antigos.js            → simula
 *   node scripts/remap-slugs-antigos.js --aplicar  → aplica
 */
const fs = require('fs'), path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !l.trim().startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY };
const aplicar = process.argv.includes('--aplicar');

// slug antigo → slug atual. Conferido contra o nome do afiliado no Supabase.
const REMAP = {
  'agrey-group':    'agrey-consulting',   // Agrey Group
  'daniele-kramer': 'phoenix',            // Daniele Kramer
  'andre-murad':    'america-connection', // André Murad
};

function buildUTM(base, hsId, tipo) {
  const p = new URLSearchParams({
    utm_source: 'general', utm_medium: 'affiliate', utm_campaign: 'analise-liv',
    utm_term: 'affiliate-audience', utm_content: 'direct-message',
    utm_affiliatetype: tipo || 'external', utm_affiliatename: hsId,
  });
  return base + '?' + p.toString();
}

(async () => {
  const forms = await (await fetch(env.SUPABASE_URL + '/rest/v1/link_forms?order=sort_order.asc', { headers: H })).json();
  const users = await (await fetch(env.SUPABASE_URL + '/rest/v1/users?select=name,hs_affiliate_id,affiliate_type,status&role=eq.affiliate', { headers: H })).json();
  const r = await fetch(`https://api.short.io/api/links?domain_id=${env.SHORTIO_DOMAIN_ID}&limit=150&folderId=${encodeURIComponent(env.SHORTIO_FOLDER_ID)}`,
    { headers: { authorization: env.SHORTIO_API_KEY } });
  const links = (await r.json()).links || [];

  const plano = [];
  for (const lk of links) {
    const p = lk.path || '';
    const antigo = Object.keys(REMAP).find(s => p.startsWith(s + '-'));
    if (!antigo) continue;
    const novo = REMAP[antigo];
    const f = forms.find(x => p === `${antigo}-${x.id}`);
    if (!f) { console.log(`  ignorado (formulário desconhecido): ${p}`); continue; }
    // o afiliado ATIVO com esse slug é quem deve receber a atribuição
    const dono = users.filter(u => u.hs_affiliate_id === novo).sort(a => a.status === 'active' ? -1 : 1)[0];
    if (!dono) { console.log(`  ignorado (slug atual sem dono): ${p}`); continue; }
    const esperado = buildUTM(f.base_url, novo, dono.affiliate_type);
    if ((lk.originalURL || '') === esperado) continue;
    plano.push({ p, id: lk.idString || lk.id, esperado, form: f.label, antigo, novo, dono: dono.name });
  }

  console.log(`\n${plano.length} link(s) a remapear  —  ${aplicar ? 'APLICANDO' : 'SIMULANDO'}\n`);
  const porDono = {};
  plano.forEach(x => { const k = `${x.antigo} → ${x.novo} (${x.dono})`; porDono[k] = (porDono[k] || 0) + 1; });
  Object.entries(porDono).forEach(([k, n]) => console.log(`  ${k}: ${n} link(s)`));

  if (!aplicar) {
    console.log('\nDetalhe:');
    plano.forEach(x => console.log(`  ${x.p.padEnd(28)} → ${x.form} · utm_affiliatename=${x.novo}`));
    console.log('\nRode com --aplicar para gravar.');
    return;
  }
  let ok = 0, falha = 0;
  for (const x of plano) {
    try {
      const rr = await fetch('https://api.short.io/links/' + x.id, {
        method: 'POST', headers: { authorization: env.SHORTIO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ originalURL: x.esperado }),
      });
      if (!rr.ok) { console.log(`  FALHA ${x.p}: HTTP ${rr.status} ${(await rr.text()).slice(0, 80)}`); falha++; }
      else { ok++; process.stdout.write('.'); }
    } catch (e) { console.log(`  ERRO ${x.p}: ${e.message}`); falha++; }
  }
  console.log(`\n\n  remapeados: ${ok}  |  falhas: ${falha}`);
})();
