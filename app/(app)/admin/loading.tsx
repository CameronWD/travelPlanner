import { ListSkeleton } from "@/components/ui/skeletons";

/**
 * Loading state for the Admin console (access requests, allowlist, error
 * reports) — three stacked row-based panels, no form fields anywhere on the
 * page. `rows={6}`: roughly two representative rows per panel, flattened
 * into ListSkeleton's single list (it has no notion of separate cards), so
 * the skeleton reads as "a fuller list" without manufacturing a row count
 * tied to any panel's real, variable length.
 */
export default function AdminLoading() {
  return <ListSkeleton rows={6} label="Loading admin" />;
}
