-- עדכון שמות חדרים לתיאור פונקציונלי (במקום "Room N" גנרי).
-- מיפוי לפי (branch_id, sort_order) היציב מה-seed — לא לפי id, כי לחדרים אין id קבוע.

-- ═══ הוד השרון ═══
update rooms set name = 'חדר 1 - זוגי/פרטני'
  where branch_id = '00000000-0000-0000-0000-000000000001' and sort_order = 1;
update rooms set name = 'חדר 2 - זוגי/פרטני'
  where branch_id = '00000000-0000-0000-0000-000000000001' and sort_order = 2;
update rooms set name = 'חדר 3 - זוגי/פרטני'
  where branch_id = '00000000-0000-0000-0000-000000000001' and sort_order = 3;
update rooms set name = 'חדר 4 - זוגי/פרטני עם אפשרות למיטת טיפולים'
  where branch_id = '00000000-0000-0000-0000-000000000001' and sort_order = 4;
update rooms set name = 'חדר 5 - מיטת טיפולים'
  where branch_id = '00000000-0000-0000-0000-000000000001' and sort_order = 5;

-- ═══ נווה ימין ═══
update rooms set name = 'חדר פגישות'
  where branch_id = '00000000-0000-0000-0000-000000000002' and sort_order = 1;
update rooms set name = 'חדר 2 - זוגי/פרטני'
  where branch_id = '00000000-0000-0000-0000-000000000002' and sort_order = 2;
update rooms set name = 'חדר 3 - מיטת טיפולים'
  where branch_id = '00000000-0000-0000-0000-000000000002' and sort_order = 3;
update rooms set name = 'חדר 4 - זוגי/פרטני'
  where branch_id = '00000000-0000-0000-0000-000000000002' and sort_order = 4;
update rooms set name = 'חדר 5 - זוגי/פרטני'
  where branch_id = '00000000-0000-0000-0000-000000000002' and sort_order = 5;
