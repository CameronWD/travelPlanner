import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <h1 className="text-display">Trip Planner</h1>
      <p className="max-w-md text-muted-foreground">
        Plan and run a holiday together.
      </p>
    </main>
  );
}
