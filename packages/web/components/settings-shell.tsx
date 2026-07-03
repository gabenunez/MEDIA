import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {description ? (
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}
