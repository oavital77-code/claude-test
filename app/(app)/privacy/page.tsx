import { PRIVACY_TEXT } from "@/lib/privacy/current";

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">מדיניות פרטיות</h1>
      <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {PRIVACY_TEXT}
      </div>
    </div>
  );
}
