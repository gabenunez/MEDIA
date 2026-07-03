import { TvShell } from "@/components/tv/tv-shell";

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return <TvShell>{children}</TvShell>;
}
