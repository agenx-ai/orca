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

/** Local runtimes ship with this client; paired hosts may predate the capability. */
export function useRuntimeTargetCapability(
  target: RuntimeClientTarget | null,
  capability: RuntimeCapability
): boolean | null {
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  // Bound to its environment so a host switch cannot reuse the previous host's answer.
  const [proof, setProof] = useState<CapabilityProof | null>(null)
  useEffect(() => {
    if (!environmentId) {
      return
    }
    let stale = false
    void runtimeEnvironmentSupportsCapability(environmentId, capability)
      .then((next) => {
        if (!stale) {
          setProof({ environmentId, capability, supported: next })
        }
      })
      // A failed probe proves nothing; fall back to the last status instead of claiming no support.
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [environmentId, capability])
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
