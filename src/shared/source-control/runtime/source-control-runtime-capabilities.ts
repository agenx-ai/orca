import {
  GIT_HISTORY_REFS_CAPABILITY,
  GIT_GRAPH_TAB_CAPABILITY,
  GIT_COMMIT_ACTIONS_CAPABILITY,
  GIT_BLAME_CAPABILITY
} from './git-graph-capabilities'
export const GITHUB_COMPLETE_PR_CHECK_OBSERVATION_CAPABILITY =
  'github.complete-pr-check-observation.v1' as const
export const GITHUB_MARK_PR_READY_RUNTIME_CAPABILITY = 'github.markPRReadyForReview' as const
export const GITHUB_EXACT_WORK_ITEM_TARGET_RUNTIME_CAPABILITY =
  'github.exact-work-item-target.v1' as const
// Hosts with this capability let mobile call github.markPRReadyForReview.
export const MOBILE_GITHUB_MARK_PR_READY_RUNTIME_CAPABILITY =
  'mobile.github.markPRReadyForReview.v1' as const
// Hosts with this capability let mobile call github.markPRDraft; older hosts hide Mark as draft.
export const MOBILE_GITHUB_MARK_PR_DRAFT_RUNTIME_CAPABILITY =
  'mobile.github.markPRDraft.v1' as const
export const GITHUB_MARK_PR_READY_UPDATE_REQUIRED_MESSAGE =
  'Marking a pull request ready requires a newer Orca server. Update the server and try again.'
export const GITLAB_READY_FOR_REVIEW_RUNTIME_CAPABILITY =
  'gitlab.updateMR.readyForReview.v1' as const
export const GITLAB_READY_FOR_REVIEW_UPDATE_REQUIRED_MESSAGE =
  'Marking a merge request ready requires a newer Orca server. Update the server and try again.'
// Older servers drop `involvement` from gitlab.listMRs and would list everyone's MRs.
export const GITLAB_MR_INVOLVEMENT_RUNTIME_CAPABILITY = 'gitlab.listMRs.involvement.v1' as const
export const GITLAB_MR_INVOLVEMENT_UPDATE_REQUIRED_MESSAGE =
  'Filtering merge requests by you requires a newer Orca server. Update the server and try again.'
// Commit-message generation: the host plans Antigravity with the model the user configured.
export const ANTIGRAVITY_CONFIGURED_MODEL_RUNTIME_CAPABILITY =
  'git.antigravity-configured-model.v1' as const
// Multi-repository folder projects: scan panel and nested branch operations.
export const FOLDER_REPOS_RUNTIME_CAPABILITY = 'folder.repos.v1' as const
// Repository exclusion writes git.ignoredRepositories into the folder's .vscode/settings.json.
export const FOLDER_REPO_EXCLUDE_RUNTIME_CAPABILITY = 'folder.repos.exclude.v1' as const
export const FOLDER_BRANCH_COMPARE_RUNTIME_CAPABILITY = 'git.folder-compare.v1' as const
// Submodule actions run as pollable server tasks, so recursive updates outlive one RPC deadline.
export const GIT_SUBMODULE_TASK_RUNTIME_CAPABILITY = 'git.submodule-task.v1' as const
// Stash list/apply/pop/drop; older hosts have no stash RPCs.
export const GIT_STASH_RUNTIME_CAPABILITY = 'git.stash.v1' as const
// Tag list/create/delete; older hosts have no tag RPCs.
export const GIT_TAGS_RUNTIME_CAPABILITY = 'git.tags.v1' as const
// Remote list/add/remove/fetch; older hosts have no remote management RPCs.
export const GIT_REMOTES_RUNTIME_CAPABILITY = 'git.remotes.v1' as const

export const SOURCE_CONTROL_RUNTIME_CAPABILITIES = [
  GIT_HISTORY_REFS_CAPABILITY,
  GIT_GRAPH_TAB_CAPABILITY,
  GIT_COMMIT_ACTIONS_CAPABILITY,
  GIT_BLAME_CAPABILITY,
  GITHUB_COMPLETE_PR_CHECK_OBSERVATION_CAPABILITY,
  GITHUB_EXACT_WORK_ITEM_TARGET_RUNTIME_CAPABILITY,
  ANTIGRAVITY_CONFIGURED_MODEL_RUNTIME_CAPABILITY,
  GITHUB_MARK_PR_READY_RUNTIME_CAPABILITY,
  MOBILE_GITHUB_MARK_PR_READY_RUNTIME_CAPABILITY,
  MOBILE_GITHUB_MARK_PR_DRAFT_RUNTIME_CAPABILITY,
  GITLAB_READY_FOR_REVIEW_RUNTIME_CAPABILITY,
  GITLAB_MR_INVOLVEMENT_RUNTIME_CAPABILITY,
  FOLDER_REPOS_RUNTIME_CAPABILITY,
  FOLDER_REPO_EXCLUDE_RUNTIME_CAPABILITY,
  FOLDER_BRANCH_COMPARE_RUNTIME_CAPABILITY,
  GIT_SUBMODULE_TASK_RUNTIME_CAPABILITY,
  GIT_STASH_RUNTIME_CAPABILITY,
  GIT_TAGS_RUNTIME_CAPABILITY,
  GIT_REMOTES_RUNTIME_CAPABILITY
] as const
