import { useEffect, useState } from 'react'

/**
 * הפריים האחרון שהמנוע שלח, כתמונה שאפשר להציג.
 *
 * חלון הווידאו הוא חלון נפרד שיושב מתחת לממשק, ולכן "וידאו קטן
 * בתוך סרגל הנגן" אינו אלמנט אלא בעיה של סדר חלונות. שקיפות אינה
 * פותרת אותה: אלמנט שקוף מראה את הרקע של ההורה שלו, והסרגל צובע
 * זכוכית מתחתיו. חור אמיתי היה מחייב לנקב מסכה בכל שכבה אטומה
 * בדרך, וחלון וידאו שצף מעל היה צף גם מעל תוכנות אחרות.
 *
 * מה שכן זמין הוא הפריים עצמו: המנוע מצלם אחד כל 1.6 שניות בשביל
 * תאורת האווירה, והבתים כבר עוברים לממשק. אותו פריים משמש כאן
 * כתמונה ממוזערת — בגודל 96 על 54 פיקסלים ההבדל בין 0.6 פריימים
 * לשנייה לבין וידאו מלא כמעט אינו נראה, והמעבר הרך בין פריימים
 * מסתיר את הקפיצה.
 */
export function useLastFrame(active: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setUrl(null)
      return
    }
    let current: string | null = null
    const off = window.cinema.player.onFrame((bytes) => {
      const next = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
      // כתובת ה-blob הקודמת משוחררת מיד: בלי זה כל פריים דולף לזיכרון
      if (current) URL.revokeObjectURL(current)
      current = next
      setUrl(next)
    })
    return () => {
      off()
      if (current) URL.revokeObjectURL(current)
      setUrl(null)
    }
  }, [active])

  return url
}
