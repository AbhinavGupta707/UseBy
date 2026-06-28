export type ProofStatus = "ok" | "warning" | "unavailable" | "error" | "unknown";

export type EndpointEnvelope<T = unknown> = {
  endpoint: string;
  status: ProofStatus;
  httpStatus: number | null;
  checkedAt: string;
  data: T | null;
  error: string | null;
};

export type IntegrationProof = {
  key: string;
  label: string;
  status: ProofStatus;
  detail: string;
};

export type RowCountProof = {
  key: string;
  label: string;
  count: number | null;
};

export type ExtensionProof = {
  name: string;
  status: ProofStatus;
  version: string | null;
  detail: string;
};

export type TimelineEventProof = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string | null;
  status: ProofStatus;
};

export type JobRunProof = {
  id: string;
  name: string;
  status: ProofStatus;
  detail: string;
  ranAt: string | null;
};

export type DemoControlProof = {
  key: string;
  label: string;
  method: "GET" | "POST";
  endpoint: string;
  detail: string;
};

export type ArchitectureNode = {
  label: string;
  detail: string;
  status: ProofStatus;
};

export type ProofSnapshot = {
  checkedAt: string;
  overallStatus: ProofStatus;
  stateEndpoint: EndpointEnvelope;
  dbProofEndpoint: EndpointEnvelope;
  architecture: ArchitectureNode[];
  integrations: IntegrationProof[];
  rowCounts: RowCountProof[];
  extensions: ExtensionProof[];
  auditEvents: TimelineEventProof[];
  jobRuns: JobRunProof[];
  demoControls: DemoControlProof[];
};

