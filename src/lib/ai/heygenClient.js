// Cliente HeyGen para gerar um vídeo curto a partir de um texto.
//
// Dois modos:
// 1) Avatar específico (recomendado): se VITE_HEYGEN_AVATAR_ID estiver setado, usa
//    o endpoint v2 /v2/video/generate com avatar_id + voice (opcional via VITE_HEYGEN_VOICE_ID).
//    O status é consultado em /v1/video_status.get?video_id=...
// 2) Video Agent automático: sem avatar_id, cai no endpoint v3 /v3/video-agents que escolhe
//    avatar/voz/cenas sozinho a partir do prompt. Status em /v3/videos/{video_id}.

const API_KEY = readEnv('VITE_HEYGEN_API_KEY')
const AVATAR_ID = readEnv('VITE_HEYGEN_AVATAR_ID')
const VOICE_ID = readEnv('VITE_HEYGEN_VOICE_ID')
const BASE_URL = 'https://api.heygen.com'

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 10 * 60_000

export const heygenClient = {
  isLive() {
    return Boolean(API_KEY)
  },

  // Gera um vídeo. onProgress recebe { status, message } durante o polling.
  async generateVideo({ prompt, onProgress } = {}) {
    if (!API_KEY) throw new Error('HeyGen indisponível: configure VITE_HEYGEN_API_KEY no .env.')
    const text = String(prompt || '').trim()
    if (!text) throw new Error('Roteiro vazio. Escreva uma mensagem antes de gerar o vídeo.')

    if (AVATAR_ID) {
      return generateWithAvatarV2({ text, onProgress })
    }
    return generateWithVideoAgentV3({ text, onProgress })
  },
}

// ====== V2 com avatar específico ============================================

let cachedVoiceIdForAvatar = ''

async function resolveVoiceId(onProgress) {
  if (VOICE_ID) return VOICE_ID
  if (cachedVoiceIdForAvatar) return cachedVoiceIdForAvatar

  notify(onProgress, 'preparing', 'Buscando voz padrão do avatar...')
  // Tenta o endpoint de detalhe do avatar primeiro (mais barato), depois lista completa.
  let voiceId = ''
  try {
    const detail = await getJson(`${BASE_URL}/v2/avatars/${encodeURIComponent(AVATAR_ID)}`)
    voiceId = detail?.data?.default_voice_id || detail?.default_voice_id || detail?.data?.voice_id || ''
  } catch { /* segue tentando lista */ }

  if (!voiceId) {
    const list = await getJson(`${BASE_URL}/v2/avatars`)
    const avatars = list?.data?.avatars || list?.avatars || list?.data || []
    const match = Array.isArray(avatars)
      ? avatars.find((item) => String(item?.avatar_id || item?.id || '') === String(AVATAR_ID))
      : null
    voiceId = match?.default_voice_id || match?.voice_id || ''
  }

  // Fallback final: pega qualquer voz pt-BR da lista de vozes
  if (!voiceId) {
    try {
      const voices = await getJson(`${BASE_URL}/v2/voices`)
      const voiceList = voices?.data?.voices || voices?.voices || voices?.data || []
      const pt = Array.isArray(voiceList)
        ? voiceList.find((item) => /pt|portug|brazil/i.test(String(item?.language || item?.locale || '')))
        : null
      voiceId = pt?.voice_id || pt?.id || ''
    } catch { /* desiste */ }
  }

  if (!voiceId) throw new Error('Não consegui descobrir a voz padrão do avatar. Defina VITE_HEYGEN_VOICE_ID no .env.')
  cachedVoiceIdForAvatar = voiceId
  return voiceId
}

async function generateWithAvatarV2({ text, onProgress }) {
  notify(onProgress, 'queued', 'Enviando roteiro para o HeyGen...')

  const voiceId = await resolveVoiceId(onProgress)

  const body = {
    video_inputs: [
      {
        character: { type: 'avatar', avatar_id: AVATAR_ID, avatar_style: 'normal' },
        voice: { type: 'text', input_text: text, voice_id: voiceId, speed: 1.0 },
      },
    ],
    dimension: { width: 1280, height: 720 },
  }

  const response = await postJson(`${BASE_URL}/v2/video/generate`, body)
  const videoId = response?.data?.video_id || response?.video_id || ''
  if (!videoId) throw new Error('HeyGen não retornou um identificador de vídeo (verifique avatar_id e voice_id).')

  notify(onProgress, 'preparing', 'Vídeo enfileirado, renderizando...')
  return pollVideoStatusV1(videoId, onProgress)
}

async function pollVideoStatusV1(videoId, onProgress) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (true) {
    if (Date.now() > deadline) throw new Error('Tempo limite ao esperar o vídeo ficar pronto.')
    const result = await getJson(`${BASE_URL}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`)
    const data = result?.data || result
    const status = String(data?.status || '').toLowerCase()
    if (status === 'completed' || status === 'success' || status === 'ready') {
      const videoUrl = data?.video_url || data?.video_url_caption || data?.url || ''
      if (!videoUrl) throw new Error('Vídeo concluído sem URL retornada pelo HeyGen.')
      notify(onProgress, 'completed', 'Vídeo pronto.')
      return { videoUrl, videoId }
    }
    if (status === 'failed' || status === 'error') {
      const message = data?.error?.message || data?.error?.detail || data?.error || data?.message || 'falha desconhecida'
      throw new Error(`HeyGen falhou na geração: ${message}`)
    }
    notify(onProgress, 'rendering', `Renderizando vídeo (${status || 'pending'})...`)
    await delay(POLL_INTERVAL_MS)
  }
}

// ====== V3 Video Agent (fallback automático) ================================

async function generateWithVideoAgentV3({ text, onProgress }) {
  notify(onProgress, 'queued', 'Enviando roteiro para o HeyGen...')

  const session = await postJson(`${BASE_URL}/v3/video-agents`, { prompt: text })
  const sessionId = session?.data?.session_id || session?.session_id || ''
  if (!sessionId) throw new Error('HeyGen não retornou um identificador de sessão.')

  let videoId = session?.data?.video_id || ''
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (!videoId) {
    if (Date.now() > deadline) throw new Error('Tempo limite ao esperar o HeyGen iniciar o vídeo.')
    await delay(POLL_INTERVAL_MS)
    notify(onProgress, 'preparing', 'Preparando avatar e cenas...')
    const status = await getJson(`${BASE_URL}/v3/video-agents/${encodeURIComponent(sessionId)}`)
    videoId = status?.data?.video_id || status?.video_id || ''
    if (status?.data?.status === 'failed' || status?.status === 'failed') {
      throw new Error('HeyGen sinalizou falha na geração do vídeo.')
    }
  }

  while (true) {
    if (Date.now() > deadline) throw new Error('Tempo limite ao esperar o vídeo ficar pronto.')
    const result = await getJson(`${BASE_URL}/v3/videos/${encodeURIComponent(videoId)}`)
    const data = result?.data || result
    const status = String(data?.status || '').toLowerCase()
    if (status === 'completed' || status === 'success' || status === 'ready') {
      const videoUrl = data?.video_url || data?.url || ''
      if (!videoUrl) throw new Error('Vídeo concluído sem URL retornada pelo HeyGen.')
      notify(onProgress, 'completed', 'Vídeo pronto.')
      return { videoUrl, videoId, sessionId }
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(data?.error || data?.message || 'HeyGen retornou erro na geração.')
    }
    notify(onProgress, 'rendering', 'Renderizando vídeo...')
    await delay(POLL_INTERVAL_MS)
  }
}

// ====== HTTP helpers ========================================================

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Api-Key': API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  return parseResponse(response, 'Falha ao chamar o HeyGen')
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      'X-Api-Key': API_KEY,
      accept: 'application/json',
    },
  })
  return parseResponse(response, 'Falha ao consultar o HeyGen')
}

async function parseResponse(response, prefix) {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${prefix} (${response.status}): ${detail.slice(0, 200) || response.statusText}`)
  }
  try {
    return await response.json()
  } catch {
    return null
  }
}

function notify(onProgress, status, message) {
  if (typeof onProgress === 'function') {
    try { onProgress({ status, message }) } catch { /* ignora */ }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readEnv(name) {
  const env = import.meta.env ?? {}
  return env[name] || ''
}
