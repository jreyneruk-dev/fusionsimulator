import Dashboard from "@/components/Dashboard";
import { HIVE } from "@/content/bees";

export default function Home() {
  return (
    <main className="wrap py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-hive">🐝 {HIVE.title}</h1>
      <p className="mt-1 text-sm text-wax">{HIVE.subtitle}</p>
      <Dashboard />
    </main>
  );
}
