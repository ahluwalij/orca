import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { AddApiProviderAccountSchema } from '../shared/api-provider-account'
import {
  preserveClaudeApiProviderSettings,
  readApiProviderAccount,
  saveApiProviderAccount
} from './api-provider-account'
import { syncSystemConfigIntoManagedCodexHome } from './codex/codex-config-mirror'

const homes: string[] = []
function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'orca-api-account-'))
  homes.push(home)
  return home
}
const input = {
  label: 'Surplus',
  baseUrl: 'https://api.surplusintelligence.ai/v1',
  model: 'gpt-6.1-sol',
  apiKey: 'inf_test_key'
}
afterEach(() => homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true })))

describe('API provider account isolation', () => {
  it('keeps provider selection, model changes, and API credentials out of System default through repeated mirrors', () => {
    const systemHomePath = tempHome()
    const runtimeHomePath = tempHome()
    const canonical = 'model = "subscription-model"\nmodel_provider = "openai"\n'
    const personalAuth = JSON.stringify({ tokens: { refresh_token: 'personal-refresh' } })
    writeFileSync(join(systemHomePath, 'config.toml'), canonical)
    writeFileSync(join(systemHomePath, 'auth.json'), personalAuth)
    saveApiProviderAccount(runtimeHomePath, input, 'codex')
    const homes = { systemHomePath, runtimeHomePath }
    syncSystemConfigIntoManagedCodexHome(homes)
    const first = parse(readFileSync(join(runtimeHomePath, 'config.toml'), 'utf8'))
    expect(first).toMatchObject({
      model: input.model,
      model_provider: 'orca_api_account',
      model_providers: { orca_api_account: { base_url: input.baseUrl } }
    })
    writeFileSync(
      join(runtimeHomePath, 'config.toml'),
      readFileSync(join(runtimeHomePath, 'config.toml'), 'utf8').replace(
        input.model,
        'another-api-model'
      )
    )
    syncSystemConfigIntoManagedCodexHome(homes)
    expect(readFileSync(join(systemHomePath, 'config.toml'), 'utf8')).toBe(canonical)
    expect(readFileSync(join(systemHomePath, 'auth.json'), 'utf8')).toBe(personalAuth)
    expect(JSON.parse(readFileSync(join(runtimeHomePath, 'auth.json'), 'utf8'))).toEqual({
      auth_mode: 'apikey',
      OPENAI_API_KEY: input.apiKey
    })
    expect(readApiProviderAccount(runtimeHomePath)).not.toHaveProperty('apiKey')
    if (process.platform !== 'win32') {
      expect(statSync(join(runtimeHomePath, 'auth.json')).mode & 0o777).toBe(0o600)
    }
  })

  it("refreshes shared Claude settings while preserving only that account's provider credentials", () => {
    const home = tempHome()
    const settingsPath = join(home, 'settings.json')
    writeFileSync(settingsPath, JSON.stringify({ env: { UNRELATED: 'old' } }))
    const provider = saveApiProviderAccount(
      home,
      {
        ...input,
        baseUrl: 'https://api.surplusintelligence.ai/anthropic',
        model: 'claude-sonnet-5.5'
      },
      'claude'
    )
    const current = JSON.parse(readFileSync(settingsPath, 'utf8'))
    const source = {
      env: { ANTHROPIC_AUTH_TOKEN: 'different-account', UNRELATED: 'new' },
      hooks: { Stop: [] }
    }
    const refreshed = preserveClaudeApiProviderSettings(home, source, current)
    expect(refreshed).toMatchObject({
      hooks: source.hooks,
      env: {
        UNRELATED: 'new',
        ANTHROPIC_AUTH_TOKEN: input.apiKey,
        ANTHROPIC_BASE_URL: provider.baseUrl,
        ANTHROPIC_MODEL: provider.model
      }
    })
    expect(source.env.ANTHROPIC_AUTH_TOKEN).toBe('different-account')
    expect(() => preserveClaudeApiProviderSettings(home, source, {})).toThrow(/key is missing/)
  })

  it('does not alter subscription profile settings', () => {
    const source = { env: { ANTHROPIC_AUTH_TOKEN: 'original' } }
    expect(preserveClaudeApiProviderSettings(tempHome(), source, {})).toBe(source)
  })

  it('rejects endpoints with insecure transport or embedded credentials', () => {
    for (const baseUrl of [
      'http://example.com/v1',
      'https://user:secret@example.com/v1',
      'https://example.com/v1?key=secret'
    ]) {
      expect(AddApiProviderAccountSchema.safeParse({ ...input, baseUrl }).success).toBe(false)
    }
  })
})
