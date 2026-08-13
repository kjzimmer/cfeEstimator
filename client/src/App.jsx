import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import NavShell from './components/NavShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProjectsListPage from './pages/ProjectsListPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import CompanyInfoPage from './pages/CompanyInfoPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import MemoryReviewPage from './pages/MemoryReviewPage.jsx';
import CustomersListPage from './pages/CustomersListPage.jsx';
import CustomerDetailPage from './pages/CustomerDetailPage.jsx';

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
          <Route path="/customers" element={<CustomersListPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/company-info" element={<CompanyInfoPage />} />
          <Route
            path="/users"
            element={
              <ProtectedRoute adminOnly>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/memory"
            element={
              <ProtectedRoute adminOnly>
                <MemoryReviewPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </AuthProvider>
  );
}
