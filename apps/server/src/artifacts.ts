import type { Artifact } from '@research-workbench/shared'

export function findLatestArtifact(artifacts: Artifact[], name: string): Artifact | null {
  let latest: Artifact | null = null
  for (const artifact of artifacts) {
    if (artifact.name !== name) continue
    if (
      !latest ||
      artifact.version > latest.version ||
      (artifact.version === latest.version && artifact.createdAt > latest.createdAt)
    ) {
      latest = artifact
    }
  }
  return latest
}
