/** Outcome messages shown after an editorial redirect (?done=…). */
export const EDITORIAL_DONE: Record<string, { tone: "ok" | "warn" | "info"; text: string }> = {
  submitted: { tone: "ok", text: "Submitted for review. A different reviewer must approve it." },
  changes_requested: { tone: "warn", text: "Changes requested. The editor has been notified." },
  approved: { tone: "ok", text: "Approved. It can now be published or scheduled." },
  published: { tone: "ok", text: "Published. It is now live for listeners." },
  scheduled: { tone: "info", text: "Scheduled. It goes live at the chosen time." },
  withdrawn: { tone: "warn", text: "Withdrawn. Listeners see a withdrawal notice instead of the audio." },
  reopened: { tone: "info", text: "Reopened as a draft." },
};

export const SERIES_DONE: Record<string, { tone: "ok" | "warn" | "info"; text: string }> = {
  published: { tone: "ok", text: "Series published. Only its published episodes are visible to listeners." },
  draft: { tone: "info", text: "Series moved back to draft and hidden from listeners." },
  archived: { tone: "warn", text: "Series archived and hidden from listeners." },
};
