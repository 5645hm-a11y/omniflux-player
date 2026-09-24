/**
 * כתובת ההטמעה של YouTube לטריילר, בשפת הממשק.
 *
 * שלושה פרמטרים שהגרסה הקודמת לא העבירה, ולכן הנגן נפתח בשפת
 * הדפדפן ולא בשפה שהמשתמש בחר:
 *
 *   hl             — שפת הנגן עצמו: כפתורים, תפריט הכתוביות
 *   cc_lang_pref   — שפת הכתוביות המועדפת
 *   cc_load_policy — להדליק כתוביות מיד, ולא לחכות שהמשתמש ימצא אותן
 *
 * הכתוביות נדלקות רק כשהטריילר אינו בשפת הממשק. טריילר צרפתי עם
 * כתוביות צרפתיות מכפיל את מה שכבר שומעים; טריילר אנגלי למשתמש
 * עברי — המצב הנפוץ, כי טריילרים מדובבים לעברית נדירים — הוא בדיוק
 * המקום שבו הן נחוצות.
 */
export function trailerUrl(key: string, uiLanguage: string, trailerLanguage: string | null | undefined): string {
  const ui = uiLanguage.split('-')[0].toLowerCase()
  const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', hl: ui, cc_lang_pref: ui })
  if (trailerLanguage?.toLowerCase() !== ui) params.set('cc_load_policy', '1')
  return `https://www.youtube-nocookie.com/embed/${key}?${params.toString()}`
}
