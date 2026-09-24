import crypto from 'node:crypto'
import http from 'node:http'
import { shell } from 'electron'
import { jsonStore } from './storage'

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const SCOPE_VERSION = 1
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

interface Stored {
  refreshToken: string | null
  accessToken: string | null
  expiresAt: number
  scopeVersion: number
}

const store = jsonStore<Stored>('google-drive.json', {
  refreshToken: null,
  accessToken: null,
  expiresAt: 0,
  scopeVersion: 0
})

let clientId = ''
let clientSecret = ''

export function configure(deps: { clientId: string; clientSecret?: string }): void {
  clientId = deps.clientId.trim()
  clientSecret = deps.clientSecret?.trim() ?? ''
}

export function enabled(): boolean {
  return Boolean(clientId)
}

export function isConnected(): boolean {
  const current = store.read()
  return Boolean(current.refreshToken && current.scopeVersion === SCOPE_VERSION)
}

export function disconnect(): void {
  store.write({ refreshToken: null, accessToken: null, expiresAt: 0, scopeVersion: 0 })
}

function base64url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Desktop OAuth with PKCE and an ephemeral loopback port. */
export function connect(): Promise<{ ok: boolean; error?: string }> {
  if (!clientId) return Promise.resolve({ ok: false, error: 'Google Drive OAuth is not configured' })

  const verifier = base64url(crypto.randomBytes(64))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64url(crypto.randomBytes(18))

  return new Promise((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout
    const server = http.createServer()
    const done = (result: { ok: boolean; error?: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      resolve(result)
    }

    server.on('request', (req, res) => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const redirect = `http://127.0.0.1:${port}/callback`
      const url = new URL(req.url ?? '/', redirect)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><meta charset="utf-8"><body style="background:#08090c;color:#f5f7fa;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>OmniFlux ✓</p></body>')
      if (error) return done({ ok: false, error })
      if (!code || returnedState !== state) return done({ ok: false, error: 'state mismatch' })
      void exchange(code, verifier, redirect).then(done)
    })

    server.on('error', (error) => done({ ok: false, error: error.message }))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return done({ ok: false, error: 'loopback unavailable' })
      const redirect = `http://127.0.0.1:${address.port}/callback`
      const url = new URL(AUTH)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirect)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', SCOPE)
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('include_granted_scopes', 'true')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('state', state)
      void shell.openExternal(url.toString())
    })

    timer = setTimeout(() => done({ ok: false, error: 'timeout' }), 180_000)
  })
}

async function exchange(code: string, verifier: string, redirect: string): Promise<{ ok: boolean; error?: string }> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    code_verifier: verifier
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) return { ok: false, error: `token ${response.status}` }
  const token = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  if (!token.refresh_token) return { ok: false, error: 'refresh token missing' }
  store.write({
    refreshToken: token.refresh_token,
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    scopeVersion: SCOPE_VERSION
  })
  return { ok: true }
}

export async function userToken(): Promise<string | null> {
  const current = store.read()
  if (current.scopeVersion !== SCOPE_VERSION) return null
  if (current.accessToken && Date.now() < current.expiresAt - 60_000) return current.accessToken
  if (!current.refreshToken || !clientId) return null

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) disconnect()
    return null
  }
  const token = (await response.json()) as { access_token: string; expires_in: number }
  store.write({
    ...current,
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000
  })
  return token.access_token
}
