import Link from "next/link";
import { columnLetter } from "@/lib/discreet";

export interface ProjectRow {
  id: string;
  name: string;
  dateRange: string;
  status: string;
  locations: number;
}

const HEADERS = ["Project", "Status", "Schedule", "Items"];

export function ProjectTable({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left text-xs font-medium text-muted-foreground">
            {HEADERS.map((h, i) => (
              <th key={h} className="border border-border px-3 py-1.5 font-mono font-normal">
                <span className="mr-2 text-muted-foreground/60">{columnLetter(i)}</span>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="hover:bg-accent">
              <td className="border border-border px-3 py-1.5">
                <Link href={`/trips/${p.id}`} className="font-medium text-foreground hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="border border-border px-3 py-1.5 text-muted-foreground">{p.status}</td>
              <td className="border border-border px-3 py-1.5 font-mono text-muted-foreground">{p.dateRange}</td>
              <td className="border border-border px-3 py-1.5 font-mono text-right text-muted-foreground">{p.locations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
