import { EDITORIAL_LABEL, type EditorialStatus } from "@kito/chronicles";
import { Pill } from "../../../components/sonara/ui.tsx";

const TONE: Record<EditorialStatus, "neutral" | "info" | "warn" | "ok" | "danger" | "accent"> = {
  draft: "neutral",
  in_review: "info",
  changes_requested: "warn",
  approved: "accent",
  published: "ok",
  withdrawn: "danger",
};

export function EditorialPill({ status, publishedAt }: { status: EditorialStatus; publishedAt?: string | null }) {
  const scheduled = status === "published" && publishedAt && Date.parse(publishedAt) > Date.now();
  return <Pill tone={scheduled ? "info" : TONE[status]}>{scheduled ? "Scheduled" : EDITORIAL_LABEL[status]}</Pill>;
}
