import { AccessDenied } from "../../../components/sonara/ui.tsx";

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  return (
    <AccessDenied title="Your role does not include this area">
      This page needs the <code>{(need ?? "").replace(/[^a-z:]/g, "")}</code> permission. Ask a Sonara administrator if you need it. Nobody can grant roles to themselves.
    </AccessDenied>
  );
}
