require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// HubSpot sync proxy (protects API key from being exposed in frontend)
app.get('/api/hubspot/sync', async (req, res) => {
  const { hsId } = req.query;
  if (!hsId) return res.status(400).json({ error: 'hsId obrigatório' });

  const HUBSPOT_KEY = process.env.HUBSPOT_API_KEY;
  if (!HUBSPOT_KEY) return res.status(500).json({ error: 'HubSpot não configurado no servidor' });

  try {
    // 1. fetch contacts
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: 'referred_by', operator: 'EQ', value: hsId }] },
        ],
        properties: [
          'firstname', 'lastname', 'lifecyclestage',
          'hs_latest_disqualified_lead_date', 'createdate',
          'hubspot_owner_id', 'notes_last_updated',
          'next_meeting_time',
        ],
        limit: 200,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HubSpot ${response.status}: ${text}`);
    }

    const data = await response.json();
    const contacts = data.results || [];

    // 2. fetch owners list to resolve IDs → names
    let ownerMap = {};
    try {
      const ownersRes = await fetch('https://api.hubapi.com/crm/v3/owners?limit=100', {
        headers: { Authorization: `Bearer ${HUBSPOT_KEY}` },
      });
      if (ownersRes.ok) {
        const ownersData = await ownersRes.json();
        (ownersData.results || []).forEach(o => {
          ownerMap[o.id] = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || String(o.id);
        });
      }
    } catch (e) {
      console.warn('HubSpot owners fetch error:', e.message);
    }

    // 3. fetch deal associations in batch, then resolve deal owners
    let dealOwnerMap = {};
    if (contacts.length > 0) {
      try {
        const assocRes = await fetch('https://api.hubapi.com/crm/v4/associations/contacts/deals/batch/read', {
          method: 'POST',
          headers: { Authorization: `Bearer ${HUBSPOT_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: contacts.map(c => ({ id: c.id })) }),
        });
        if (assocRes.ok) {
          const assocData = await assocRes.json();
          const contactToDeal = {};
          const dealIds = [];
          (assocData.results || []).forEach(r => {
            if (r.to && r.to.length) {
              const dealId = String(r.to[0].toObjectId || r.to[0].id);
              contactToDeal[r.from.id] = dealId;
              if (!dealIds.includes(dealId)) dealIds.push(dealId);
            }
          });
          if (dealIds.length) {
            const dealsRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
              method: 'POST',
              headers: { Authorization: `Bearer ${HUBSPOT_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ inputs: dealIds.map(id => ({ id })), properties: ['hubspot_owner_id'] }),
            });
            if (dealsRes.ok) {
              const dealsData = await dealsRes.json();
              const dealOwnerIdMap = {};
              (dealsData.results || []).forEach(d => { dealOwnerIdMap[d.id] = d.properties?.hubspot_owner_id; });
              Object.entries(contactToDeal).forEach(([contactId, dealId]) => {
                const ownerId = dealOwnerIdMap[dealId];
                if (ownerId) dealOwnerMap[contactId] = ownerMap[ownerId] || ownerId;
              });
            }
          }
        }
      } catch (e) {
        console.warn('HubSpot deal associations fetch error:', e.message);
      }
    }

    // 4. enrich contacts with resolved owner names
    const enrichedResults = contacts.map(c => ({
      ...c,
      properties: {
        ...c.properties,
        ownerName: ownerMap[c.properties?.hubspot_owner_id] || null,
        dealOwnerName: dealOwnerMap[c.id] || null,
      },
    }));

    const _debug = {
      ownersFound: Object.keys(ownerMap).length,
      ownerMapSample: Object.entries(ownerMap).slice(0, 3).map(([id, name]) => ({ id, name })),
      contactSample: contacts.slice(0, 3).map(c => ({
        id: c.id,
        hubspot_owner_id: c.properties?.hubspot_owner_id,
        resolvedOwnerName: ownerMap[c.properties?.hubspot_owner_id] || null,
      })),
    };
    console.log('[sync debug]', JSON.stringify(_debug));

    res.json({ ...data, results: enrichedResults, _debug });
  } catch (err) {
    console.error('HubSpot sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

// link_forms CRUD
app.get('/api/link-forms', async (req, res) => {
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

app.post('/api/link-forms', async (req, res) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/link_forms`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.status(201).json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    console.error('link-forms POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/link-forms/:id', async (req, res) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/link_forms?id=eq.${req.params.id}`, {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    console.error('link-forms PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/link-forms/:id', async (req, res) => {
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
app.post('/api/shortio/create-bulk', async (req, res) => {
  const { hsId, affiliateName, affiliateType } = req.body;
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
        if (Array.isArray(rows) && rows.length) activeForms = rows;
      }
    }
  } catch (e) {
    console.warn('create-bulk: using hardcoded forms (supabase error):', e.message);
  }

  const results = [];
  for (const form of activeForms) {
    const originalUrl = buildUTMUrl(form.url, hsId, affiliateType);
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
app.post('/api/shortio/create', async (req, res) => {
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
app.get('/api/shortio/links', async (req, res) => {
  const SHORTIO_KEY       = process.env.SHORTIO_API_KEY;
  const SHORTIO_DOMAIN_ID = process.env.SHORTIO_DOMAIN_ID;
  const FOLDER_ID         = process.env.SHORTIO_FOLDER_ID;
  const { affiliateId }   = req.query;

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
app.patch('/api/shortio/update', async (req, res) => {
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

// Update links_config for an affiliate (hide/delete a link from their view)
app.patch('/api/affiliate/:userId/links-config', async (req, res) => {
  const { userId } = req.params;
  const { slug, action } = req.body; // action: 'hide' | 'show' | 'delete' | 'restore'
  if (!userId || !slug || !action) return res.status(400).json({ error: 'userId, slug e action obrigatórios' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase não configurado' });

  try {
    // fetch current links_config
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=links_config`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await getRes.json();
    const current = rows?.[0]?.links_config || {};

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
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Partner Portal running on port ${PORT}`));
