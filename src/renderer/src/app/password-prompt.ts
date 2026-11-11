import { useSyncExternalStore } from 'react'

// Opening a password-protected PDF asks for the password in a dialog (see
// PasswordDialog). Several files can ask at once; they wait in line.

export interface PasswordRequest {
  name: string
  // The previous attempt was wrong.
  retry: boolean
  answer: (password: string | null) => void
}

let queue: PasswordRequest[] = []
const listeners = new Set<() => void>()
const publish = (next: PasswordRequest[]): void => {
  queue = next
  for (const listener of listeners) listener()
}

export function askPassword(name: string, retry: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const request: PasswordRequest = {
      name,
      retry,
      answer: (password) => {
        publish(queue.filter((r) => r !== request))
        resolve(password)
      }
    }
    publish([...queue, request])
  })
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const usePasswordRequest = (): PasswordRequest | null =>
  useSyncExternalStore(subscribe, () => queue[0] ?? null)

// The user gave up on a protected file; not an error worth a message.
export class PasswordCancelled extends Error {
  constructor(name: string) {
    super(`${name} was not opened`)
  }
}
