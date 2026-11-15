/**
 * הודעת "מה חדש" שקופצת פעם אחת לכל משתמש/ת. מה שכבר נראה נשמר ב-
 * user_metadata.whats_new_seen של Supabase Auth — בחשבון, לא בדפדפן, כך שלא
 * חוזר במכשיר אחר. הודעה חדשה בעתיד = מפתח חדש (כולם יראו אותה פעם אחת).
 *
 * לראות שוב (לבדיקה): update auth.users set raw_user_meta_data =
 *   raw_user_meta_data - 'whats_new_seen' where id = '<uuid>';
 */
export const WHATS_NEW_KEY = "2026-11-schedule";
