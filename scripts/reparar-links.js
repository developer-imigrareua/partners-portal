#!/usr/bin/env node
/*
 * Repara o destino (originalURL) dos links do Short.io criados com
 * "https://undefined", causados pelo bug de base_url no create-bulk
 * (server.js, corrigido em d8e378c).
 *
 * NUNCA apaga link. Só faz PATCH no destino — os links curtos continuam
 * os mesmos, ninguém perde o que já distribuiu.
 *
 *   node scripts/reparar-links.js           → mostra o que faria (dry-run)
 *   node scripts/reparar-links.js --aplicar → aplica
 *   node scripts/reparar-links.js --aplicar --incluir-trocados
 *        também corrige os que hoje funcionam mas apontam para outro
 *        formulário (mude só se for essa a intenção)
 */
const fs = require('fs'), path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !l.trim().startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const plano = JSON.parse(fs.readFileSync(path.join(__dirname, 'reparo-links.json'), 'utf8'));
const aplicar = process.argv.includes('--aplicar');
const incluirTrocados = process.argv.includes('--incluir-trocados');

const mortos = plano.filter(x => x.atual.includes('undefined'));
const trocados = plano.filter(x => !x.atual.includes('undefined'));
const alvo = incluirTrocados ? mortos.concat(trocados) : mortos;

(async () => {
  console.log(`${mortos.length} links mortos (https://undefined)`);
  console.log(`${trocados.length} apontam para outro formulário${incluirTrocados ? ' — INCLUÍDOS' : ' — preservados'}`);
  console.log(`\n${aplicar ? 'APLICANDO' : 'SIMULANDO'} em ${alvo.length} links\n`);
  let ok = 0, falha = 0;
  for (const x of alvo) {
    if (!aplicar) { console.log(`  ${x.p}  ->  ${x.esperado.split('?')[0]}`); continue; }
    try {
      const r = await fetch('https://api.short.io/links/' + x.id, {
        method: 'POST',
        headers: { authorization: env.SHORTIO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ originalURL: x.esperado }),
      });
      if (!r.ok) { console.log(`  FALHA ${x.p}: HTTP ${r.status} ${(await r.text()).slice(0, 90)}`); falha++; }
      else { ok++; process.stdout.write('.'); }
    } catch (e) { console.log(`  ERRO ${x.p}: ${e.message}`); falha++; }
  }
  if (aplicar) console.log(`\n\n  reparados: ${ok}  |  falhas: ${falha}`);
})();
