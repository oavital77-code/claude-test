export function LtrNum({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`ltr-num ${className}`} dir="ltr">
      {children}
    </span>
  );
}
