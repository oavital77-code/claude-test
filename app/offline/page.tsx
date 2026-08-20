export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">אין חיבור לאינטרנט</h1>
      <p className="max-w-sm text-muted-foreground">
        לוח הזמנים, היתרות וההזמנות דורשים חיבור פעיל. יש להתחבר לרשת ולנסות שוב.
      </p>
    </div>
  );
}
