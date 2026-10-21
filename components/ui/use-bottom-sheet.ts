"use client";

import { useEffect, useState } from "react";

/**
 * כרטיס צף קבוע בתחתית המסך (בחירת משבצת בלוח) מכסה את סוף העמוד. ה-hook
 * מודד את גובהו כדי:
 * (1) להחזיר spacerHeight — ריווח בתחתית העמוד באותו גובה, אחרת אי אפשר
 *     לגלול עד המשבצות של הערב והן נשארות מאחורי הכרטיס (נייד, 18/10); ו-
 * (2) לגלול את המשבצת שנבחרה ([data-selected="true"] האחרונה) אל מעל הכרטיס
 *     בכל פעם ש-selectionKey משתנה.
 *
 * sheetRef הולך על העטיפה הקבועה (fixed) של הכרטיס.
 */
export function useBottomSheet(selectionKey: string | null) {
  const [sheetEl, setSheetEl] = useState<HTMLDivElement | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    if (!sheetEl) return;
    const observer = new ResizeObserver(([entry]) => setSheetHeight(entry.target.getBoundingClientRect().height));
    observer.observe(sheetEl);
    return () => observer.disconnect();
  }, [sheetEl]);

  useEffect(() => {
    if (!selectionKey || sheetHeight === 0) return;
    const cells = document.querySelectorAll<HTMLElement>('[data-selected="true"]');
    const last = cells[cells.length - 1];
    if (!last) return;
    const hiddenBy = last.getBoundingClientRect().bottom - (window.innerHeight - sheetHeight);
    if (hiddenBy > 0) window.scrollBy({ top: hiddenBy + 8, behavior: "smooth" });
  }, [selectionKey, sheetHeight]);

  return { sheetRef: setSheetEl, spacerHeight: selectionKey ? sheetHeight : 0 };
}
