// TODO: להחליף בקובץ המיוצר אוטומטית לאחר קישור לפרויקט Supabase:
//   supabase gen types typescript --project-id <id> > lib/supabase/types.ts
// עד אז — טיפוס מינימלי כדי שהקליינטים יתקמפלו בלי any.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
