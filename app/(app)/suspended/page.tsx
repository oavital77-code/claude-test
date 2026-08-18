export default function SuspendedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">החשבון מושעה</h1>
      <p className="max-w-sm text-muted-foreground">
        החשבון מושעה זמנית, לרוב עקב חיוב שנכשל. לפרטים יש לפנות להנהלת בקליניקה.
      </p>
    </div>
  );
}
