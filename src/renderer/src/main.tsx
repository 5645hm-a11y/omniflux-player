import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './styles/app.css'
import App from './App'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {/*
      ‏reducedMotion="user" — ההעדפה של המערכת חלה גם כאן.

      הכלל הגלובלי ב-app.css מאפס משכי מעבר של CSS, אבל האנימציות של
      motion/react רצות ב-JavaScript ואינן רואות אותו: משתמש שכיבה
      תנועה ב-Windows המשיך לראות כל כרטיס עולה וכל מסך מחליק. כאן
      התנועה (transform) נכבית והשקיפות נשמרת — עדינה יותר, לא אפסית.
    */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>
)
