import type { ReactNode } from "react";
import { McBand } from "../../components/chronicles/mc-band.tsx";

export default function MedicalChroniclesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mc-root">
      <McBand />
      {children}
    </div>
  );
}
