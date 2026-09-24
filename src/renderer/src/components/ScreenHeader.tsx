/**
 * כותרת מסך.
 *
 * קודם כל מסך נשא כותרת משלו עם הלוגו וכפתור סגירה — כי כל מסך היה
 * חלון בפני עצמו. עם סרגל צד קבוע שניהם מיותרים: הלוגו כבר בסרגל,
 * והסגירה היא מעבר ליעד אחר.
 *
 * מה שנשאר הוא מה שבאמת שייך למסך: שמו, ומה שאפשר לעשות בו.
 *
 * הרווח בקצה שמור לפקדי החלון. הם יושבים מעל כל המסכים באותה פינה,
 * וכל דבר שנכנס תחתיהם הופך לכפתור שנלחץ בטעות — זה בדיוק מה שקרה
 * כשהניווט ישב שם.
 */
export function ScreenHeader({
  title,
  subtitle,
  actions,
  className = ''
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    // ‏pr-32 פיזי ולא לוגי: פקדי החלון יושבים תמיד בימין הפיזי, גם
    // בממשק ימין-שמאל, ולכן גם הפינוי להם אינו מתהפך עם השפה
    <header className={`drag relative z-10 flex items-center gap-4 py-6 pr-32 pl-8 rtl:pr-8 ${className}`}>
      <div className="min-w-0">
        <h1 className="font-display truncate text-[22px] leading-tight font-extrabold">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{subtitle}</p>}
      </div>
      <div className="no-drag ms-auto flex items-center gap-2">{actions}</div>
    </header>
  )
}
