// Job sources are stored as lowercase ids (jobs.platform_source, approval_requests.platform),
// the same ids as backend services/mcp-registry.ts. This maps them to display names.
const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  jobstreet: "JobStreet",
  glints: "Glints",
  kalibrr: "Kalibrr",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  dealls: "Dealls",
  kitalulus: "KitaLulus",
  indeed: "Indeed",
};

export function platformLabel(source?: string | null): string {
  if (!source) return "-";
  return PLATFORM_LABELS[source.toLowerCase()] ?? source;
}
