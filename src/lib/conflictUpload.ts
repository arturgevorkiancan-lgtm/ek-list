import { detectAndSaveConflicts, type DetectConflictsParams } from './conflictDetector'

export async function runConflictDetectionAfterUpload(
  params: DetectConflictsParams,
): Promise<{
  hasUnresolved: boolean
  reopenedResolved: number
  createdCount: number
}> {
  const result = await detectAndSaveConflicts(params)
  return {
    hasUnresolved: result.hasUnresolved,
    reopenedResolved: result.reopenedResolved,
    createdCount: result.createdOrUpdated.filter((c) => !c.resolved).length,
  }
}
