import type { CloudProviderId } from './contract/resources';

export type CloudProviderContext = {
  provider: CloudProviderId;
};

// Routing is intentionally not wired into the current Workspace in this phase.
