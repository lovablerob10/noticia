/**
 * ============================================
 * AI News Agent - Creative Studio
 * Busca notícias de IA → Gera criativos para Eventos
 * Blog Post, Feed Copy, Stories
 * ============================================
 */

// ─── CONFIG ─────────────────────────────────
const CONFIG = {
  SUPABASE_URL_STORAGE: 'ai_news_supa_url',
  SUPABASE_KEY_STORAGE: 'ai_news_supa_key',

  CORS_PROXIES: [
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.org/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ],
  CACHE_KEY: 'ai_news_cache_v4',
  HISTORY_KEY: 'ai_news_history_v3',
  CACHE_TTL: 30 * 60 * 1000,
  API_KEY_STORAGE: 'gemini_api_key',
  DEFAULT_API_KEY: 'AIzaSyAKf1ffwR1LaGXjOgVIO9Qe1X16X1WHvnM',
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  // OpenAI (ChatGPT + DALL-E)
  // Se quiser testar, insira sua OpenAI Key API aqui ou na UI:
  DEFAULT_OPENAI_KEY: '',
  OPENAI_CHAT_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_IMAGE_URL: 'https://api.openai.com/v1/images/generations',

  FEEDS: {
    world: [
      { url: 'https://news.google.com/rss/search?q=artificial+intelligence+technology+when:7d&hl=en-US&gl=US&ceid=US:en', source: 'Google News (Global)', region: 'world' },
      { url: 'https://news.google.com/rss/search?q=AI+events+conference+when:7d&hl=en-US&gl=US&ceid=US:en', source: 'Google News (AI Events)', region: 'world' },
    ],
    brasil: [
      { url: 'https://news.google.com/rss/search?q=intelig%C3%AAncia+artificial+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News (Brasil)', region: 'brasil' },
      { url: 'https://news.google.com/rss/search?q=IA+tecnologia+eventos+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News (BR Tech)', region: 'brasil' },
    ],
  },
};

// ─── STATE ──────────────────────────────────
const state = {
  articles: [],
  filteredArticles: [],
  currentFilter: 'all',
  searchQuery: '',
  apiKey: localStorage.getItem(CONFIG.API_KEY_STORAGE) || CONFIG.DEFAULT_API_KEY,
  openaiKey: localStorage.getItem(CONFIG.OPENAI_KEY_STORAGE) || CONFIG.DEFAULT_OPENAI_KEY,
  supaUrl: localStorage.getItem(CONFIG.SUPABASE_URL_STORAGE) || '',
  supaKey: localStorage.getItem(CONFIG.SUPABASE_KEY_STORAGE) || '',
  generatedCount: 0,
  isLoading: false,
  loadedHistory: [], // cache for history rendering
};

// ─── SUPABASE ───────────────────────────────
let supaClient = null;
function initSupabase() {
  if (window.supabase && state.supaUrl && state.supaKey) {
    supaClient = window.supabase.createClient(state.supaUrl, state.supaKey);
  } else {
    supaClient = null;
  }
}
initSupabase();


// ─── DOM ────────────────────────────────────
const dom = {};
function cacheDom() {
  const ids = [
    'newsGrid','filterTabs','searchInput','btnRefresh',
    'apiKeyInput','btnSaveKey','keyStatus',
    'openaiKeyInput','btnSaveOpenai','openaiStatus',
    'studioOverlay','studioSidebar','studioMain','studioClose','studioTabs',
    'panelBlog','panelFeed','panelStories',
    'blogContent','feedContent','storiesContent',
    'historyOverlay','historyBody','historyClose','btnHistory',
    'toastContainer',
    'statTotal','statWorld','statBrasil','statGenerated',
    'countAll','countWorld','countBrasil',
  ];
  ids.forEach(id => { dom[id] = document.getElementById(id); });
}

// ─── RSS PARSER (with multi-proxy fallback) ─
async function fetchFeed(feedCfg) {
  // Try each CORS proxy in order
  for (let i = 0; i < CONFIG.CORS_PROXIES.length; i++) {
    try {
      const proxyUrl = CONFIG.CORS_PROXIES[i](feedCfg.url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (text.includes('<item>') || text.includes('<entry>')) {
        console.log(`✅ Proxy ${i} worked for ${feedCfg.source}`);
        return parseRSS(text, feedCfg);
      }
      throw new Error('Invalid RSS response');
    } catch (e) {
      console.warn(`Proxy ${i} failed for ${feedCfg.source}:`, e.message);
      continue;
    }
  }
  console.warn(`❌ All proxies failed for ${feedCfg.source}`);
  return [];
}

// Fallback: use Gemini to search for news when RSS fails
async function fetchNewsViaGemini() {
  const apiKey = state.apiKey;
  if (!apiKey) return [];

  showToast('🔄 RSS indisponível. Buscando via Gemini AI...', 'info');

  const prompt = `Você é um agente de busca de notícias. Liste as 20 notícias MAIS VIRAIS E POPULARES sobre Inteligência Artificial da ÚLTIMA SEMANA (10 globais em inglês e 10 do Brasil em português).

Responda APENAS com JSON puro (sem markdown, sem \`\`\`):

[
  {
    "title": "Título da notícia",
    "description": "Resumo em 2 frases",
    "source": "Nome da fonte (ex: TechCrunch, Folha, etc)",
    "region": "world ou brasil",
    "link": "URL da notícia (se souber, senão coloque '#')",
    "date": "DATA EXATA DA NOTÍCIA NO FORMATO: YYYY-MM-DD"
  }
]

Foque APENAS em notícias dos últimos 7 dias que viralizaram e tiveram muito engajamento. É obrigatório incluir a data real da notícia no campo "date".`;

  try {
    const response = await fetch(`${CONFIG.GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
      }),
    });

    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const newsArray = JSON.parse(text);
    return newsArray.map((n, i) => ({
      id: `gemini-${Date.now()}-${i}`,
      title: n.title || '',
      description: n.description || '',
      source: n.source || 'Gemini AI',
      region: n.region || 'world',
      link: n.link || '#',
      pubDate: n.date ? new Date(n.date) : new Date(),
      image: '',
      creatives: null,
    }));
  } catch (e) {
    console.error('Gemini news fetch error:', e);
    return [];
  }
}

function parseRSS(xml, feedCfg) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = doc.querySelectorAll('item');
  const out = [];

  items.forEach((item, i) => {
    if (i >= 12) return;
    const title = item.querySelector('title')?.textContent?.trim() || '';
    const link = item.querySelector('link')?.textContent?.trim() || '';
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
    const desc = item.querySelector('description')?.textContent?.trim() || '';
    const cleanDesc = stripHTML(desc);

    let image = '';
    const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch) image = imgMatch[1];

    let realSource = feedCfg.source;
    const srcMatch = title.match(/\s-\s([^-]+)$/);
    if (srcMatch) realSource = srcMatch[1].trim();

    if (title) {
      out.push({
        id: `${feedCfg.region}-${Date.now()}-${i}`,
        title: title.replace(/\s-\s[^-]+$/, '').trim(),
        link, description: cleanDesc, image,
        pubDate: pubDate ? new Date(pubDate) : new Date(),
        source: realSource, region: feedCfg.region,
        creatives: null, // { blog, feed, stories }
      });
    }
  });
  return out;
}

function stripHTML(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }

// ─── GEMINI CREATIVE GENERATOR ──────────────
async function generateCreatives(article, attempt = 1) {
  const apiKey = state.apiKey;
  if (!apiKey) {
    showToast('⚠️ Configure a API Key do Gemini primeiro.', 'error');
    return null;
  }

  const prompt = `Você é um expert em marketing digital e comunicação para o mercado de EVENTOS (corporativos, feiras, congressos, shows, festivais, conferências).

Analise esta notícia sobre Inteligência Artificial e gere criativos completos para o nicho de EVENTOS.

NOTÍCIA: ${article.title}
DATA DA NOTÍCIA: ${article.pubDate ? new Date(article.pubDate).toLocaleDateString('pt-BR') : 'Recente'}
DESCRIÇÃO: ${article.description || 'Sem descrição.'}
FONTE: ${article.source}
REGIÃO: ${article.region === 'brasil' ? 'Brasil' : 'Global'}

ATENÇÃO: Inclua a data e relevância dessa notícia no contexto (ex: "Nesta última semana...", ou referenciando que viralizou recentemente) nas copies, quando apropriado, para gerar urgência e atualidade.

Gere o JSON com esta estrutura:
{
  "blog": {
    "titulo": "Título chamativo para blog post (SEO-friendly)",
    "subtitulo": "Subtítulo complementar",
    "introducao": "Parágrafo de introdução engajante (2-3 frases)",
    "corpo": "Corpo do artigo com 3-4 parágrafos. Explique a notícia, contextualize para eventos, mostre aplicações práticas.",
    "conclusao": "Parágrafo de conclusão com call-to-action",
    "hashtags": "#EventTech #IA #Eventos #Inovação #TechEvents"
  },
  "feed": {
    "copy_curta": "Copy curta e impactante para Instagram/LinkedIn (max 150 caracteres)",
    "copy_completa": "Copy completa para feed (3-4 linhas). Tom profissional mas acessível. Inclua emoji estratégicos.",
    "hashtags": "#EventTech #IA #Eventos #MarketingDeEventos #InteligenciaArtificial",
    "sugestao_visual": "Descrição breve do visual ideal para o post"
  },
  "stories": [
    { "slide": 1, "tipo": "GANCHO", "texto": "Texto de impacto", "cta": "Arraste para cima" },
    { "slide": 2, "tipo": "CONTEXTO", "texto": "Explique a notícia", "cta": "" },
    { "slide": 3, "tipo": "IMPACTO", "texto": "Como afeta eventos", "cta": "" },
    { "slide": 4, "tipo": "APLICAÇÃO", "texto": "Aplicação prática", "cta": "" },
    { "slide": 5, "tipo": "CTA", "texto": "Chamada final", "cta": "Salve 🔖" }
  ]
}`;

  try {
    const response = await fetch(`${CONFIG.GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('Gemini API error:', response.status, errBody);

      // Retry once on 500/503 errors
      if (attempt < 2 && (response.status >= 500 || response.status === 429)) {
        showToast(`⏳ Tentativa ${attempt + 1}... aguarde.`, 'info');
        await new Promise(r => setTimeout(r, 2000));
        return generateCreatives(article, attempt + 1);
      }

      if (response.status === 400) {
        showToast('❌ API Key inválida ou expirada. Atualize no campo acima.', 'error');
      } else if (response.status === 429) {
        showToast('⏳ Limite de requisições. Aguarde 30s e tente novamente.', 'error');
      } else {
        showToast(`❌ Erro Gemini (HTTP ${response.status}). Tente novamente.`, 'error');
      }
      return null;
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      const reason = data.candidates?.[0]?.finishReason || 'UNKNOWN';
      console.error('Gemini empty response, finishReason:', reason);
      if (attempt < 2) {
        showToast('⏳ Resposta vazia, tentando novamente...', 'info');
        await new Promise(r => setTimeout(r, 1500));
        return generateCreatives(article, attempt + 1);
      }
      showToast('❌ Gemini não retornou conteúdo. Tente outra notícia.', 'error');
      return null;
    }

    // Clean possible markdown wrappers
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const creatives = JSON.parse(text);
    state.generatedCount++;
    updateStats();

    // Save to history
    saveToHistory(article, creatives);

    return creatives;
  } catch (error) {
    console.error('Generate error:', error);

    // Retry on JSON parse errors (Gemini sometimes wraps in text)
    if (attempt < 2 && error instanceof SyntaxError) {
      showToast('⏳ Ajustando formato, tentando novamente...', 'info');
      await new Promise(r => setTimeout(r, 1500));
      return generateCreatives(article, attempt + 1);
    }

    showToast(`❌ Erro: ${error.message}. Tente novamente.`, 'error');
    return null;
  }
}

// ─── OPENAI CHATGPT CREATIVE GENERATOR ──────
async function generateCreativesOpenAI(article) {
  const apiKey = state.openaiKey;
  if (!apiKey) return null;

  const systemPrompt = `Você é um expert em marketing digital para o mercado de EVENTOS (corporativos, feiras, congressos, shows, festivais, conferências). Gere criativos completos em JSON.`;

  const userPrompt = `Analise esta notícia de IA e gere criativos para o nicho de EVENTOS:

NOTÍCIA: ${article.title}
DATA DA NOTÍCIA: ${article.pubDate ? new Date(article.pubDate).toLocaleDateString('pt-BR') : 'Recente'}
DESCRIÇÃO: ${article.description || 'Sem descrição.'}
FONTE: ${article.source}
REGIÃO: ${article.region === 'brasil' ? 'Brasil' : 'Global'}

ATENÇÃO: Inclua a data e a relevância dessa notícia (referenciando que viralizou nesta semana) nas copies para enfatizar atualidade.

Responda APENAS com JSON válido nesta estrutura:
{
  "blog": {
    "titulo": "Título chamativo SEO-friendly",
    "subtitulo": "Subtítulo complementar",
    "introducao": "Parágrafo de introdução engajante (2-3 frases)",
    "corpo": "Corpo do artigo com 3-4 parágrafos contextualizando para eventos",
    "conclusao": "Conclusão com call-to-action",
    "hashtags": "#EventTech #IA #Eventos #Inovação"
  },
  "feed": {
    "copy_curta": "Copy curta impactante (max 150 chars)",
    "copy_completa": "Copy completa para feed (3-4 linhas com emojis e CTA)",
    "hashtags": "#EventTech #IA #Eventos #MarketingDeEventos",
    "sugestao_visual": "Descrição do visual ideal para o post"
  },
  "stories": [
    { "slide": 1, "tipo": "GANCHO", "texto": "Texto de impacto", "cta": "Arraste para cima ↑" },
    { "slide": 2, "tipo": "CONTEXTO", "texto": "Explique a notícia", "cta": "" },
    { "slide": 3, "tipo": "IMPACTO", "texto": "Como afeta eventos", "cta": "" },
    { "slide": 4, "tipo": "APLICAÇÃO", "texto": "Aplicação prática para profissionais", "cta": "" },
    { "slide": 5, "tipo": "CTA", "texto": "Chamada final", "cta": "Salve 🔖" }
  ]
}`;

  try {
    const response = await fetch(CONFIG.OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('OpenAI API error:', response.status, errBody);
      if (response.status === 401) showToast('⚠️ OpenAI key inválida.', 'error');
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) return null;

    const creatives = JSON.parse(text);
    console.log('✅ ChatGPT generated creatives successfully');
    return creatives;
  } catch (error) {
    console.error('OpenAI generate error:', error);
    return null;
  }
}

// ─── DALL-E IMAGE GENERATOR ─────────────────
async function generateImage(article, visualSuggestion) {
  const apiKey = state.openaiKey;
  if (!apiKey) return null;

  const imagePrompt = `Crie uma imagem profissional para post de redes sociais no nicho de EVENTOS CORPORATIVOS: ${visualSuggestion || article.title}. Design moderno e vibrante com elementos de tecnologia e IA, estilo premium para Instagram. Sem texto na imagem. Estética de eventos corporativos de alto padrão com tema de inteligência artificial e inovação.`;

  try {
    showToast('🎨 Gerando imagem via GPT-Image...', 'info');
    const response = await fetch(CONFIG.OPENAI_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: imagePrompt,
        size: '1024x1024',
        quality: 'high',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('GPT-Image error:', response.status, errBody);
      // Fallback to DALL-E 3 if gpt-image-1 fails
      return await generateImageFallback(article, visualSuggestion, apiKey);
    }

    const data = await response.json();
    // gpt-image-1 returns b64_json by default
    const b64 = data.data?.[0]?.b64_json;
    const url = data.data?.[0]?.url;
    
    let imageUrl = null;
    if (b64) {
      imageUrl = `data:image/png;base64,${b64}`;
    } else if (url) {
      imageUrl = url;
    }
    
    if (imageUrl) {
      showToast('🎨 Imagem gerada com sucesso! (GPT-Image)', 'success');
      console.log('✅ GPT-Image generated');
    }
    return imageUrl;
  } catch (error) {
    console.error('GPT-Image error:', error);
    return await generateImageFallback(article, visualSuggestion, apiKey);
  }
}

// DALL-E 3 fallback
async function generateImageFallback(article, visualSuggestion, apiKey) {
  try {
    showToast('🎨 Tentando DALL-E 3...', 'info');
    const prompt = `Professional social media post image for events industry: ${visualSuggestion || article.title}. Modern, vibrant, no text overlay. Corporate events with AI theme.`;
    const response = await fetch(CONFIG.OPENAI_IMAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard' }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || null;
    if (imageUrl) { showToast('🎨 Imagem gerada (DALL-E 3)', 'success'); console.log('✅ DALL-E 3 fallback image'); }
    return imageUrl;
  } catch { return null; }
}

// ─── MASTER CREATIVE GENERATOR (OpenAI → Gemini fallback) ─
async function generateAllCreatives(article) {
  // Try OpenAI ChatGPT first
  if (state.openaiKey) {
    showToast('🤖 Gerando criativos via ChatGPT...', 'info');
    const creatives = await generateCreativesOpenAI(article);
    if (creatives) {
      state.generatedCount++;
      updateStats();
      saveToHistory(article, creatives);

      // Generate image in background via DALL-E
      const visualDesc = creatives.feed?.sugestao_visual || article.title;
      generateImage(article, visualDesc).then(imageUrl => {
        if (imageUrl && article.creatives) {
          article.creatives.imageUrl = imageUrl;
          // Update feed and blog panels if currently visible
          if (currentArticle === article) {
            renderFeed(article.creatives.feed, imageUrl);
            renderBlog(article.creatives.blog, imageUrl);
          }
        }
      });

      return creatives;
    }
  }

  // Fallback to Gemini
  showToast('🔄 Tentando via Gemini...', 'info');
  return await generateCreatives(article);
}

// ─── RENDER NEWS CARDS ──────────────────────
function renderSkeletons() {
  let h = '';
  for (let i = 0; i < 6; i++) h += `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-body"><div class="skeleton-line short"></div><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div>`;
  dom.newsGrid.innerHTML = h;
}

function renderCards(articles) {
  if (!articles.length) {
    dom.newsGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Nenhuma notícia encontrada</h3><p>Altere o filtro ou clique em "Atualizar".</p></div>`;
    return;
  }
  dom.newsGrid.innerHTML = articles.map((a, i) => {
    const rc = a.region === 'brasil' ? 'brasil' : 'world';
    const rl = a.region === 'brasil' ? '🇧🇷 Brasil' : '🌍 Mundo';
    const hasCreatives = a.creatives ? '<span class="card-badge generated">✨ Criativo</span>' : '';
    return `
      <article class="news-card" data-idx="${i}" style="animation-delay:${Math.min(i*0.05,0.4)}s">
        <div class="card-image-placeholder ${rc}">${a.region === 'brasil' ? '🇧🇷' : '🌍'}</div>
        <div class="card-body">
          <div class="card-meta">
            <span class="card-badge ${rc}">${rl}</span>
            ${hasCreatives}
            <span class="card-source">${esc(a.source)}</span>
            <span class="card-date">${fmtDate(a.pubDate)}</span>
          </div>
          <h3 class="card-title">${esc(a.title)}</h3>
          <p class="card-snippet">${esc(a.description || 'Clique para gerar criativos para o nicho de eventos.')}</p>
        </div>
        <div class="card-footer">
          <button class="card-action link-btn" onclick="event.stopPropagation(); window.open('${esc(a.link)}','_blank')">🔗 Original</button>
          <button class="card-action studio-btn" onclick="event.stopPropagation(); openStudio(${i})">🎨 Gerar Criativos</button>
        </div>
      </article>`;
  }).join('');
}

function updateStats() {
  const t = state.articles.length;
  const w = state.articles.filter(a => a.region === 'world').length;
  const b = state.articles.filter(a => a.region === 'brasil').length;
  dom.statTotal.textContent = t;
  dom.statWorld.textContent = w;
  dom.statBrasil.textContent = b;
  dom.statGenerated.textContent = state.generatedCount;
  dom.countAll.textContent = t;
  dom.countWorld.textContent = w;
  dom.countBrasil.textContent = b;
}

// ─── CREATIVE STUDIO ────────────────────────
let currentArticle = null;

async function openStudio(index) {
  const article = state.filteredArticles[index];
  if (!article) return;
  currentArticle = article;

  // Show studio
  dom.studioOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Fill sidebar
  const rc = article.region === 'brasil' ? 'brasil' : 'world';
  const rl = article.region === 'brasil' ? '🇧🇷 Brasil' : '🌍 Mundo';
  dom.studioSidebar.innerHTML = `
    <div class="sidebar-section">
      <h4>📰 Notícia Original</h4>
      <div class="sidebar-meta-row">
        <span class="card-badge ${rc}">${rl}</span>
        <span class="card-source">${esc(article.source)}</span>
        <span class="card-date">${fmtDate(article.pubDate)}</span>
      </div>
      <div class="sidebar-title">${esc(article.title)}</div>
      <div class="sidebar-desc">${esc(article.description || 'Sem descrição disponível.')}</div>
      <a href="${esc(article.link)}" target="_blank" rel="noopener" class="sidebar-link">🔗 Ler notícia original</a>
    </div>
    <div class="sidebar-section">
      <h4>🎪 Nicho Alvo</h4>
      <div class="sidebar-desc">Eventos corporativos, feiras, congressos, shows, festivais e conferências.</div>
    </div>
  `;

  // Reset tabs
  resetStudioTabs();

  // If already has creatives, render them
  if (article.creatives) {
    renderBlog(article.creatives.blog);
    renderFeed(article.creatives.feed, article.creatives.imageUrl);
    renderStories(article.creatives.stories);
    return;
  }

  // Show loading on all tabs
  showTabLoading('blog');
  showTabLoading('feed');
  showTabLoading('stories');

  // Generate creatives via OpenAI → Gemini fallback
  const creatives = await generateAllCreatives(article);

  if (creatives) {
    article.creatives = creatives;
    renderBlog(creatives.blog, creatives.imageUrl);
    renderFeed(creatives.feed, creatives.imageUrl);
    renderStories(creatives.stories);
    showToast('✨ Criativos gerados com sucesso!', 'success');
    // Update card badge
    applyFilters();
  } else {
    const errorHTML = `<div class="gen-loading">
      <span class="gen-loading-text">❌ Erro ao gerar — verifique as API keys ou aguarde 1 minuto</span>
      <button class="studio-btn" onclick="retryGenerate()" style="margin-top:16px;padding:10px 24px;background:var(--primary);border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:0.95rem;">🔄 Tentar Novamente</button>
    </div>`;
    dom.blogContent.innerHTML = errorHTML;
    dom.feedContent.innerHTML = errorHTML;
    dom.storiesContent.innerHTML = errorHTML;
  }
}

async function retryGenerate() {
  if (!currentArticle) return;
  showTabLoading('blog');
  showTabLoading('feed');
  showTabLoading('stories');
  const creatives = await generateAllCreatives(currentArticle);
  if (creatives) {
    currentArticle.creatives = creatives;
    renderBlog(creatives.blog, creatives.imageUrl);
    renderFeed(creatives.feed, creatives.imageUrl);
    renderStories(creatives.stories);
    showToast('✨ Criativos gerados com sucesso!', 'success');
    applyFilters();
  } else {
    const errorHTML = `<div class="gen-loading">
      <span class="gen-loading-text">❌ Erro ao gerar — verifique as API keys ou aguarde 1 minuto</span>
      <button class="studio-btn" onclick="retryGenerate()" style="margin-top:16px;padding:10px 24px;background:var(--primary);border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:0.95rem;">🔄 Tentar Novamente</button>
    </div>`;
    dom.blogContent.innerHTML = errorHTML;
    dom.feedContent.innerHTML = errorHTML;
    dom.storiesContent.innerHTML = errorHTML;
  }
}

function closeStudio() {
  dom.studioOverlay.classList.remove('active');
  document.body.style.overflow = '';
  currentArticle = null;
}

function resetStudioTabs() {
  const tabs = dom.studioTabs.querySelectorAll('.studio-tab');
  tabs.forEach(t => t.classList.remove('active'));
  tabs[0].classList.add('active');
  document.querySelectorAll('.studio-content-panel').forEach(p => p.classList.remove('active'));
  dom.panelBlog.classList.add('active');
}

function showTabLoading(type) {
  const dotClass = type;
  const labels = { blog: 'Gerando post para Blog...', feed: 'Gerando copy para Feed...', stories: 'Gerando Stories...' };
  const container = type === 'blog' ? dom.blogContent : type === 'feed' ? dom.feedContent : dom.storiesContent;
  container.innerHTML = `<div class="gen-loading"><div class="dot-pulse"><div class="dot ${dotClass}"></div><div class="dot ${dotClass}"></div><div class="dot ${dotClass}"></div></div><span class="gen-loading-text">${labels[type]}</span></div>`;
}

// ─── RENDER BLOG ────────────────────────────
function renderBlog(blog, imageUrl) {
  if (!blog) return;
  const fullText = `${blog.titulo}\n\n${blog.subtitulo || ''}\n\n${blog.introducao}\n\n${blog.corpo}\n\n${blog.conclusao}\n\n${blog.hashtags || ''}`;
  
  const imageSection = imageUrl ? `
    <div class="gen-card" style="overflow:hidden;">
      <div class="gen-card-header blog">
        <h3>🎨 Imagem de Capa (DALL-E)</h3>
        <a href="${imageUrl}" target="_blank" download class="btn-copy" style="text-decoration:none;">⬇️ Baixar HD</a>
      </div>
      <div class="gen-card-body" style="padding:0;">
        <img src="${imageUrl}" alt="Blog cover" style="width:100%;border-radius:0 0 12px 12px;display:block;cursor:pointer;" onclick="window.open(this.src,'_blank')">
      </div>
    </div>
  ` : '';
  
  dom.blogContent.innerHTML = `
    ${imageSection}
    <div class="gen-card">
      <div class="gen-card-header blog">
        <h3>📝 Título</h3>
        <button class="btn-copy" onclick="copyText(this, '${escAttr(blog.titulo)}')">📋 Copiar</button>
      </div>
      <div class="gen-card-body"><strong>${esc(blog.titulo)}</strong><br><em>${esc(blog.subtitulo || '')}</em></div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header blog">
        <h3>📖 Introdução</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(blog.introducao)})">📋 Copiar</button>
      </div>
      <div class="gen-card-body">${esc(blog.introducao)}</div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header blog">
        <h3>📄 Corpo do Artigo</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(blog.corpo)})">📋 Copiar</button>
      </div>
      <div class="gen-card-body">${esc(blog.corpo)}</div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header blog">
        <h3>🎯 Conclusão + CTA</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(blog.conclusao)})">📋 Copiar</button>
      </div>
      <div class="gen-card-body">${esc(blog.conclusao)}</div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header blog">
        <h3>🏷️ Hashtags</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(blog.hashtags || '')})">📋 Copiar</button>
      </div>
      <div class="gen-card-body">${esc(blog.hashtags || '')}</div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header blog">
        <h3>📋 Copiar Tudo (Blog Completo)</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(fullText)})">📋 Copiar Tudo</button>
      </div>
      <div class="gen-card-body" style="font-size:0.75rem;color:var(--text-muted);">Clique em "Copiar Tudo" para copiar o post completo de uma vez.</div>
    </div>
  `;
}

// ─── RENDER FEED ────────────────────────────
function renderFeed(feed, imageUrl) {
  if (!feed) return;
  const imageSection = imageUrl ? `
    <div class="gen-card" style="overflow:hidden;">
      <div class="gen-card-header feed">
        <h3>🎨 Imagem Gerada (DALL-E)</h3>
        <a href="${imageUrl}" target="_blank" download class="btn-copy" style="text-decoration:none;">⬇️ Baixar</a>
      </div>
      <div class="gen-card-body" style="padding:0;">
        <img src="${imageUrl}" alt="Creative image" style="width:100%;border-radius:0 0 12px 12px;display:block;cursor:pointer;" onclick="window.open(this.src,'_blank')">
      </div>
    </div>
  ` : `
    <div class="gen-card">
      <div class="gen-card-body" style="text-align:center;padding:16px;color:var(--text-muted);font-style:italic;">
        🎨 Imagem sendo gerada via DALL-E...
        <div class="dot-pulse" style="margin:12px auto 0;"><div class="dot feed"></div><div class="dot feed"></div><div class="dot feed"></div></div>
      </div>
    </div>
  `;

  dom.feedContent.innerHTML = `
    ${imageSection}
    <div class="gen-card">
      <div class="gen-card-header feed">
        <h3>⚡ Copy Curta</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(feed.copy_curta)})">📋 Copiar</button>
      </div>
      <div class="gen-card-body"><strong>${esc(feed.copy_curta)}</strong></div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header feed">
        <h3>📱 Copy Completa (Feed)</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(feed.copy_completa)})">📋 Copiar</button>
      </div>
      <div class="gen-card-body">${esc(feed.copy_completa)}</div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header feed">
        <h3>🏷️ Hashtags</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(feed.hashtags)})">📋 Copiar</button>
      </div>
      <div class="gen-card-body">${esc(feed.hashtags)}</div>
    </div>
    <div class="gen-card">
      <div class="gen-card-header feed">
        <h3>🎨 Sugestão Visual</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(feed.sugestao_visual)})">📋 Copiar</button>
      </div>
      <div class="gen-card-body"><em>${esc(feed.sugestao_visual)}</em></div>
    </div>
  `;
}

// ─── RENDER STORIES ─────────────────────────
function renderStories(stories) {
  if (!stories || !stories.length) return;
  const allText = stories.map(s => `[Slide ${s.slide} - ${s.tipo}]\n${s.texto}${s.cta ? '\n' + s.cta : ''}`).join('\n\n');
  dom.storiesContent.innerHTML = `
    <div class="gen-card">
      <div class="gen-card-header stories">
        <h3>📲 ${stories.length} Stories Prontos</h3>
        <button class="btn-copy" onclick="copyText(this, ${JSON.stringify(allText)})">📋 Copiar Tudo</button>
      </div>
      <div class="stories-grid">
        ${stories.map(s => `
          <div class="story-slide">
            <button class="btn-copy" onclick="event.stopPropagation(); copyText(this, ${JSON.stringify(s.texto + (s.cta ? '\\n' + s.cta : ''))})">📋</button>
            <div class="story-slide-num">Slide ${s.slide} — ${esc(s.tipo)}</div>
            <div class="story-slide-text">${esc(s.texto)}</div>
            ${s.cta ? `<div class="story-slide-cta">${esc(s.cta)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── COPY TO CLIPBOARD ──────────────────────
async function copyText(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    btn.innerHTML = '✅ Copiado!';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '📋 Copiar';
    }, 2000);
  } catch (e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    btn.classList.add('copied');
    btn.innerHTML = '✅ Copiado!';
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '📋 Copiar'; }, 2000);
  }
}

// ─── HISTORY ────────────────────────────────
async function saveToHistory(article, creatives) {
  try {
    const history = getHistorySync();
    history.unshift({
      id: article.id,
      title: article.title,
      source: article.source,
      region: article.region,
      link: article.link,
      creatives,
      generatedAt: new Date().toISOString(),
    });
    // Keep last 50
    if (history.length > 50) history.length = 50;
    localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(history));

    // Save to Supabase for agent exam tracking
    if (supaClient) {
      await supaClient.from('agent_news_history').insert([{
        article_id: article.id,
        title: article.title,
        source: article.source,
        region: article.region,
        link: article.link,
        creatives: creatives
      }]);
    }
  } catch (e) {
    console.warn('History save error:', e);
  }
}

function getHistorySync() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.HISTORY_KEY) || '[]');
  } catch { return []; }
}

async function openHistory() {
  dom.historyOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  dom.historyBody.innerHTML = '<div class="history-empty">Carregando histórico...</div>';

  let history = [];
  try {
    if (supaClient) {
      const { data, error } = await supaClient.from('agent_news_history').select('*').order('created_at', { ascending: false }).limit(50);
      if (!error && data) {
        history = data.map(row => ({
          id: row.article_id,
          title: row.title,
          source: row.source,
          region: row.region,
          link: row.link,
          creatives: row.creatives,
          generatedAt: row.created_at
        }));
      } else {
        history = getHistorySync();
      }
    } else {
      history = getHistorySync();
    }
  } catch (e) {
    history = getHistorySync();
  }

  state.loadedHistory = history;

  if (!history.length) {
    dom.historyBody.innerHTML = '<div class="history-empty">📭 Nenhum criativo gerado ainda.<br>Clique em "Gerar Criativos" em qualquer notícia.</div>';
    return;
  }

  dom.historyBody.innerHTML = history.map((h, i) => {
    const rc = h.region === 'brasil' ? '🇧🇷' : '🌍';
    const date = new Date(h.generatedAt);
    return `
      <div class="history-item" onclick="openHistoryItem(${i})">
        <h4>${rc} ${esc(h.title)}</h4>
        <p>${esc(h.source)} • ${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})} • Blog + Feed + Stories</p>
      </div>
    `;
  }).join('');
}

function openHistoryItem(index) {
  const history = state.loadedHistory;
  const item = history[index];
  if (!item) return;

  closeHistory();

  // Create pseudo-article
  const article = {
    id: item.id,
    title: item.title,
    source: item.source,
    region: item.region,
    link: item.link,
    description: '',
    pubDate: new Date(item.generatedAt),
    creatives: item.creatives,
  };
  currentArticle = article;

  // Open studio with cached creatives
  dom.studioOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  const rc = article.region === 'brasil' ? 'brasil' : 'world';
  const rl = article.region === 'brasil' ? '🇧🇷 Brasil' : '🌍 Mundo';
  dom.studioSidebar.innerHTML = `
    <div class="sidebar-section">
      <h4>📰 Notícia (do histórico)</h4>
      <div class="sidebar-meta-row">
        <span class="card-badge ${rc}">${rl}</span>
        <span class="card-source">${esc(article.source)}</span>
      </div>
      <div class="sidebar-title">${esc(article.title)}</div>
      <a href="${esc(article.link)}" target="_blank" rel="noopener" class="sidebar-link">🔗 Ler notícia original</a>
    </div>
  `;

  resetStudioTabs();
  renderBlog(article.creatives.blog);
  renderFeed(article.creatives.feed);
  renderStories(article.creatives.stories);
}

function closeHistory() {
  dom.historyOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// ─── FILTERS ────────────────────────────────
function applyFilters() {
  let filtered = [...state.articles];
  if (state.currentFilter !== 'all') filtered = filtered.filter(a => a.region === state.currentFilter);
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(a =>
      a.title.toLowerCase().includes(q) ||
      (a.description && a.description.toLowerCase().includes(q)) ||
      a.source.toLowerCase().includes(q)
    );
  }
  state.filteredArticles = filtered;
  renderCards(filtered);
}

// ─── FETCH NEWS ─────────────────────────────
async function fetchAllNews() {
  const cached = getCache();
  if (cached && cached.length > 0) {
    state.articles = cached;
    state.generatedCount = cached.filter(a => a.creatives).length;
    applyFilters();
    updateStats();
    showToast('📰 Notícias carregadas do cache.', 'info');
    return;
  }

  state.isLoading = true;
  dom.btnRefresh.classList.add('loading');
  renderSkeletons();

  const allFeeds = [...CONFIG.FEEDS.world, ...CONFIG.FEEDS.brasil];
  const results = await Promise.allSettled(allFeeds.map(f => fetchFeed(f)));
  let articles = [];
  results.forEach(r => { if (r.status === 'fulfilled') articles = articles.concat(r.value); });

  // If RSS failed entirely, use Gemini fallback
  if (articles.length === 0) {
    console.log('⚠️ RSS returned 0 articles, trying Gemini fallback...');
    articles = await fetchNewsViaGemini();
  }

  // Deduplicate
  const seen = new Map();
  articles = articles.filter(a => {
    const k = a.title.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúçñ0-9\s]/gi, '').substring(0, 60);
    if (seen.has(k)) return false;
    seen.set(k, true); return true;
  });
  articles.sort((a, b) => b.pubDate - a.pubDate);

  state.articles = articles;
  state.generatedCount = 0;
  if (articles.length > 0) setCache(articles);
  applyFilters();
  updateStats();

  state.isLoading = false;
  dom.btnRefresh.classList.remove('loading');

  if (articles.length) showToast(`🤖 ${articles.length} notícias de IA encontradas!`, 'success');
  else showToast('⚠️ Nenhuma notícia encontrada. Verifique sua conexão e tente novamente.', 'error');
}

async function refreshNews() {
  localStorage.removeItem(CONFIG.CACHE_KEY);
  await fetchAllNews();
}

// ─── CACHE ──────────────────────────────────
function setCache(articles) {
  try {
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ t: Date.now(), a: articles.map(a => ({ ...a, pubDate: a.pubDate.toISOString() })) }));
  } catch (e) { console.warn('Cache error:', e); }
}
function getCache() {
  try {
    const raw = localStorage.getItem(CONFIG.CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - d.t > CONFIG.CACHE_TTL) { localStorage.removeItem(CONFIG.CACHE_KEY); return null; }
    return d.a.map(a => ({ ...a, pubDate: new Date(a.pubDate) }));
  } catch { return null; }
}

// ─── UTILS ──────────────────────────────────
function fmtDate(date) {
  if (!date || isNaN(date)) return '';
  const diff = Date.now() - date;
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return 'Agora';
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  if (d < 7) return `${d}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function esc(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function escAttr(t) { return (t||'').replace(/'/g, "\\'").replace(/\n/g, '\\n'); }

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  dom.toastContainer.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

function updateKeyStatus() {
  if (state.apiKey) { dom.keyStatus.classList.add('active'); dom.apiKeyInput.placeholder = '••••••••••'; }
  else { dom.keyStatus.classList.remove('active'); dom.apiKeyInput.placeholder = 'Gemini API Key...'; }
}

function updateOpenaiKeyStatus() {
  if (dom.openaiStatus) {
    if (state.openaiKey) { dom.openaiStatus.classList.add('active'); dom.openaiKeyInput.placeholder = '••••••••••'; }
    else { dom.openaiStatus.classList.remove('active'); dom.openaiKeyInput.placeholder = 'OpenAI API Key...'; }
  }
}

function updateSupaStatus() {
  if (dom.supaStatus) {
    if (state.supaUrl && state.supaKey) { 
      dom.supaStatus.classList.add('active'); 
      dom.supaUrlInput.placeholder = 'URL (Salva)';
      dom.supaKeyInput.placeholder = '••••••••••';
    } else { 
      dom.supaStatus.classList.remove('active'); 
      dom.supaUrlInput.placeholder = 'Supabase URL...';
      dom.supaKeyInput.placeholder = 'Supabase Key...';
    }
  }
}

// ─── EVENTS ─────────────────────────────────
function setupEvents() {
  // Filters
  dom.filterTabs.addEventListener('click', e => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    dom.filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.currentFilter = tab.dataset.filter;
    applyFilters();
  });

  // Search
  dom.searchInput.addEventListener('input', e => { state.searchQuery = e.target.value.trim(); applyFilters(); });

  // Refresh
  dom.btnRefresh.addEventListener('click', () => { if (!state.isLoading) refreshNews(); });

  // API Key (Gemini)
  dom.btnSaveKey.addEventListener('click', () => {
    const k = dom.apiKeyInput.value.trim();
    if (k) {
      state.apiKey = k;
      localStorage.setItem(CONFIG.API_KEY_STORAGE, k);
      dom.apiKeyInput.value = '';
      updateKeyStatus();
      showToast('🔑 Gemini API Key salva!', 'success');
    }
  });

  // API Key (OpenAI)
  if (dom.btnSaveOpenai) {
    dom.btnSaveOpenai.addEventListener('click', () => {
      const k = dom.openaiKeyInput.value.trim();
      if (k) {
        state.openaiKey = k;
        localStorage.setItem(CONFIG.OPENAI_KEY_STORAGE, k);
        dom.openaiKeyInput.value = '';
        updateOpenaiKeyStatus();
        showToast('🔑 OpenAI API Key salva!', 'success');
      }
    });
  }

  // API Key (Supabase)
  if (dom.btnSaveSupa) {
    dom.btnSaveSupa.addEventListener('click', () => {
      const u = dom.supaUrlInput.value.trim();
      const k = dom.supaKeyInput.value.trim();
      if (u && k) {
        state.supaUrl = u;
        state.supaKey = k;
        localStorage.setItem(CONFIG.SUPABASE_URL_STORAGE, u);
        localStorage.setItem(CONFIG.SUPABASE_KEY_STORAGE, k);
        dom.supaUrlInput.value = '';
        dom.supaKeyInput.value = '';
        initSupabase();
        updateSupaStatus();
        showToast('🗄️ Credenciais do Supabase salvas!', 'success');
      } else {
        showToast('⚠️ Preencha a URL e a Key do Supabase.', 'error');
      }
    });
  }

  // Studio close
  dom.studioClose.addEventListener('click', closeStudio);
  dom.studioOverlay.addEventListener('click', e => { if (e.target === dom.studioOverlay) closeStudio(); });

  // Studio tabs
  dom.studioTabs.addEventListener('click', e => {
    const tab = e.target.closest('.studio-tab');
    if (!tab) return;
    dom.studioTabs.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.studio-content-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.add('active');
  });

  // History
  dom.btnHistory.addEventListener('click', openHistory);
  dom.historyClose.addEventListener('click', closeHistory);
  dom.historyOverlay.addEventListener('click', e => { if (e.target === dom.historyOverlay) closeHistory(); });

  // Card click → studio
  dom.newsGrid.addEventListener('click', e => {
    const card = e.target.closest('.news-card');
    if (card && !e.target.closest('.card-action')) {
      openStudio(parseInt(card.dataset.idx));
    }
  });

  // Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeStudio(); closeHistory(); }
  });
}

// ─── INIT ───────────────────────────────────
function init() {
  cacheDom();
  updateKeyStatus();
  updateOpenaiKeyStatus();
  updateSupaStatus();
  setupEvents();
  fetchAllNews();
}

init();
