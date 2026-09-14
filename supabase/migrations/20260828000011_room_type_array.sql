-- rooms.room_type: ממנה בודדת למערך. חדר יכול לשרת יותר מסוג טיפול אחד —
-- זה כבר קיים בפועל (תיאורי "מגע+שיח" בחדרי נווה ימין ב-seed), אבל הסינון
-- באפליקציה לא זיהה זאת כי room_type היה ערך יחיד. אף RPC לא תלוי בעמודה
-- הזו (רק מסכי אדמין/מטפלים קוראים אותה) — ההמרה בטוחה.

alter table rooms add column room_type_new room_type[] not null default '{}';
update rooms set room_type_new = array[room_type];
alter table rooms drop column room_type;
alter table rooms rename column room_type_new to room_type;
alter table rooms alter column room_type set default array['talk']::room_type[];
alter table rooms add constraint room_type_not_empty check (array_length(room_type, 1) > 0);

-- חדר 4 בהוד השרון: יש בו אפשרות למיטת טיפולים (ר' rename_rooms.sql —
-- "זוגי/פרטני עם אפשרות למיטת טיפולים") — כלומר משמש גם לטיפולי שיח וגם
-- למגע. מעתה יופיע בסינון תחת שני הסוגים.
update rooms set room_type = array['talk', 'touch']::room_type[]
  where branch_id = '00000000-0000-0000-0000-000000000001' and sort_order = 4;
