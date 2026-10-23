import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('named API accounts use the existing Claude and Codex account pickers', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(() => {
    window.__store.getState().openSettingsTarget({ pane: 'accounts', repoId: null })
    window.__store.getState().openSettingsPage()
  })
  for (const agent of ['claude', 'codex'] as const) {
    const section = orcaPage.locator(`#accounts-${agent}`)
    await section.getByRole('button', { name: 'Add API account', exact: true }).click()
    const dialog = orcaPage.getByRole('dialog')
    await expect(dialog.getByLabel('API endpoint', { exact: true })).toHaveValue(
      `https://api.surplusintelligence.ai/${agent === 'claude' ? 'anthropic' : 'v1'}`
    )
    await dialog.getByLabel('API key', { exact: true }).fill('inf_e2e_fake_key')
    await dialog.getByRole('button', { name: 'Save account', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(section.getByText('Surplus', { exact: true })).toBeVisible()
    const state = await orcaPage.evaluate(
      async (provider) =>
        window.api[provider === 'claude' ? 'claudeAccounts' : 'codexAccounts'].list(),
      agent
    )
    expect(state.accounts).toHaveLength(1)
    expect(state.accounts[0].apiProvider?.label).toBe('Surplus')
    expect(JSON.stringify(state)).not.toContain('inf_e2e_fake_key')
    await section.getByRole('button', { name: /Surplus/ }).click()
    await expect(section.getByRole('button', { name: /Surplus/ })).toContainText('Active')
    await section.getByRole('button', { name: /^System default/ }).click()
    await expect(section.getByRole('button', { name: /^System default/ })).toContainText('Active')
  }
  await orcaPage.screenshot({ path: testInfo.outputPath('surplus-accounts.png'), fullPage: true })
})
