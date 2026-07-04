import Link from "next/link";
import { APP_NAME } from "@/lib/document-title";
import { routes } from "@/lib/routes";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        404
      </p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        That route does not exist in {APP_NAME}.
      </p>
      <Link
        href={routes.home()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to home
      </Link>
    </div>
  );
}
