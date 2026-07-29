import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import NavShell from './components/NavShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProjectsListPage from './pages/ProjectsListPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import CompanyInfoPage from './pages/CompanyInfoPage.jsx';
import UsersPage from './pages/UsersPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <NavShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsListPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/company-info" element={<CompanyInfoPage />} />
          <Route
            path="/users"
            element={
              <ProtectedRoute adminOnly>
                <UsersPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </AuthProvider>
  );
}
