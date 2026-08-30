import { Suspense, lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import Shell from './components/Shell';
import { RequireAuth, OnlyWhenLoggedOut } from './components/Protected';

const Welcome       = lazy(() => import('./pages/Welcome'));
const StudentLogin  = lazy(() => import('./pages/StudentLogin'));
const TeacherLogin  = lazy(() => import('./pages/TeacherLogin'));
const AdminLogin    = lazy(() => import('./pages/AdminLogin'));
const ParentLogin   = lazy(() => import('./pages/ParentLogin'));
const SuperLogin    = lazy(() => import('./pages/SuperLogin'));
const FirstLogin    = lazy(() => import('./pages/FirstLogin'));
const SectionPicker = lazy(() => import('./pages/SectionPicker'));
const StudentProfile= lazy(() => import('./pages/StudentProfile'));

const Dashboard   = lazy(() => import('./pages/Dashboard'));
const Attendance  = lazy(() => import('./pages/Attendance'));
const Timetable   = lazy(() => import('./pages/Timetable'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Directory   = lazy(() => import('./pages/Directory'));
const Academics   = lazy(() => import('./pages/Academics'));
const Leave       = lazy(() => import('./pages/Leave'));
const Profile     = lazy(() => import('./pages/Profile'));
const ImportCenter= lazy(() => import('./pages/ImportCenter'));
const SuperAdmin  = lazy(() => import('./pages/SuperAdmin'));
const AdminStudents = lazy(() => import('./pages/AdminStudents'));
const AdminTeachers = lazy(() => import('./pages/AdminTeachers'));
const AdminTimetable = lazy(() => import('./pages/AdminTimetable'));
const Notices      = lazy(() => import('./pages/Notices'));
const Notes        = lazy(() => import('./pages/Notes'));
const ErpAI        = lazy(() => import('./pages/ErpAI'));

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        {/* Public */}
        <Route path="/welcome"       element={<OnlyWhenLoggedOut><Welcome /></OnlyWhenLoggedOut>} />
        <Route path="/login/student" element={<OnlyWhenLoggedOut><StudentLogin /></OnlyWhenLoggedOut>} />
        <Route path="/login/teacher" element={<OnlyWhenLoggedOut><TeacherLogin /></OnlyWhenLoggedOut>} />
        <Route path="/login/admin"   element={<OnlyWhenLoggedOut><AdminLogin /></OnlyWhenLoggedOut>} />
        <Route path="/login/parent"  element={<OnlyWhenLoggedOut><ParentLogin /></OnlyWhenLoggedOut>} />
        <Route path="/login/super"   element={<OnlyWhenLoggedOut><SuperLogin /></OnlyWhenLoggedOut>} />
        <Route path="/login"         element={<Navigate to="/welcome" replace />} />

        {/* Super admin */}
        <Route path="/super" element={<RequireAuth roles={['super']}><SuperAdmin /></RequireAuth>} />

        {/* First-login guard (students AND teachers) */}
        <Route path="/first-login" element={<RequireAuth roles={['student','teacher']}><FirstLogin /></RequireAuth>} />
        <Route path="/pick-section" element={<RequireAuth roles={['student']}><SectionPicker /></RequireAuth>} />

        {/* Protected app shell */}
        <Route element={<RequireAuth roles={['student','teacher','admin','parent']}><Shell /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/attendance"  element={
            <RequireAuth roles={['teacher','admin']}><Attendance /></RequireAuth>
          } />
          <Route path="/timetable"   element={<Timetable />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/directory"   element={<Directory />} />
          <Route path="/academics"   element={<Academics />} />
          <Route path="/leave"       element={<Leave />} />
          <Route path="/notices"     element={<Notices />} />
          <Route path="/notes"       element={<Notes />} />
          <Route path="/erp-ai" element={
            <RequireAuth roles={['student']}><ErpAI /></RequireAuth>
          } />
          <Route path="/import"      element={<ImportCenter />} />
          <Route path="/admin/students"  element={<AdminStudents />} />
          <Route path="/admin/teachers"  element={<AdminTeachers />} />
          <Route path="/admin/timetable" element={<AdminTimetable />} />
          <Route path="/profile"         element={<Profile />} />
          <Route path="/students/:regNo" element={<StudentProfile />} />
        </Route>

        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </Suspense>
  );
}

function Fallback() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="h-10 w-10 rounded-full border-2 border-black/10 border-t-ios-blue animate-spin" />
    </div>
  );
}
