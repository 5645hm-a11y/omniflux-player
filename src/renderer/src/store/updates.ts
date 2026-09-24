import { create } from 'zustand'
import type { UpdateStatus } from '@shared/api'

/**
 * מצב העדכון, במקום אחד לכל הממשק.
 *
 * קודם הוא היה ידוע רק למסך ההגדרות: מי שלא נכנס לשם לא ידע שיש
 * גרסה חדשה, גם אחרי שהיא כבר ירדה והמתינה. עכשיו הסרגל מסמן שיש
 * משהו, וכשהעדכון מוכן להתקנה מופיעה כרזה עם הפעולה עצמה.
 *
 * הכרזה נדחית לפי גרסה: מי שסגר אותה לא יראה אותה שוב עד הגרסה
 * הבאה. הסימון בסרגל נשאר, כי הוא שקט ואינו חוסם דבר.
 */

const DISMISSED = 'omniflux.update.dismissed'

interface UpdateStore {
  state: UpdateStatus
  dismissedVersion: string | null
  init: () => void
  dismiss: () => void
}

function remembered(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED)
  } catch {
    return null
  }
}

export const useUpdates = create<UpdateStore>((set, get) => ({
  state: { status: 'idle' },
  dismissedVersion: remembered(),

  init: () => {
    void window.cinema.updates.state().then((state) => set({ state }))
    window.cinema.updates.onState((state) => set({ state }))
  },

  dismiss: () => {
    const state = get().state
    const version = 'version' in state ? state.version : null
    set({ dismissedVersion: version })
    try {
      if (version) window.localStorage.setItem(DISMISSED, version)
    } catch {
      /* בלי אחסון מקומי הכרזה פשוט תחזור בהפעלה הבאה */
    }
  }
}))

/** יש גרסה חדשה — סימון שקט בסרגל */
export function useUpdatePending(): boolean {
  return useUpdates((s) => ['available', 'downloading', 'ready'].includes(s.state.status))
}

/** העדכון ירד וממתין להפעלה מחדש, והמשתמש לא סגר את ההודעה */
export function useUpdateReady(): string | null {
  return useUpdates((s) => {
    if (s.state.status !== 'ready') return null
    return s.state.version === s.dismissedVersion ? null : s.state.version
  })
}
