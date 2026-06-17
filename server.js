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
        ],
        limit: 200,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HubSpot ${response.status}: ${text}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('HubSpot sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// short.io — create a shortened affiliate link
app.post('/api/shortio/create', async (req, res) => {
  const { originalUrl, slug, title } = req.body;
  if (!originalUrl) return res.status(400).json({ error: 'originalUrl obrigatório' });

  const SHORTIO_KEY    = process.env.SHORTIO_API_KEY;
  const SHORTIO_DOMAIN = process.env.SHORTIO_DOMAIN;
  const FOLDER_ID      = process.env.SHORTIO_FOLDER_ID;

  if (!SHORTIO_KEY || !SHORTIO_DOMAIN) {
    return res.status(500).json({ error: 'Short.io não configurado no servidor' });
  }

  try {
    const body = { domain: SHORTIO_DOMAIN, originalURL: originalUrl };
    if (slug)     body.path      = slug;
    if (title)    body.title     = title;
    if (FOLDER_ID) body.folderId = FOLDER_ID;

    const r = await fetch('https://api.short.io/links', {
      method: 'POST',
      headers: { authorization: SHORTIO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.json({ shortUrl: data.shortURL, id: data.id, path: data.path });
  } catch (err) {
    console.error('Short.io create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// short.io — list links for the configured folder
app.get('/api/shortio/links', async (req, res) => {
  const SHORTIO_KEY     = process.env.SHORTIO_API_KEY;
  const SHORTIO_DOMAIN_ID = process.env.SHORTIO_DOMAIN_ID;
  const FOLDER_ID       = process.env.SHORTIO_FOLDER_ID;

  if (!SHORTIO_KEY || !SHORTIO_DOMAIN_ID) {
    return res.status(500).json({ error: 'Short.io não configurado no servidor' });
  }

  try {
    let url = `https://api.short.io/api/links?domain_id=${SHORTIO_DOMAIN_ID}&limit=150`;
    if (FOLDER_ID) url += `&folderId=${FOLDER_ID}`;

    const r = await fetch(url, { headers: { authorization: SHORTIO_KEY } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    res.json(data);
  } catch (err) {
    console.error('Short.io list error:', err.message);
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

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Partner Portal running on port ${PORT}`));
