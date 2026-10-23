import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, stringify } from 'smol-toml'
import {
  ApiProviderAccountSchema,
  type ApiProviderAccount,
  type AddApiProviderAccount
} from '../shared/api-provider-account'
import { writeSecureFile } from '../shared/secure-file'

const CONFIG_FILE = 'orca-api-provider.json'
const CLAUDE_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL'
] as const

export function readApiProviderAccount(home: string): ApiProviderAccount | null {
  const path = join(home, CONFIG_FILE)
  if (!existsSync(path)) {
    return null
  }
  return ApiProviderAccountSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}

export function saveApiProviderAccount(
  home: string,
  input: AddApiProviderAccount,
  agent: 'claude' | 'codex'
): ApiProviderAccount {
  const metadata = ApiProviderAccountSchema.parse(input)
  if (agent === 'codex') {
    writeSecureFile(
      join(home, 'auth.json'),
      JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: input.apiKey }),
      { durable: true }
    )
  } else {
    const path = join(home, 'settings.json')
    const settings: Record<string, unknown> = existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8'))
      : {}
    const env = claudeApiProviderEnv(settings)
    settings.env = {
      ...env,
      ANTHROPIC_BASE_URL: metadata.baseUrl,
      ANTHROPIC_AUTH_TOKEN: input.apiKey,
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_MODEL: metadata.model
    }
    writeSecureFile(path, `${JSON.stringify(settings, null, 2)}\n`, { durable: true })
  }
  writeSecureFile(join(home, CONFIG_FILE), `${JSON.stringify(metadata, null, 2)}\n`, {
    durable: true
  })
  return metadata
}

function claudeApiProviderEnv(settings: Record<string, unknown>): Record<string, unknown> {
  const env = settings.env
  return typeof env === 'object' && env !== null && !Array.isArray(env)
    ? Object.fromEntries(Object.entries(env))
    : {}
}

export function preserveClaudeApiProviderSettings(
  home: string,
  source: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> {
  if (!readApiProviderAccount(home)) {
    return source
  }
  const env = claudeApiProviderEnv(current)
  if (typeof env.ANTHROPIC_AUTH_TOKEN !== 'string' || !env.ANTHROPIC_AUTH_TOKEN.trim()) {
    throw new Error('The API account key is missing. Remove and add this API account again.')
  }
  return {
    ...source,
    env: {
      ...claudeApiProviderEnv(source),
      ...Object.fromEntries(CLAUDE_ENV_KEYS.map((key) => [key, env[key]]))
    }
  }
}

export function applyCodexApiProviderConfig(home: string, provider: ApiProviderAccount): void {
  const path = join(home, 'config.toml')
  const config = existsSync(path) ? parse(readFileSync(path, 'utf8')) : {}
  const providers = config.model_providers
  config.model = provider.model
  config.model_provider = 'orca_api_account'
  config.service_tier = 'default'
  config.model_providers = {
    ...(typeof providers === 'object' &&
    providers !== null &&
    !Array.isArray(providers) &&
    !(providers instanceof Date)
      ? providers
      : {}),
    orca_api_account: {
      name: provider.label,
      base_url: provider.baseUrl,
      wire_api: 'responses',
      requires_openai_auth: true,
      supports_websockets: false
    }
  }
  writeSecureFile(path, stringify(config), { durable: true })
}

export function assertApiProviderAccountHome(
  home: string | null,
  expected?: ApiProviderAccount
): void {
  if (home && expected && !readApiProviderAccount(home)) {
    throw new Error(
      'The API account configuration is missing. Remove and add this API account again.'
    )
  }
}

export function apiProviderUsageNotice(home: string | null): { usageError?: string } {
  return home && readApiProviderAccount(home)
    ? { usageError: 'API key billing — check usage with your API provider.' }
    : {}
}
