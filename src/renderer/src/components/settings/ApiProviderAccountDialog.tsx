import { useId, useState } from 'react'
import {
  AddApiProviderAccountSchema,
  type AddApiProviderAccount
} from '../../../../shared/api-provider-account'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export function ApiProviderAccountDialog({
  agent,
  disabled,
  onAdd
}: {
  agent: 'claude' | 'codex'
  disabled: boolean
  onAdd: (input: AddApiProviderAccount) => Promise<void>
}): React.JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({
    label: 'Surplus',
    apiKey: '',
    baseUrl: `https://api.surplusintelligence.ai/${agent === 'claude' ? 'anthropic' : 'v1'}`,
    model: agent === 'claude' ? 'claude-sonnet-5.5' : 'gpt-6.1-sol'
  })
  const fields = [
    { key: 'label', label: 'Account name', type: 'text' },
    { key: 'baseUrl', label: 'API endpoint', type: 'url' },
    { key: 'model', label: 'Model', type: 'text' },
    { key: 'apiKey', label: 'API key', type: 'password' }
  ] as const
  async function save(): Promise<void> {
    const parsed = AddApiProviderAccountSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the account details.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onAdd(parsed.data)
      setDraft({ ...draft, apiKey: '' })
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the API account.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next)
          if (!next) {
            setDraft({ ...draft, apiKey: '' })
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" disabled={disabled}>
          Add API account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {agent === 'claude' ? 'Claude' : 'Codex'} API account</DialogTitle>
          <DialogDescription>
            Save a provider key and endpoint for the account picker. Usage is billed by your API
            provider.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          {fields.map((field) => (
            <div className="flex flex-col gap-2" key={field.key}>
              <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
              <Input
                id={`${id}-${field.key}`}
                type={field.type}
                value={draft[field.key]}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              />
            </div>
          ))}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !draft.apiKey.trim()}>
              {busy ? 'Saving…' : 'Save account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
