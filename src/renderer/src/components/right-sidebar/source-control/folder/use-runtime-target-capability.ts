import { useEffect, useState } from 'react'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { RuntimeCapability } from '../../../../../../shared/remote-runtime/protocol/protocol-version'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/rpc/compatibility/runtime-capability-proof'
import { readCachedRuntimeEnvironmentCapability } from '@/runtime/rpc/compatibility/runtime-compatibility-cache'

type CapabilityProof = {
  environmentId: string
  capability: RuntimeCapability
  supported: boolean
}

const PROBE_RETRY_MS = 3_000

/** Local runtimes ship with this client; paired hosts may predate the capability. */
export function useRuntimeTargetCapability(
  target: RuntimeClientTarget | null,
  capability: RuntimeCapability
): boolean | null {
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  // Bound to its environment so a host switch cannot reuse the previous host's answer.
  const [proof, setProof] = useState<CapabilityProof | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!environmentId) {
      return
    }
    let stale = false
    let retry: ReturnType<typeof setTimeout> | undefined
    void runtimeEnvironmentSupportsCapability(environmentId, capability)
      .then((next) => {
        if (!stale) {
          setProof({ environmentId, capability, supported: next })
        }
      })
      // A failed probe proves nothing; retry instead of leaving the panel blank for this mount.
      .catch(() => {
        if (!stale) {
          retry = setTimeout(() => setAttempt((value) => value + 1), PROBE_RETRY_MS)
        }
      })
    return () => {
      stale = true
      if (retry !== undefined) {
        clearTimeout(retry)
      }
    }
  }, [attempt, environmentId, capability])
  if (!target) {
    return null
  }
  if (!environmentId) {
    return true
  }
  if (proof && proof.environmentId === environmentId && proof.capability === capability) {
    return proof.supported
  }
  return readCachedRuntimeEnvironmentCapability(environmentId, capability)
}
