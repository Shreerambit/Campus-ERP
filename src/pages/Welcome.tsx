import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ShieldCheck, User, ArrowRight, Crown, Users2 } from 'lucide-react';
import { GradCapIcon } from '../components/Shell';

const CARDS = [
  { role: 'student', label: 'Student',       to: '/login/student',
    icon: GraduationCap, gradient: 'from-ios-blue to-ios-indigo',
    desc: 'Attendance, timetable, marks, leaderboard.' },
  { role: 'teacher', label: 'Teacher',       to: '/login/teacher',
    icon: User,        gradient: 'from-ios-purple to-ios-pink',
    desc: 'Assigned classes, attendance, materials.' },
  { role: 'admin',   label: 'College Admin', to: '/login/admin',
    icon: ShieldCheck, gradient: 'from-ios-orange to-ios-red',
    desc: 'Manage your college — imports, students, timetable.' },
  { role: 'parent',  label: 'Parent',        to: '/login/parent',
    icon: Users2,      gradient: 'from-ios-green to-ios-teal',
    desc: 'View your child\u2019s progress and notices.' }
];

export default function Welcome() {
  const nav = useNavigate();
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-8">
      <div className="pointer-events-none absolute inset-0 -z-10"
           style={{ background:
             'radial-gradient(600px 400px at 20% 10%, rgba(10,132,255,.35), transparent), radial-gradient(500px 500px at 80% 90%, rgba(191,90,242,.35), transparent)' }} />

      <div className="w-full max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <img src="/brand-icon.png?v=5" alt="Campus ERP"
               className="mx-auto h-24 w-24 sm:h-28 sm:w-28 rounded-[22%] shadow-hi animate-floaty"/>
          <h1 className="mt-5 sm:mt-6 h-display bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg,#307DFF 0%,#3C3DFF 55%,#7F23FF 100%)' }}>
            Welcome to Campus ERP
          </h1>
          <p className="mt-2 text-sm opacity-70 px-2">A premium, universal College ERP. Any college. Any device.</p>
          <p className="mt-4 sm:mt-6 text-sm sm:text-[15px] opacity-80">Choose your role to continue</p>
        </motion.div>

        <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
          {CARDS.map((c, i) => (
            <motion.button
              key={c.role}
              onClick={() => nav(c.to)}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.08 + i * 0.05, ease: [0.2, 0.7, 0.2, 1] }}
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="text-left rounded-3xl sm:rounded-4xl p-4 sm:p-5 md:p-6 glass shadow-card hover:shadow-hi transition"
            >
              <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl grid place-items-center text-white shadow-hi bg-gradient-to-br ${c.gradient}`}>
                <c.icon size={22}/>
              </div>
              <div className="mt-3 sm:mt-4 text-[16px] sm:text-[18px] font-bold tracking-tight">{c.label}</div>
              <div className="mt-1 text-[12px] sm:text-[13px] opacity-70 leading-snug">{c.desc}</div>
              <div className="mt-3 sm:mt-4 flex items-center gap-1.5 text-[12px] sm:text-[13px] font-semibold text-ios-blue">
                Continue <ArrowRight size={14}/>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="mt-8 sm:mt-10 flex flex-col items-center gap-3">
          <button onClick={() => nav('/login/super')}
            className="chip !text-ios-orange">
            <Crown size={12}/> Super Admin sign-in
          </button>
          <p className="text-[11px] opacity-50 text-center px-4">
            Your session is stored securely on this device. Never share credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
