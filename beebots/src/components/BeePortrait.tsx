/** Our own bee portraits (original SVGs — his Bizzy/Breezy/Boozy art is his brand). */

const PALETTES: Record<string, { body: string; stripe: string; wing: string }> = {
  waggle: { body: "#f59e0b", stripe: "#78350f", wing: "#fde68a" }, // amber, the grinder
  hover: { body: "#38bdf8", stripe: "#0c4a6e", wing: "#e0f2fe" }, // sky, the patient one
  sting: { body: "#f472b6", stripe: "#831843", wing: "#fce7f3" }, // pink, the degen
};

export default function BeePortrait({ beeId, size = 56 }: { beeId: string; size?: number }) {
  const p = PALETTES[beeId] ?? PALETTES.waggle;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${beeId} portrait`}>
      <circle cx="32" cy="32" r="30" fill={p.wing} />
      <ellipse cx="24" cy="22" rx="10" ry="6" fill="#ffffff" opacity="0.8" transform="rotate(-24 24 22)" />
      <ellipse cx="42" cy="20" rx="9" ry="5" fill="#ffffff" opacity="0.6" transform="rotate(18 42 20)" />
      <ellipse cx="34" cy="36" rx="14" ry="11" fill={p.body} stroke={p.stripe} strokeWidth="1.5" />
      <path d="M26 27 h16 M25 33 h18 M26 39 h16" stroke={p.stripe} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="20" cy="34" r="7.5" fill={p.body} stroke={p.stripe} strokeWidth="1.5" />
      <circle cx="18" cy="32.5" r="1.6" fill="#1c1917" />
      <circle cx="22.5" cy="32.5" r="1.6" fill="#1c1917" />
      <path d="M14 30 l-4 -3 M15 36 l-4 3" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M46 33 l6 -2 M46 37 l6 2" stroke={p.stripe} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
