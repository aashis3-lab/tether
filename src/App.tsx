import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { InstallBanner } from './components/InstallBanner'
import { SchemaCheck } from './components/SchemaCheck'
import { Toaster } from './components/Toaster'
import { Spinner } from './components/ui'
import { ActiveSession } from './screens/ActiveSession'
import { DestinationScreen } from './screens/Destination'
import { GuardianView } from './screens/GuardianView'
import { Home } from './screens/Home'
import { InviteScreen } from './screens/InviteScreen'
import { JoinSession } from './screens/JoinSession'
import { PartyDetail } from './screens/PartyDetail'
import { PartyHistory } from './screens/PartyHistory'
import { StartGuardian, StartName, StartWhen } from './screens/StartFlow'
import { GetHomeScreen } from './screens/session/GetHomeScreen'
import { HelpScreen } from './screens/session/HelpScreen'
import { PingScreen } from './screens/session/PingScreen'
import { SessionShell } from './screens/session/SessionShell'
import { UpdateScreen } from './screens/session/UpdateScreen'
import { Settings } from './screens/Settings'
import { SignUp } from './screens/SignUp'

/** Sends signed-out users (or users without a profile) through sign-up, then back. */
function RequireProfile({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!profile) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/signup?next=${next}`} replace />
  }
  return <>{children}</>
}

function AuthGate() {
  const { loading } = useAuth()
  if (loading) return <Spinner />
  return <SignUp />
}

export default function App() {
  return (
    <AuthProvider>
      <SchemaCheck />
      <Toaster />
      <InstallBanner />
      <Routes>
        <Route path="/signup" element={<AuthGate />} />
        <Route path="/" element={<RequireProfile><Home /></RequireProfile>} />
        <Route path="/profile" element={<RequireProfile><Settings /></RequireProfile>} />
        <Route path="/settings" element={<RequireProfile><Settings /></RequireProfile>} />
        <Route path="/start" element={<Navigate to="/start/where" replace />} />
        <Route path="/start/where" element={<RequireProfile><DestinationScreen /></RequireProfile>} />
        <Route path="/start/when" element={<RequireProfile><StartWhen /></RequireProfile>} />
        <Route path="/start/guardian" element={<RequireProfile><StartGuardian /></RequireProfile>} />
        <Route path="/start/name" element={<RequireProfile><StartName /></RequireProfile>} />
        <Route path="/plan/destination" element={<Navigate to="/start/where" replace />} />
        <Route path="/history" element={<RequireProfile><PartyHistory /></RequireProfile>} />
        <Route path="/history/:id" element={<RequireProfile><PartyDetail /></RequireProfile>} />
        <Route path="/join" element={<RequireProfile><JoinSession /></RequireProfile>} />
        <Route path="/join/:code" element={<RequireProfile><JoinSession /></RequireProfile>} />
        <Route path="/session/:id" element={<RequireProfile><SessionShell /></RequireProfile>}>
          <Route index element={<ActiveSession />} />
          <Route path="invite" element={<InviteScreen />} />
          <Route path="ping" element={<PingScreen />} />
          <Route path="help" element={<HelpScreen />} />
          <Route path="update" element={<UpdateScreen />} />
          <Route path="home" element={<GetHomeScreen />} />
        </Route>
        <Route path="/guardian/:token" element={<GuardianView />} />
        <Route path="/g/:token" element={<GuardianView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
