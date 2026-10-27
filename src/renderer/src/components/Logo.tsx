export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="1" y="1" width="32" height="32" rx="8" fill="#3977F6" />
      <path d="M11 9v16m12-16-9 8 9 8" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[21px] font-bold tracking-[-0.01em]">Kisara</span>
        <span className="mt-[3px] text-[10.5px] font-medium text-muted">Studio cerita & video</span>
      </span>
    </span>
  )
}
